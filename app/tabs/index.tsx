// app/tabs/index.tsx
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { collection, getDocs } from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  FlatList,
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { theme } from '../../constants/colors';
import { useAuth } from '../../context/AuthContext';
import { useExploreHighlight } from '../../context/ExploreHighlightContext';
import { db } from '../../firebase';
import { logoutUser } from '../../hooks/authHelpers';

const DEFAULT_IMAGE = require('../../assets/images/defaultshake.png');

type BaseShop = {
  id: string;
  name: string;
  rating: number | null;
  latitude: number;
  longitude: number;
  image: any;
  // FUTURE: maintained server-side (e.g. Cloud Function)
  // “how much did the average rating move in the last 24h?”
  ratingDelta24h?: number | null;
};

// Core shops with real coordinates – used everywhere
const CORE_SHOPS: BaseShop[] = [
  {
    id: '1',
    name: "Captain Morgan's",
    rating: 4.5,
    latitude: -38.6704,
    longitude: 178.0169,
    image: require('../../assets/images/captainmorgans.png'),
    ratingDelta24h: 0,
  },
  {
    id: '2',
    name: 'Te Poi Cafe',
    rating: 4.5,
    latitude: -37.8724,
    longitude: 175.8423,
    image: require('../../assets/images/tepoicafe.png'),
    ratingDelta24h: 0,
  },
  {
    id: '3',
    name: 'Hot Bread Shop Cafe',
    rating: 4.0,
    latitude: -38.0118,
    longitude: 177.2869,
    image: require('../../assets/images/hotbreadshop.png'),
    ratingDelta24h: 0,
  },
];

type NearestShop = BaseShop & {
  distanceKm: number;
};

const SHAKE_OF_DAY_RADIUS_KM = 10;

// Simple haversine distance in km
function distanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371; // Earth radius (km)
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const HomeScreen = () => {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { setShowExploreHighlight } = useExploreHighlight();

  const [walkthroughStep, setWalkthroughStep] = useState(0);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showWalkthrough, setShowWalkthrough] = useState(false);
  const [profileMenuVisible, setProfileMenuVisible] = useState(false);

  const [nearestShops, setNearestShops] = useState<NearestShop[]>([]);
  const [shakeOfTheDay, setShakeOfTheDay] = useState<NearestShop | null>(null);

  const scaleAnim = useRef(new Animated.Value(1)).current;

  const walkthroughTapOverride = () => {
    if (walkthroughStep < 3) {
      handlePress();
    }
  };

  // Pulsing “Add shake” icon during walkthrough
  useEffect(() => {
    if (walkthroughStep === 0 && showWalkthrough) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(scaleAnim, {
            toValue: 1.2,
            duration: 500,
            easing: Easing.ease,
            useNativeDriver: true,
          }),
          Animated.timing(scaleAnim, {
            toValue: 1,
            duration: 500,
            easing: Easing.ease,
            useNativeDriver: true,
          }),
        ]),
      ).start();
    } else {
      scaleAnim.setValue(1);
    }
  }, [walkthroughStep, showWalkthrough, scaleAnim]);

  // Walkthrough show/hide
  useEffect(() => {
    const init = async () => {
      const hasSeen = await AsyncStorage.getItem('hasSeenWalkthrough');

      if (!user && hasSeen !== 'true') {
        setShowWalkthrough(true);
        setWalkthroughStep(0);
      } else {
        setShowWalkthrough(false);
        setWalkthroughStep(3);
      }
    };

    if (!loading) {
      init();
    }
  }, [user, loading]);

  // Load 3 nearest shops (core + cloud) and compute Shake of the Day.
  // ratingDelta24h is expected to be maintained in Firestore later.
  useEffect(() => {
    const loadNearest = async () => {
      try {
        // 1) Location permission + current position
        const { status } =
          await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          console.log('Location permission not granted');
          return;
        }

        const loc = await Location.getCurrentPositionAsync({});
        const userLat = loc.coords.latitude;
        const userLon = loc.coords.longitude;

        // 2) Load cloud shops from Firestore
        const snap = await getDocs(collection(db, 'shops'));

        const cloud: BaseShop[] = snap.docs
          .map(doc => {
            const data = doc.data() as any;

            // FUTURE: when you wire Google Places / geocoding, make sure
            // you write latitude & longitude onto each shop document.
            const lat =
              typeof data.latitude === 'number'
                ? data.latitude
                : data.latitude
                ? Number(data.latitude)
                : null;
            const lon =
              typeof data.longitude === 'number'
                ? data.longitude
                : data.longitude
                ? Number(data.longitude)
                : null;

            if (lat == null || lon == null) {
              // No coords yet → can’t use for “nearest” logic
              return null;
            }

            const rating =
              typeof data.rating === 'number'
                ? data.rating
                : data.rating
                ? Number(data.rating)
                : null;

            const delta =
              typeof data.ratingDelta24h === 'number'
                ? data.ratingDelta24h
                : data.ratingDelta24h
                ? Number(data.ratingDelta24h)
                : 0;

            return {
              id: doc.id,
              name: data.name ?? 'Unnamed shop',
              rating: rating ?? null,
              latitude: lat,
              longitude: lon,
              image: DEFAULT_IMAGE, // until real photos are wired in
              ratingDelta24h: delta,
            } as BaseShop;
          })
          .filter(Boolean) as BaseShop[];

        // 3) Combine core + cloud and compute distance
        const all: BaseShop[] = [...CORE_SHOPS, ...cloud];

        if (!all.length) {
          return;
        }

        const withDistance: NearestShop[] = all.map(shop => ({
          ...shop,
          distanceKm: distanceKm(
            userLat,
            userLon,
            shop.latitude,
            shop.longitude,
          ),
        }));

        // Sort by distance and keep the closest 3 for the list
        withDistance.sort((a, b) => a.distanceKm - b.distanceKm);
        setNearestShops(withDistance.slice(0, 3));

        // 4) Shake of the Day logic:
        //    - Look only at shops within 10 km.
        //    - If any have positive ratingDelta24h, pick the biggest.
        //    - Otherwise, pick the highest-rated within 10 km.
        //    - If literally nothing in 10 km, fall back to best overall.
        const withinRadius = withDistance.filter(
          s => s.distanceKm <= SHAKE_OF_DAY_RADIUS_KM,
        );

        let top: NearestShop | null = null;

        if (withinRadius.length) {
          const positiveDelta = withinRadius.filter(
            s => (s.ratingDelta24h ?? 0) > 0,
          );

          if (positiveDelta.length > 0) {
            // Biggest jump in last 24h within 10 km
            top = positiveDelta.reduce((best, current) => {
              const bestDelta = best.ratingDelta24h ?? 0;
              const currentDelta = current.ratingDelta24h ?? 0;
              return currentDelta > bestDelta ? current : best;
            });
          } else {
            // No change → highest-rated within 10 km
            const rated = withinRadius.filter(s => s.rating != null);
            const pool = rated.length ? rated : withinRadius;
            top = pool.reduce((best, current) => {
              const bestRating = best.rating ?? 0;
              const currentRating = current.rating ?? 0;
              return currentRating > bestRating ? current : best;
            });
          }
        } else {
          // No shops in 10 km → fall back to best overall
          const ratedOverall = withDistance.filter(s => s.rating != null);
          const pool = ratedOverall.length ? ratedOverall : withDistance;
          top = pool.reduce((best, current) => {
            const bestRating = best.rating ?? 0;
            const currentRating = current.rating ?? 0;
            return currentRating > bestRating ? current : best;
          });
        }

        setShakeOfTheDay(top);
      } catch (err) {
        console.error('Error loading nearest shops / Shake of the Day:', err);
      }
    };

    loadNearest();
  }, []);

  const finishWalkthrough = async () => {
    await AsyncStorage.setItem('hasSeenWalkthrough', 'true');
    setShowWalkthrough(false);
    setWalkthroughStep(3);
  };

  const handlePress = () => {
    if (walkthroughStep === 1) {
      setShowExploreHighlight(true);
    }

    if (walkthroughStep === 2) {
      finishWalkthrough();
      setShowLoginModal(true);
      return;
    }

    if (walkthroughStep < 2) {
      setWalkthroughStep(prev => prev + 1);
    }
  };

  const handleSkip = () => {
    finishWalkthrough();
  };

  const handleLogout = async () => {
    try {
      await logoutUser();
      setProfileMenuVisible(false);
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  // If we have computed nearest shops, use them.
  // Otherwise fall back to core shops so the screen isn’t empty.
  const listData: BaseShop[] =
    nearestShops.length > 0 ? nearestShops : CORE_SHOPS;

  return (
    <>
      {showWalkthrough && walkthroughStep < 3 && (
        <TouchableOpacity onPress={handleSkip} style={styles.skipButton}>
          <Text style={styles.skipButtonText}>Skip</Text>
        </TouchableOpacity>
      )}

      <SafeAreaView style={styles.container}>
        {/* HEADER BAR */}
        <View style={styles.header}>
          {/* Left: Login/Profile */}
          <TouchableOpacity
            onPress={() => {
              if (!user) {
                setShowLoginModal(true);
              } else {
                setProfileMenuVisible(prev => !prev);
              }
            }}
            style={styles.headerIconButton}
          >
            <Ionicons
              name={user ? 'person' : 'person-outline'}
              size={22}
              color={theme.text.onBrand}
            />
          </TouchableOpacity>

          {/* Right: Add Shake */}
          <Pressable
            onPress={() => router.push('/add-shake')}
            style={[styles.headerIconButton, styles.headerAddButton]}
          >
            <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
              <Ionicons name="add" size={22} color={theme.text.onBrand} />
            </Animated.View>
          </Pressable>
        </View>

        {/* MAIN CONTENT */}
        <Pressable
          style={{ flex: 1 }}
          onPress={
            showWalkthrough && walkthroughStep < 3
              ? walkthroughTapOverride
              : undefined
          }
        >
          {/* ✅ NEW SHAKE-OF-THE-DAY IMAGE BANNER */}
          {shakeOfTheDay && (
            <TouchableOpacity
              style={styles.shakeOfDayBanner}
              activeOpacity={0.9}
              onPress={() => router.push(`/shake/${shakeOfTheDay.id}`)}
            >
              <Image
                source={shakeOfTheDay.image}
                style={styles.shakeOfDayImage}
              />

              <View style={styles.shakeOfDayOverlay}>
                <Text style={styles.shakeOfDayLabel}>Shake of the Day</Text>

                <Text style={styles.shakeOfDayName}>
                  {shakeOfTheDay.name}
                </Text>

                <View style={styles.topFeatureMetaRow}>
                  {shakeOfTheDay.rating != null && (
                    <Text style={styles.shakeOfDayRating}>
                      ⭐ {shakeOfTheDay.rating.toFixed(1)}
                    </Text>
                  )}

                  {typeof shakeOfTheDay.ratingDelta24h === 'number' &&
                    shakeOfTheDay.ratingDelta24h > 0 && (
                      <Text style={styles.shakeOfDayDelta}>
                        ▲ +{shakeOfTheDay.ratingDelta24h.toFixed(1)} in 24h
                      </Text>
                    )}
                </View>
              </View>
            </TouchableOpacity>
          )}

          <FlatList
            data={listData}
            keyExtractor={item => item.id}
            contentContainerStyle={{ paddingBottom: 40 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.card}
                onPress={() => router.push(`/shake/${item.id}`)}
              >
                <Image source={item.image} style={styles.image} />
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.rating}>
                  {item.rating != null ? `⭐ ${item.rating}` : 'No rating yet'}
                </Text>
              </TouchableOpacity>
            )}
          />

          {showWalkthrough && walkthroughStep === 0 && (
            <View style={styles.speechBubble}>
              <Text style={styles.popupText}>Tap here to add a shake!</Text>
            </View>
          )}

          {showWalkthrough && walkthroughStep === 1 && (
            <>
              <View style={styles.explorePopup}>
                <Text style={styles.popupText}>Explore shakes near you!</Text>
              </View>
              <View style={styles.exploreTriangle} />
            </>
          )}

          {showWalkthrough && walkthroughStep === 2 && (
            <>
              <View style={styles.favoritesPopup}>
                <Text style={styles.popupText}>
                  Add favourites and view them here.
                </Text>
              </View>
              <View style={styles.favoritesTriangle} />
            </>
          )}
        </Pressable>
      </SafeAreaView>

      {/* Login Modal */}
      <Modal
        transparent
        animationType="fade"
        visible={showLoginModal}
        onRequestClose={() => setShowLoginModal(false)}
      >
        <View style={styles.modalBackground}>
          <View style={styles.loginModal}>
            <View style={styles.closeButtonWrapper}>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setShowLoginModal(false)}
              >
                <Ionicons name="close" size={24} color={theme.text.primary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalTitle}>
              Save your favourite shakes — log in or register now!
            </Text>
            <View style={{ flexDirection: 'row', marginTop: 20 }}>
              <TouchableOpacity
                style={[
                  styles.authButton,
                  { backgroundColor: theme.controls.buttonPrimaryBg },
                ]}
                onPress={() => {
                  setShowLoginModal(false);
                  router.push('/login');
                  finishWalkthrough();
                }}
              >
                <Text style={styles.authButtonText}>Login</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.authButton,
                  {
                    backgroundColor: theme.controls.buttonSecondaryBg,
                    marginLeft: 10,
                  },
                ]}
                onPress={() => {
                  setShowLoginModal(false);
                  router.push('/signup');
                  finishWalkthrough();
                }}
              >
                <Text style={styles.authButtonText}>Sign Up</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Profile dropdown */}
      <Modal
        transparent
        animationType="fade"
        visible={profileMenuVisible}
        onRequestClose={() => setProfileMenuVisible(false)}
      >
        <View style={styles.profileOverlay}>
          {/* Backdrop only BELOW the header so the icon stays tappable */}
          <TouchableOpacity
            style={styles.profileBackdrop}
            activeOpacity={1}
            onPress={() => setProfileMenuVisible(false)}
          />
          {/* Menu dropping down from the icon */}
          <View style={styles.profileMenu}>
            <Text style={styles.profileTitle}>Profile</Text>
            {user?.email && (
              <Text style={styles.profileEmail}>{user.email}</Text>
            )}

            <TouchableOpacity
              style={[styles.profileButton, { marginTop: 10 }]}
              onPress={() => {}}
            >
              <Text style={styles.profileButtonText}>
                Preferences (coming soon)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.profileButton,
                { backgroundColor: theme.brand.accentSoft, marginTop: 10 },
              ]}
              onPress={handleLogout}
            >
              <Text
                style={[
                  styles.profileButtonText,
                  { color: theme.status.error },
                ]}
              >
                Logout
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
};

export default HomeScreen;

const HEADER_HEIGHT = 60; // matches styles.header.height

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.app.screenBackground,
  },

  header: {
    height: HEADER_HEIGHT,
    paddingHorizontal: 20,
    paddingTop: 5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  headerIconButton: {
    backgroundColor: theme.brand.primary,
    borderRadius: 999,
    padding: 8,
    borderWidth: 1,
    borderColor: theme.brand.primary,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },

  headerAddButton: {
    backgroundColor: theme.brand.primary,
    borderColor: theme.brand.primary,
  },

  /* 🔥 Shake of the Day banner styles */
  shakeOfDayBanner: {
    height: 180,
    marginHorizontal: 12,
    marginTop: 10,
    marginBottom: 15,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: theme.surface.card,
    borderWidth: 1,
    borderColor: theme.surface.border,
  },

  shakeOfDayImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },

  shakeOfDayOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
    padding: 14,
  },

  shakeOfDayLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 4,
    textTransform: 'uppercase',
  },

  shakeOfDayName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
  },

  shakeOfDayRating: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginTop: 4,
  },

  shakeOfDayDelta: {
    fontSize: 13,
    fontWeight: '700',
    color: '#A8FFCF',
    marginTop: 2,
  },

  // Meta row reused inside overlay
  topFeatureMetaRow: {
    flexDirection: 'row',
    marginTop: 6,
    gap: 12,
  },

  card: {
    backgroundColor: theme.surface.card,
    padding: 15,
    borderRadius: 10,
    marginHorizontal: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.surface.border,
  },

  image: {
    width: '100%',
    height: 150,
    borderRadius: 10,
  },

  name: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 5,
    color: theme.text.primary,
  },

  rating: {
    fontSize: 16,
    color: theme.text.secondary,
  },

  speechBubble: {
    position: 'absolute',
    top: 110,
    right: 20,
    backgroundColor: theme.walkthrough.bubbleBg,
    padding: 12,
    borderRadius: 10,
    elevation: 5,
    borderColor: theme.walkthrough.highlightBorder,
    borderWidth: 2,
  },

  popupText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.walkthrough.bubbleText,
  },

  skipButton: {
    position: 'absolute',
    top: 15,
    left: 20,
    zIndex: 10,
  },

  skipButtonText: {
    color: theme.text.primary,
    fontSize: 18,
    fontWeight: 'bold',
  },

  explorePopup: {
    backgroundColor: theme.walkthrough.bubbleBg,
    padding: 12,
    borderRadius: 10,
    elevation: 5,
    borderColor: theme.walkthrough.highlightBorder,
    borderWidth: 2,
    width: 150,
    alignItems: 'center',
    position: 'absolute',
    bottom: 20,
    left: '50%',
    transform: [{ translateX: -75 }],
  },

  exploreTriangle: {
    position: 'absolute',
    bottom: 10,
    left: '50%',
    transform: [{ translateX: -10 }],
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderTopWidth: 10,
    borderStyle: 'solid',
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: theme.walkthrough.highlightBorder,
  },

  favoritesPopup: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 180,
    padding: 12,
    borderRadius: 10,
    backgroundColor: theme.walkthrough.bubbleBg,
    elevation: 5,
    borderColor: theme.walkthrough.highlightBorder,
    borderWidth: 2,
  },

  favoritesTriangle: {
    position: 'absolute',
    bottom: 10,
    right: 43,
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderTopWidth: 10,
    borderStyle: 'solid',
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: theme.walkthrough.highlightBorder,
  },

  modalBackground: {
    flex: 1,
    backgroundColor: theme.surface.overlay,
    justifyContent: 'center',
    alignItems: 'center',
  },

  loginModal: {
    width: 300,
    backgroundColor: theme.surface.card,
    borderRadius: 10,
    padding: 20,
    alignItems: 'center',
    position: 'relative',
    borderWidth: 1,
    borderColor: theme.surface.border,
  },

  closeButtonWrapper: {
    backgroundColor: theme.brand.primarySoft,
    padding: 5,
    borderRadius: 15,
    position: 'absolute',
    top: 10,
    right: 10,
  },

  closeButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  modalTitle: {
    marginTop: 30,
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.text.primary,
    textAlign: 'center',
  },

  authButton: {
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 999,
    alignItems: 'center',
  },

  authButtonText: {
    color: theme.text.onBrand,
    fontSize: 16,
    fontWeight: 'bold',
  },

  /* Profile Dropdown */
  profileOverlay: {
    flex: 1,
    backgroundColor: theme.surface.overlay,
  },

  // Backdrop only under the header, so the icon area stays “click-through”
  profileBackdrop: {
    position: 'absolute',
    top: HEADER_HEIGHT,
    left: 0,
    right: 0,
    bottom: 0,
  },

  profileMenu: {
    position: 'absolute',
    top: HEADER_HEIGHT + 50, // drops from bottom of icon
    left: 20, // lined up with icon
    backgroundColor: theme.surface.card,
    borderRadius: 10,
    padding: 12,
    minWidth: 220,
    elevation: 5,
    borderWidth: 1,
    borderColor: theme.surface.border,
  },

  profileTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.text.primary,
    marginBottom: 4,
  },

  profileEmail: {
    fontSize: 14,
    color: theme.text.secondary,
    marginBottom: 8,
  },

  profileButton: {
    paddingVertical: 8,
    borderRadius: 6,
    paddingHorizontal: 4,
  },

  profileButtonText: {
    fontSize: 14,
    color: theme.text.primary,
  },
});
