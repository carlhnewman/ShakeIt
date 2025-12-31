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

// ✅ ADD THIS (make sure you created: /utils/seedCoreShops.ts)
import { seedCoreShopsIfMissing } from '../../utils/seedCoreShops';

const DEFAULT_IMAGE = require('../../assets/images/defaultshake.png');

// ✅ NEW: map core shop ids -> bundled images (safe static require)
const getShopImage = (id: string) => {
  switch (id) {
    case '1':
      return require('../../assets/images/captainmorgans.png');
    case '2':
      return require('../../assets/images/tepoicafe.png');
    case '3':
      return require('../../assets/images/hotbreadshop.png');
    default:
      return DEFAULT_IMAGE;
  }
};

type BaseShop = {
  id: string;
  name: string;
  rating: number | null;
  latitude: number;
  longitude: number;
  image: any;
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

// ✅ DEV SWITCH: set to false later to make walkthrough only show once
const FORCE_WALKTHROUGH_EVERY_TIME = true;

const WALKTHROUGH_STEPS = [
  {
    title: 'Add a shake',
    body: 'Tap the + button to add a new shake and help other people find the best spots.',
    key: 'add',
  },
  {
    title: 'Explore nearby',
    body: 'Use the Explore tab to see shakes around you and get directions.',
    key: 'explore',
  },
  {
    title: 'Save favourites',
    body: 'Tap the heart to save favourites so you can find them fast later.',
    key: 'favourites',
  },
] as const;

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

const HEADER_HEIGHT = 60; // matches styles.header.height

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

  // ✅ Seed core shops into Firestore (safe to run multiple times because merge: true)
  useEffect(() => {
    (async () => {
      try {
        await seedCoreShopsIfMissing();
      } catch (e) {
        console.warn('seedCoreShopsIfMissing failed:', e);
      }
    })();
  }, []);

  // Pulsing “Add shake” icon during walkthrough (step 0)
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

  // ✅ Walkthrough show/hide
  useEffect(() => {
    const init = async () => {
      const hasSeen = await AsyncStorage.getItem('hasSeenWalkthrough');

      if (FORCE_WALKTHROUGH_EVERY_TIME) {
        setShowWalkthrough(true);
        setWalkthroughStep(0);
        return;
      }

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

  // Load 3 nearest shops and compute Shake of the Day
  useEffect(() => {
    const loadNearest = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          console.log('Location permission not granted');
          return;
        }

        const loc = await Location.getCurrentPositionAsync({});
        const userLat = loc.coords.latitude;
        const userLon = loc.coords.longitude;

        const snap = await getDocs(collection(db, 'shops'));

        const cloud: BaseShop[] = snap.docs
          .map(doc => {
            const data = doc.data() as any;

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

            if (lat == null || lon == null) return null;

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
              // ✅ CHANGED: use real bundled image for core ids, default for others
              image: getShopImage(doc.id),
              ratingDelta24h: delta,
            } as BaseShop;
          })
          .filter(Boolean) as BaseShop[];

        // ✅ FIX: dedupe by id (Firestore wins if same id as CORE_SHOPS)
        const merged = new Map<string, BaseShop>();
        CORE_SHOPS.forEach(s => merged.set(s.id, s));
        cloud.forEach(s => merged.set(s.id, s));
        const all: BaseShop[] = Array.from(merged.values());

        if (!all.length) return;

        const withDistance: NearestShop[] = all.map(shop => ({
          ...shop,
          distanceKm: distanceKm(userLat, userLon, shop.latitude, shop.longitude),
        }));

        withDistance.sort((a, b) => a.distanceKm - b.distanceKm);
        setNearestShops(withDistance.slice(0, 3));

        const withinRadius = withDistance.filter(
          s => s.distanceKm <= SHAKE_OF_DAY_RADIUS_KM,
        );

        let top: NearestShop | null = null;

        if (withinRadius.length) {
          const positiveDelta = withinRadius.filter(
            s => (s.ratingDelta24h ?? 0) > 0,
          );

          if (positiveDelta.length > 0) {
            top = positiveDelta.reduce((best, current) => {
              const bestDelta = best.ratingDelta24h ?? 0;
              const currentDelta = current.ratingDelta24h ?? 0;
              return currentDelta > bestDelta ? current : best;
            });
          } else {
            const rated = withinRadius.filter(s => s.rating != null);
            const pool = rated.length ? rated : withinRadius;
            top = pool.reduce((best, current) => {
              const bestRating = best.rating ?? 0;
              const currentRating = current.rating ?? 0;
              return currentRating > bestRating ? current : best;
            });
          }
        } else {
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
    if (!FORCE_WALKTHROUGH_EVERY_TIME) {
      await AsyncStorage.setItem('hasSeenWalkthrough', 'true');
    }
    setShowWalkthrough(false);
    setWalkthroughStep(3);
  };

  // ✅ FIX: final button goes straight to /login (no intermediate modal)
  const handleNextWalkthrough = async () => {
    if (walkthroughStep === 1) {
      setShowExploreHighlight(true);
    }

    const isLastStep = walkthroughStep >= WALKTHROUGH_STEPS.length - 1;

    if (isLastStep) {
      await finishWalkthrough();

      if (!user) {
        // Go straight to login (your login screen can still offer Sign Up)
        router.push('/login');
      }

      return;
    }

    setWalkthroughStep(prev => prev + 1);
  };

  const handleLogout = async () => {
    try {
      await logoutUser();
      setProfileMenuVisible(false);
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  const listData: BaseShop[] =
    nearestShops.length > 0 ? nearestShops : CORE_SHOPS;

  const step =
    WALKTHROUGH_STEPS[
      Math.min(walkthroughStep, WALKTHROUGH_STEPS.length - 1)
    ];

  const renderStepVisual = () => {
    if (step.key === 'add') {
      // ✅ FIX: Only show the Add Shake visual (no Profile chip)
      return (
        <View style={styles.visualRowCentered}>
          <View style={styles.visualChip}>
            <View style={styles.visualCircle}>
              <Ionicons name="add" size={18} color={theme.text.onBrand} />
            </View>
            <Text style={styles.visualLabel}>Add Shake</Text>
          </View>
        </View>
      );
    }

    if (step.key === 'explore') {
      return (
        <View style={styles.tabPreviewRow}>
          <View style={styles.tabPreviewItem}>
            <Ionicons name="home-outline" size={24} color={theme.text.muted} />
            <Text style={[styles.tabPreviewText, { color: theme.text.muted }]}>
              Home
            </Text>
          </View>

          <View style={styles.tabPreviewItem}>
            <Ionicons name="map" size={24} color={theme.text.primary} />
            <Text style={[styles.tabPreviewText, { color: theme.text.primary }]}>
              Explore
            </Text>
          </View>

          <View style={styles.tabPreviewItem}>
            <Ionicons name="heart-outline" size={24} color={theme.text.muted} />
            <Text style={[styles.tabPreviewText, { color: theme.text.muted }]}>
              Favourites
            </Text>
          </View>
        </View>
      );
    }

    // ✅ FIX: favourites step should be ONE centred chip (no “Saved list”)
    return (
      <View style={styles.visualRowCentered}>
        <View style={styles.visualChip}>
          <View style={styles.visualCircle}>
            <Ionicons name="heart" size={18} color={theme.text.onBrand} />
          </View>
          <Text style={styles.visualLabel}>Favourites</Text>
        </View>
      </View>
    );
  };

  return (
    <>
      <SafeAreaView style={styles.container}>
        {/* HEADER BAR */}
        <View style={styles.header}>
          {/* Left: Login/Profile */}
          <TouchableOpacity
            onPress={() => {
              if (showWalkthrough) return;
              if (!user) setShowLoginModal(true);
              else setProfileMenuVisible(prev => !prev);
            }}
            style={styles.headerIconButton}
            activeOpacity={0.8}
          >
            <Ionicons
              name={user ? 'person' : 'person-outline'}
              size={22}
              color={theme.text.onBrand}
            />
          </TouchableOpacity>

          {/* Right: Add Shake */}
          <TouchableOpacity
            onPress={() => !showWalkthrough && router.push('/add-shake')}
            style={[styles.headerIconButton, styles.headerAddButton]}
            activeOpacity={0.8}
          >
            <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
              <Ionicons name="add" size={22} color={theme.text.onBrand} />
            </Animated.View>
          </TouchableOpacity>
        </View>

        {/* MAIN CONTENT */}
        <View style={{ flex: 1 }}>
          {/* Shake of the Day banner */}
          {shakeOfTheDay && (
            <TouchableOpacity
              style={styles.shakeOfDayBanner}
              activeOpacity={0.9}
              onPress={() =>
                !showWalkthrough && router.push(`/shake/${shakeOfTheDay.id}`)
              }
            >
              <Image
                source={shakeOfTheDay.image}
                style={styles.shakeOfDayImage}
              />
              <View style={styles.shakeOfDayOverlay}>
                <Text style={styles.shakeOfDayLabel}>Shake of the Day</Text>
                <Text style={styles.shakeOfDayName}>{shakeOfTheDay.name}</Text>

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
                onPress={() =>
                  !showWalkthrough && router.push(`/shake/${item.id}`)
                }
                activeOpacity={0.85}
              >
                <Image source={item.image} style={styles.image} />
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.rating}>
                  {item.rating != null ? `⭐ ${item.rating}` : 'No rating yet'}
                </Text>
              </TouchableOpacity>
            )}
          />
        </View>
      </SafeAreaView>

      {/* ✅ Walkthrough Modal */}
      <Modal
        transparent
        animationType="fade"
        visible={showWalkthrough && walkthroughStep < 3}
        onRequestClose={() => finishWalkthrough()}
      >
        <View style={styles.walkthroughModalOverlay}>
          <View style={styles.walkthroughCard}>
            <Text style={styles.walkthroughTitle}>{step.title}</Text>
            <Text style={styles.walkthroughBody}>{step.body}</Text>

            {renderStepVisual()}

            <View style={styles.walkthroughDotsRow}>
              {WALKTHROUGH_STEPS.map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.walkthroughDot,
                    i === walkthroughStep && styles.walkthroughDotActive,
                  ]}
                />
              ))}
            </View>

            <TouchableOpacity
              style={styles.walkthroughNextButton}
              onPress={handleNextWalkthrough}
              activeOpacity={0.85}
            >
              <Text style={styles.walkthroughNextText}>
                {walkthroughStep >= WALKTHROUGH_STEPS.length - 1
                  ? !user
                    ? 'Login / Sign up'
                    : 'Done'
                  : 'Next'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => finishWalkthrough()}
              activeOpacity={0.8}
              style={{ marginTop: 10 }}
            >
              <Text style={styles.walkthroughNotNow}>Not now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Login Modal (still used when tapping profile icon while logged out) */}
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
                  finishWalkthrough();
                  router.push('/login');
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
                  finishWalkthrough();
                  router.push('/signup');
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
          <TouchableOpacity
            style={styles.profileBackdrop}
            activeOpacity={1}
            onPress={() => setProfileMenuVisible(false)}
          />
          <View style={styles.profileMenu}>
            <Text style={styles.profileTitle}>Profile</Text>
            {user?.email && <Text style={styles.profileEmail}>{user.email}</Text>}

            <TouchableOpacity
              style={[styles.profileButton, { marginTop: 10 }]}
              onPress={() => {}}
            >
              <Text style={styles.profileButtonText}>
                Preferences (coming soon)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.profileButton, { marginTop: 8 }]}
              onPress={() => {
                setProfileMenuVisible(false);
                router.push('../privacy');
              }}
            >
              <Text style={styles.profileButtonText}>Privacy Policy</Text>
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

  /* Shake of the Day banner */
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

  /* Walkthrough modal */
  walkthroughModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 14,
  },

  walkthroughCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: theme.surface.card,
    borderRadius: 18,
    padding: 22,
    borderWidth: 1,
    borderColor: theme.surface.border,
  },

  walkthroughTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: theme.text.primary,
    marginBottom: 10,
  },

  walkthroughBody: {
    fontSize: 16,
    lineHeight: 22,
    color: theme.text.secondary,
  },

  visualRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
    alignItems: 'center',
  },

  // ✅ used when there is only ONE chip (Add step + Favourites step)
  visualRowCentered: {
    flexDirection: 'row',
    marginTop: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },

  visualChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: theme.surface.sheet,
    borderWidth: 1,
    borderColor: theme.surface.border,
  },

  visualCircle: {
    width: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: theme.brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  visualLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: theme.text.primary,
  },

  tabPreviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: theme.surface.sheet,
    borderWidth: 1,
    borderColor: theme.surface.border,
  },

  tabPreviewItem: {
    alignItems: 'center',
    gap: 6,
    width: 90,
  },

  tabPreviewText: {
    fontSize: 12,
    fontWeight: '700',
  },

  walkthroughDotsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
    marginBottom: 16,

    // ✅ FIX: centre the dots
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },

  walkthroughDot: {
    width: 9,
    height: 9,
    borderRadius: 999,
    backgroundColor: theme.surface.border,
  },

  walkthroughDotActive: {
    backgroundColor: theme.brand.primary,
  },

  walkthroughNextButton: {
    marginTop: 2,
    backgroundColor: theme.brand.primary,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
  },

  walkthroughNextText: {
    color: theme.text.onBrand,
    fontSize: 18,
    fontWeight: '900',
  },

  walkthroughNotNow: {
    textAlign: 'center',
    color: theme.text.muted,
    fontSize: 14,
    fontWeight: '700',
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

  profileBackdrop: {
    position: 'absolute',
    top: HEADER_HEIGHT,
    left: 0,
    right: 0,
    bottom: 0,
  },

  profileMenu: {
    position: 'absolute',
    top: HEADER_HEIGHT + 50,
    left: 20,
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
