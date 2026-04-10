// app/tabs/index.tsx
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { useFocusEffect, useRouter } from 'expo-router';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  FlatList,
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../../constants/colors';
import { useAuth } from '../../context/AuthContext';
import { useExploreHighlight } from '../../context/ExploreHighlightContext';
import { db } from '../../firebase';
import { logoutUser } from '../../hooks/authHelpers';

// ✅ preferences (units km/mi)
import { DEFAULT_PREFS, getPreferences, Preferences } from '../../utils/preferences';

const DEFAULT_IMAGE = require('../../assets/images/defaultshake.png');

// ✅ Safe preview helper (only uses valid https URLs)
const getPreviewImage = (previewPhotoUrl: string | null, fallback: any) => {
  const url = typeof previewPhotoUrl === 'string' ? previewPhotoUrl.trim() : '';
  if (url.startsWith('https://')) return { uri: url };
  return fallback;
};

// ✅ Stable shop identity helper (used for dedupe/merge)
const slugify = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const makeShopKey = (name: string, lat: number, lon: number) =>
  `${slugify(name)}|${lat.toFixed(5)}|${lon.toFixed(5)}`;

type BaseShop = {
  id: string;

  // stable identity for merging (dedupe by this)
  shopKey: string;

  name: string;
  address?: string;

  // legacy / fallback
  rating: number | null;

  // aggregate fields
  ratingAverage?: number | null;
  ratingCount?: number | null;

  latitude: number;
  longitude: number;

  // approved-only preview image url stored on shops doc
  previewPhotoUrl?: string | null;

  // resolved image source (either {uri} or require())
  image: any;

  ratingDelta24h?: number | null;
};

type NearestShop = BaseShop & {
  distanceKm: number;
};

const SHAKE_OF_DAY_RADIUS_KM = 10;

// ✅ DEV SWITCH: set to false to make walkthrough show once (flip to true to force in dev)
const FORCE_WALKTHROUGH_EVERY_TIME = false;

// ✅ Versioned walkthrough key (bump to _v2 when you redesign walkthrough)
const WALKTHROUGH_KEY = 'hasSeenWalkthrough_v1';

// ✅ Walkthrough steps (re-ordered)
const WALKTHROUGH_STEPS = [
  {
    title: 'Explore nearby',
    body: 'Use the Explore tab to see shakes around you and get directions.',
    key: 'explore',
  },
  {
    title: 'Add a shake',
    body: 'Tap the + button to add a new shake and help other people find the best spots.',
    key: 'add',
  },
  {
    title: 'Save favourites',
    body: 'Tap the heart to save favourites so you can find them fast later.',
    key: 'favourites',
  },
] as const;

// Simple haversine distance in km
function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
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

  // ✅ preferences state (for km/mi)
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFS);

  // ✅ live Firestore shops state
  const [cloudShops, setCloudShops] = useState<BaseShop[]>([]);

  // ✅ keep user location in state so we can recompute when it becomes available
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(
    null,
  );

  const scaleAnim = useRef(new Animated.Value(1)).current;

  // ✅ focus-aware prefs reload (so km/mi updates immediately when coming back)
  const loadPrefs = useCallback(async () => {
    try {
      const p = await getPreferences();
      setPrefs(p);
    } catch {
      setPrefs(DEFAULT_PREFS);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadPrefs();
    }, [loadPrefs]),
  );

  // ✅ helper to format distance using prefs
  const formatDistance = (km: number) => {
  if (prefs.units === 'mi') {
    const miles = km * 0.621371;
    return `${miles.toFixed(1)} mi`;
  }
  return `${km.toFixed(1)} km`;
};

  // ✅ Pulse only during the “add” step (regardless of its index)
  useEffect(() => {
    const stepKey = WALKTHROUGH_STEPS[walkthroughStep]?.key;

    if (stepKey === 'add' && showWalkthrough) {
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

  // ✅ Walkthrough show/hide (show once ever, regardless of login)
  useEffect(() => {
    const init = async () => {
      // ✅ If dev forcing, always show
      if (FORCE_WALKTHROUGH_EVERY_TIME) {
        setShowWalkthrough(true);
        setWalkthroughStep(0);
        return;
      }

      const hasSeen = await AsyncStorage.getItem(WALKTHROUGH_KEY);

      // ✅ Show only if they haven't seen it yet (regardless of login)
      if (hasSeen !== 'true') {
        setShowWalkthrough(true);
        setWalkthroughStep(0);
      } else {
        setShowWalkthrough(false);
        setWalkthroughStep(3);
      }
    };

    if (!loading) init();
  }, [loading]);

  // ✅ keep location in state (and update as it becomes available)
  useEffect(() => {
    let cancelled = false;
    let sub: Location.LocationSubscription | null = null;

    const initLocation = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          console.log('Location permission not granted');
          return;
        }

        const loc = await Location.getCurrentPositionAsync({});
        if (cancelled) return;

        setUserLocation({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });

        // Optional: live updates while user moves (helps “closest 3” stay accurate)
        sub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 5000,
            distanceInterval: 50,
          },
          (p) => {
            setUserLocation({
              latitude: p.coords.latitude,
              longitude: p.coords.longitude,
            });
          },
        );
      } catch (err) {
        console.warn('Location init failed:', err);
      }
    };

    initLocation();

    return () => {
      cancelled = true;
      if (sub) sub.remove();
    };
  }, []);

  // ✅ live Firestore listener (this is what makes Home refresh in real time)
  useEffect(() => {
    // ✅ Only show approved shops
    const q = query(collection(db, 'shops'), where('approved', '==', true));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: BaseShop[] = snap.docs
          .map((docSnap) => {
            const data = docSnap.data() as any;

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

            const ratingCountRaw =
              typeof data.ratingCount === 'number'
                ? data.ratingCount
                : data.ratingCount
                ? Number(data.ratingCount)
                : null;

            const ratingAvgRaw =
              typeof data.ratingAverage === 'number'
                ? data.ratingAverage
                : data.ratingAverage
                ? Number(data.ratingAverage)
                : null;

            const legacyRatingRaw =
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

            const name = data.name ?? 'Unnamed shop';

            const shopKey: string =
              typeof data.shopKey === 'string' && data.shopKey.length > 0
                ? data.shopKey
                : makeShopKey(name, Number(lat), Number(lon));

            const previewPhotoUrl: string | null =
              typeof data.previewPhotoUrl === 'string' ? data.previewPhotoUrl : null;

            const address: string | undefined =
              typeof data.address === 'string' && data.address.trim().length > 0
                ? data.address
                : undefined;

            const fallback = DEFAULT_IMAGE;

            return {
              id: docSnap.id,
              shopKey,
              name,
              address,

              rating: legacyRatingRaw ?? null,
              ratingAverage: ratingAvgRaw ?? null,
              ratingCount: ratingCountRaw ?? null,

              latitude: Number(lat),
              longitude: Number(lon),

              previewPhotoUrl,

              image: getPreviewImage(previewPhotoUrl, fallback),

              ratingDelta24h: delta,
            } as BaseShop;
          })
          .filter(Boolean) as BaseShop[];

        setCloudShops(rows);
      },
      (err) => {
        console.error('Home shops listener failed:', err);
        setCloudShops([]);
      },
    );

    return () => unsub();
  }, []);

  const ratingFor = useCallback((s: BaseShop) => {
    if (typeof s.ratingAverage === 'number') return s.ratingAverage;
    if (typeof s.rating === 'number') return s.rating;
    return null;
  }, []);

  // ✅ recompute nearest + Shake of the Day whenever shops OR location changes
  useEffect(() => {
    if (!userLocation) {
      setNearestShops([]);
      setShakeOfTheDay(null);
      return;
    }

    if (!cloudShops.length) {
      setNearestShops([]);
      setShakeOfTheDay(null);
      return;
    }

    const withDistance: NearestShop[] = cloudShops
      .filter((s) => s.latitude != null && s.longitude != null)
      .map((shop) => ({
        ...shop,
        distanceKm: distanceKm(
          userLocation.latitude,
          userLocation.longitude,
          shop.latitude,
          shop.longitude,
        ),
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm);

    setNearestShops(withDistance.slice(0, 3));

    const withinRadius = withDistance.filter((s) => s.distanceKm <= SHAKE_OF_DAY_RADIUS_KM);

    let top: NearestShop | null = null;

    if (withinRadius.length) {
      const positiveDelta = withinRadius.filter((s) => (s.ratingDelta24h ?? 0) > 0);

      if (positiveDelta.length > 0) {
        top = positiveDelta.reduce((best, current) => {
          const bestDelta = best.ratingDelta24h ?? 0;
          const currentDelta = current.ratingDelta24h ?? 0;
          return currentDelta > bestDelta ? current : best;
        });
      } else {
        const rated = withinRadius.filter((s) => ratingFor(s) != null);
        const pool = rated.length ? rated : withinRadius;

        top = pool.reduce((best, current) => {
          const bestRating = ratingFor(best) ?? 0;
          const currentRating = ratingFor(current) ?? 0;
          return currentRating > bestRating ? current : best;
        });
      }
    } else {
      const ratedOverall = withDistance.filter((s) => ratingFor(s) != null);
      const pool = ratedOverall.length ? ratedOverall : withDistance;

      top = pool.reduce((best, current) => {
        const bestRating = ratingFor(best) ?? 0;
        const currentRating = ratingFor(current) ?? 0;
        return currentRating > bestRating ? current : best;
      });
    }

    setShakeOfTheDay(top);
  }, [cloudShops, userLocation, ratingFor]);

  const finishWalkthrough = async () => {
    // ✅ Always mark as seen (even if they press "Not now")
    await AsyncStorage.setItem(WALKTHROUGH_KEY, 'true');
    setShowWalkthrough(false);
    setWalkthroughStep(3);
  };

  // ✅ Next button
  const handleNextWalkthrough = async () => {
    // ✅ Explore is now step 0, so trigger highlight after step 0
    if (walkthroughStep === 0) {
      setShowExploreHighlight(true);
    }

    const isLastStep = walkthroughStep >= WALKTHROUGH_STEPS.length - 1;

    if (isLastStep) {
      await finishWalkthrough();

      if (!user) {
        router.push('/login');
      }

      return;
    }

    setWalkthroughStep((prev) => prev + 1);
  };

  const handleLogout = async () => {
    try {
      await logoutUser();
      setProfileMenuVisible(false);
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  // ✅ Only show Firestore shops. Nearest list appears if we have location + shops.
  const listData: BaseShop[] = nearestShops.length > 0 ? nearestShops : cloudShops;

  const step = WALKTHROUGH_STEPS[Math.min(walkthroughStep, WALKTHROUGH_STEPS.length - 1)];

  const renderStepVisual = () => {
    if (step.key === 'add') {
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
            <Text style={[styles.tabPreviewText, { color: theme.text.muted }]}>Home</Text>
          </View>

          <View style={styles.tabPreviewItem}>
            <Ionicons name="map" size={24} color={theme.text.primary} />
            <Text style={[styles.tabPreviewText, { color: theme.text.primary }]}>Explore</Text>
          </View>

          <View style={styles.tabPreviewItem}>
            <Ionicons name="heart-outline" size={24} color={theme.text.muted} />
            <Text style={[styles.tabPreviewText, { color: theme.text.muted }]}>Favourites</Text>
          </View>
        </View>
      );
    }

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

        {/* MAIN CONTENT */}
        <View style={{ flex: 1 }}>
          {/* Shake of the Day banner */}
          {shakeOfTheDay && (
            <TouchableOpacity
              style={styles.shakeOfDayBanner}
              activeOpacity={0.9}
              onPress={() => {
                if (showWalkthrough) return;
                router.push(`/shake/${shakeOfTheDay.id}`);
              }}
            >
              <Image source={shakeOfTheDay.image} style={styles.shakeOfDayImage} />
              <View style={styles.shakeOfDayOverlay}>
                <Text style={styles.shakeOfDayLabel}>Shake of the Day</Text>
                <Text style={styles.shakeOfDayName}>{shakeOfTheDay.name}</Text>

                <View style={styles.topFeatureMetaRow}>
                  {(() => {
                    const displayRating = ratingFor(shakeOfTheDay);
                    const displayCount =
                      typeof shakeOfTheDay.ratingCount === 'number'
                        ? shakeOfTheDay.ratingCount
                        : null;

                    return displayRating != null ? (
                      <Text style={styles.shakeOfTheDayRating}>
                        ⭐ {displayRating.toFixed(1)}
                        {displayCount != null && displayCount > 0 ? ` (${displayCount})` : ''}
                      </Text>
                    ) : (
                      <Text style={styles.shakeOfTheDayRating}>No rating yet</Text>
                    );
                  })()}

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

          {/* ✅ Empty state when there are no shops */}
          {!listData.length ? (
            <View style={{ paddingHorizontal: 16, paddingTop: 20 }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: theme.text.primary }}>
                No shops yet
              </Text>
              <Text style={{ marginTop: 6, fontSize: 14, color: theme.text.secondary }}>
                Add a shake to create the first shop.
              </Text>
            </View>
          ) : (
            <FlatList
              data={listData}
              keyExtractor={(item) => item.shopKey} // ✅ stable key
              contentContainerStyle={{ paddingBottom: 40 }}
              renderItem={({ item }) => {
                const displayRating = ratingFor(item);
                const displayCount = typeof item.ratingCount === 'number' ? item.ratingCount : null;

                return (
                  <TouchableOpacity
                    style={styles.card}
                    onPress={() => {
                      if (showWalkthrough) return;
                      router.push(`/shake/${item.id}`);
                    }}
                    activeOpacity={0.85}
                  >
                    {/* ✅ Distance badge (bottom-right on image) */}
                    <View style={styles.imageWrapper}>
                      <Image source={item.image} style={styles.image} />
                      {'distanceKm' in item && typeof (item as any).distanceKm === 'number' && (
                        <View style={styles.distanceBadge}>
                          <Text style={styles.distanceText}>
                            {formatDistance((item as any).distanceKm)}
                          </Text>
                        </View>
                      )}
                    </View>

                    <Text style={styles.name}>{item.name}</Text>

                    {displayRating == null ? (
                      <Text style={styles.rating}>No rating yet</Text>
                    ) : (
                      <Text style={styles.rating}>
                        ⭐ {displayRating.toFixed(1)}
                        {displayCount != null && displayCount > 0 ? ` (${displayCount})` : ''}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          )}
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
              <TouchableOpacity style={styles.closeButton} onPress={() => setShowLoginModal(false)}>
                <Ionicons name="close" size={24} color={theme.text.primary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalTitle}>
  Save your favourite shakes - sign in to continue.
</Text>
            <View style={{ marginTop: 20 }}>
  <TouchableOpacity
    style={[
      styles.authButton,
      {
        backgroundColor: theme.controls.buttonPrimaryBg,
        width: '100%',
      },
    ]}
    onPress={() => {
      setShowLoginModal(false);
      finishWalkthrough();
      router.push('/login');
    }}
  >
    <Text style={styles.authButtonText}>Continue</Text>
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

            {/* ✅ open Preferences screen */}
            <TouchableOpacity
              style={[styles.profileButton, { marginTop: 10 }]}
              onPress={() => {
                setProfileMenuVisible(false);
                router.push('/preferences');
              }}
            >
              <Text style={styles.profileButtonText}>Preferences</Text>
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
              <Text style={[styles.profileButtonText, { color: theme.status.error }]}>Logout</Text>
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
    backgroundColor: 'rgba(0,0,0,0.08)',
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

  shakeOfTheDayRating: {
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

  imageWrapper: {
    position: 'relative',
  },

  image: {
    width: '100%',
    height: 150,
    borderRadius: 10,
  },

  distanceBadge: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },

  distanceText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
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
    top: 90,
    left: 0,
    right: 0,
    bottom: 0,
  },

  profileMenu: {
    position: 'absolute',
    top: 90,
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