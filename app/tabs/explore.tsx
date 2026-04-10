// app/tabs/explore.tsx
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, Image, KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import Modal from 'react-native-modal';
import { SafeAreaView } from 'react-native-safe-area-context';

import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { theme } from '../../constants/colors';
import { db } from '../../firebase';

const SHEET_HEIGHT = Dimensions.get('window').height * 0.5;

// ✅ Versioned storage key (match Favourites tab)
const FAV_KEY_V2 = 'favourites_v2';
const FAV_KEY_V1 = 'favourites';

const DEFAULT_IMAGE = require('../../assets/images/defaultshake.png');

// ✅ Safe preview helper (only uses valid https URLs)
const getPreviewImage = (previewPhotoUrl: any, fallback: any) => {
  const url = typeof previewPhotoUrl === 'string' ? previewPhotoUrl.trim() : '';
  if (url.startsWith('https://')) return { uri: url };
  return fallback;
};

// Type for shops coming from Firestore
type CloudShop = {
  id: string;
  name: string;
  address?: string;

  // legacy
  rating?: number | null;

  // ✅ new aggregate fields updated by your Cloud Function
  ratingAverage?: number | null;
  ratingCount?: number | null;

  milkshakePrice?: number | null;
  thickshakePrice?: number | null;
  latitude?: number | null;
  longitude?: number | null;

  // ✅ approved-only preview image url stored on shops doc
  previewPhotoUrl?: string | null;
};

type DisplayShop = {
  id: string;
  name: string;
  latitude?: number | null;
  longitude?: number | null;
  rating: number;
  price: string;
  image: any;
  area?: string;
  address?: string;
  isCloud?: boolean;
};

export default function ExploreScreen() {
  const router = useRouter();

  const [region, setRegion] = useState<{
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
} | null>(null);
const [favourites, setFavourites] = useState<string[]>([]);
const mapRef = useRef<MapView>(null);
  const [selectedShop, setSelectedShop] = useState<DisplayShop | null>(null);

  // ✅ latest approved community photo for the selected shop
  const [selectedPhotoUrl, setSelectedPhotoUrl] = useState<string | null>(null);

  // key to force MapView remount (clears selected marker)
  const [mapKey, setMapKey] = useState(0);

  // 🔥 shops loaded from Firestore
  const [cloudShops, setCloudShops] = useState<CloudShop[]>([]);

  // --------------------
  // ✅ Helper: load favourites (v2) with one-time migration from v1
  // --------------------
  const loadFavourites = async () => {
    try {
      let ids: string[] = [];

      const rawV2 = await AsyncStorage.getItem(FAV_KEY_V2);
      if (rawV2) {
        ids = JSON.parse(rawV2);
      } else {
        const rawV1 = await AsyncStorage.getItem(FAV_KEY_V1);
        const v1Ids: string[] = rawV1 ? JSON.parse(rawV1) : [];

        ids = Array.from(
          new Set(
            (Array.isArray(v1Ids) ? v1Ids : [])
              .map((x) => String(x))
              .filter((x) => x.trim().length > 0),
          ),
        );

        await AsyncStorage.setItem(FAV_KEY_V2, JSON.stringify(ids));
      }

      setFavourites(Array.isArray(ids) ? ids : []);
    } catch {
      setFavourites([]);
    }
  };

  // --------------------
  // Location
  // --------------------
// --------------------
// Location (FOR DEV EMULATOR TESTING)
// --------------------
useEffect(() => {
  (async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        throw new Error('Location not granted');
      }

      let loc;

      if (__DEV__) {
        // Force Auckland coordinates in dev mode / emulator
        loc = { coords: { latitude: -36.8485, longitude: 174.7633 } };
      } else {
        // On real devices, use actual last known or current location
        loc =
          (await Location.getLastKnownPositionAsync()) ||
          (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }));
      }

      setRegion({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      });
    } catch {
      // fallback if something fails
      setRegion({
        latitude: -36.8485,
        longitude: 174.7633,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      });
    }
  })();
}, []);

  // --------------------
  // ✅ Load favourites on mount
  // --------------------
  useEffect(() => {
    loadFavourites();
  }, []);

  // --------------------
  // ✅ Also reload favourites every time Explore regains focus
  // --------------------
  useFocusEffect(
    React.useCallback(() => {
      loadFavourites();

      // Clear sheet & marker selection when returning to Explore
      setSelectedShop(null);
      setSelectedPhotoUrl(null);
      setMapKey((prev) => prev + 1);

      return () => {};
    }, []),
  );

  // --------------------
  // Subscribe to Firestore /shops
  // --------------------
  useEffect(() => {
    const q = query(
      collection(db, 'shops'),
      where('approved', '==', true),
      orderBy('createdAt', 'desc'),
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const next: CloudShop[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as any;
          next.push({
            id: docSnap.id,
            name: data.name ?? 'Unnamed shop',
            address: data.address ?? '',
            rating:
              typeof data.rating === 'number'
                ? data.rating
                : data.rating
                ? Number(data.rating)
                : null,

            // ✅ aggregates (preferred)
            ratingAverage:
              typeof data.ratingAverage === 'number'
                ? data.ratingAverage
                : data.ratingAverage
                ? Number(data.ratingAverage)
                : null,

            ratingCount:
              typeof data.ratingCount === 'number'
                ? data.ratingCount
                : data.ratingCount
                ? Number(data.ratingCount)
                : null,

            milkshakePrice:
              typeof data.milkshakePrice === 'number'
                ? data.milkshakePrice
                : data.milkshakePrice
                ? Number(data.milkshakePrice)
                : null,
            thickshakePrice:
              typeof data.thickshakePrice === 'number'
                ? data.thickshakePrice
                : data.thickshakePrice
                ? Number(data.thickshakePrice)
                : null,
            latitude:
              typeof data.latitude === 'number'
                ? data.latitude
                : data.latitude
                ? Number(data.latitude)
                : null,
            longitude:
              typeof data.longitude === 'number'
                ? data.longitude
                : data.longitude
                ? Number(data.longitude)
                : null,

            previewPhotoUrl: typeof data.previewPhotoUrl === 'string' ? data.previewPhotoUrl : null,
          });
        });
        setCloudShops(next);
      },
      (err) => {
        console.warn('Error subscribing to shops:', err);
      },
    );

    return () => unsubscribe();
  }, []);

  // --------------------
  // ✅ When a shop is selected, listen to approved posts and pick latest photo
  // --------------------
  useEffect(() => {
    if (!selectedShop?.id) {
      setSelectedPhotoUrl(null);
      return;
    }

    const q = query(
      collection(db, `shops/${selectedShop.id}/posts`),
      orderBy('createdAt', 'desc'),
      limit(30),
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const approved = snap.docs
          .map((d) => d.data() as any)
          .filter(
            (p) =>
              p?.approved === true &&
              Array.isArray(p?.photoUrls) &&
              p.photoUrls.length > 0,
          );

        const first = approved[0];
        setSelectedPhotoUrl(first?.photoUrls?.[0] ?? null);
      },
      () => {
        setSelectedPhotoUrl(null);
      },
    );

    return unsub;
  }, [selectedShop?.id]);

  // --------------------
  // Firestore only
  // --------------------
  const allShops: DisplayShop[] = useMemo(() => {
    return cloudShops.map((shop) => {
      // Build a price string for display
      let priceText = '';
      if (shop.thickshakePrice != null && shop.milkshakePrice != null) {
        priceText = `$${shop.thickshakePrice.toFixed(2)} Thick Shake, $${shop.milkshakePrice.toFixed(
          2,
        )} Milkshake`;
      } else if (shop.milkshakePrice != null) {
        priceText = `$${shop.milkshakePrice.toFixed(2)} Milkshake`;
      } else if (shop.thickshakePrice != null) {
        priceText = `$${shop.thickshakePrice.toFixed(2)} Thick Shake`;
      } else {
        priceText = 'Prices not added yet';
      }

      // Rough area from address (2nd part of comma-separated string)
      let area: string | undefined;
      if (shop.address) {
        const bits = shop.address.split(',');
        if (bits.length >= 2) {
          area = bits[1].trim();
        }
      }

      const fallback = DEFAULT_IMAGE;

      return {
        id: shop.id,
        name: shop.name,
        latitude: shop.latitude ?? null,
        longitude: shop.longitude ?? null,
        rating:
          shop.ratingAverage != null
            ? shop.ratingAverage
            : shop.rating != null
            ? shop.rating
            : 0,
        price: priceText,
        image: getPreviewImage(shop.previewPhotoUrl, fallback),
        area,
        address: shop.address,
        isCloud: true,
      };
    });
  }, [cloudShops]);

  // ✅ write to the ONE key (v2)
  const toggleFavourite = async (id: string) => {
    const updated = favourites.includes(id)
      ? favourites.filter((fav) => fav !== id)
      : [...favourites, id];

    setFavourites(updated);
    await AsyncStorage.setItem(FAV_KEY_V2, JSON.stringify(updated));
  };

  const openMaps = (shop: DisplayShop) => {
    if (shop.latitude != null && shop.longitude != null) {
      const url = `https://www.google.com/maps/dir/?api=1&destination=${shop.latitude},${shop.longitude}`;
      Linking.openURL(url);
      return;
    }

    if (shop.address) {
      const queryStr = encodeURIComponent(`${shop.name} ${shop.address}`);
      const url = `https://www.google.com/maps/search/?api=1&query=${queryStr}`;
      Linking.openURL(url);
    }
  };

  const zoomToUserLocation = () => {
  if (mapRef.current && region) {
    mapRef.current.animateToRegion(region, 1000);
  }
};

  // helper: close sheet AND reset marker selection
  const closeSheetAndDeselect = () => {
    setSelectedShop(null);
    setSelectedPhotoUrl(null);
    setMapKey((prev) => prev + 1);
  };

  if (!region) {
  return (
    <View style={styles.loadingContainer}>
      <Text style={styles.loadingText}>Loading map…</Text>
    </View>
  );
}

  return (
  <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
    <MapView
      key={mapKey}
      ref={mapRef}
      style={styles.map}
      provider="google"
      mapType="standard"
      region={region}           // 🔹 use region state directly
      showsUserLocation={true}
      showsMyLocationButton={false}
      followsUserLocation={false}
      toolbarEnabled={false}
    >
      {allShops.map((shop) => {
        if (shop.latitude == null || shop.longitude == null) return null;

        return (
          <Marker
  key={shop.id}
  coordinate={{
    latitude: shop.latitude,
    longitude: shop.longitude,
  }}
  onSelect={() => setSelectedShop(shop)}
/>
        );
      })}
    </MapView>

    {/* Zoom to Me button */}
    <TouchableOpacity style={styles.zoomButton} onPress={zoomToUserLocation}>
      <Ionicons name="navigate" size={32} color={theme.text.primary} />
    </TouchableOpacity>

    {/* Bottom sheet */}
    {selectedShop && (
      <Modal
  isVisible={true}
  onBackdropPress={closeSheetAndDeselect}
  onSwipeComplete={closeSheetAndDeselect}
  swipeDirection="down"
  style={styles.bottomModal}
>
  <KeyboardAvoidingView
  behavior={Platform.OS === 'ios' ? 'padding' : undefined}
  style={{ flex: 1 }}
>
    <View style={styles.sheet}>
      <View style={styles.sheetHandle} />

      <ScrollView contentContainerStyle={styles.sheetContent}>
        <Image
          source={
            selectedPhotoUrl
              ? getPreviewImage(selectedPhotoUrl, selectedShop.image)
              : selectedShop.image
          }
          style={styles.image}
        />

        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{selectedShop.name}</Text>
            {selectedShop.area && <Text style={styles.areaText}>{selectedShop.area}</Text>}
            {selectedShop.address && (
              <Text style={styles.addressText}>{selectedShop.address}</Text>
            )}
          </View>
          <View style={styles.ratingPill}>
            <Ionicons name="star" size={16} color={theme.text.onBrand} />
            <Text style={styles.ratingPillText}>{selectedShop.rating.toFixed(1)}</Text>
          </View>
        </View>

        <Text style={styles.priceText}>{selectedShop.price}</Text>

        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.infoButton}
            onPress={() => {
              setSelectedShop(null);
              setSelectedPhotoUrl(null);
              router.push(`/shake/${selectedShop.id}`);
            }}
          >
            <Ionicons name="information-circle-outline" size={18} color={theme.text.primary} />
            <Text style={styles.infoText}>Details</Text>
          </TouchableOpacity>

          {(() => {
            const isFav = favourites.includes(selectedShop.id);
            return (
              <TouchableOpacity
                style={[styles.favouriteButton, isFav && styles.favouriteButtonActive]}
                onPress={() => toggleFavourite(selectedShop.id)}
              >
                <Ionicons
                  name={isFav ? 'heart' : 'heart-outline'}
                  size={18}
                  color={theme.text.primary}
                />
                <Text style={styles.favouriteText}>{isFav ? 'Favourited' : 'Favourite'}</Text>
              </TouchableOpacity>
            );
          })()}

          <TouchableOpacity
            style={styles.directionsButton}
            onPress={() => openMaps(selectedShop)}
          >
            <Ionicons name="map" size={18} color={theme.text.onBrand} />
            <Text style={styles.directionsText}>Directions</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  </KeyboardAvoidingView>
</Modal>
    )}
  </SafeAreaView>
);
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.app.screenBackground,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: theme.app.screenBackground,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    padding: 16,
    color: theme.text.primary,
  },
  map: { flex: 1 },

  zoomButton: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    zIndex: 10,
    backgroundColor: theme.surface.card,
    borderRadius: 22,
    padding: 6,
    borderWidth: 1,
    borderColor: theme.surface.border,
  },

  bottomModal: {
    justifyContent: 'flex-end',
    margin: 0,
  },
  sheet: {
    backgroundColor: theme.surface.sheet,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: SHEET_HEIGHT,
    borderTopWidth: 1,
    borderColor: theme.surface.border,
  },
  sheetHandle: {
    width: 40,
    height: 5,
    backgroundColor: theme.surface.border,
    borderRadius: 5,
    alignSelf: 'center',
    marginBottom: 10,
  },
  sheetContent: {
    alignItems: 'stretch',
  },

  image: {
    width: '100%',
    height: 160,
    borderRadius: 12,
    marginBottom: 12,
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  title: {
    fontWeight: 'bold',
    fontSize: 18,
    color: theme.text.primary,
  },
  areaText: {
    fontSize: 14,
    color: theme.text.secondary,
    marginTop: 2,
  },
  addressText: {
    fontSize: 12,
    color: theme.text.secondary,
    marginTop: 2,
  },
  ratingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.brand.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    marginLeft: 8,
  },
  ratingPillText: {
    color: theme.text.onBrand,
    marginLeft: 4,
    fontWeight: 'bold',
    fontSize: 14,
  },

  priceText: {
    marginTop: 6,
    fontSize: 14,
    color: theme.text.primary,
    marginBottom: 12,
  },

  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    marginBottom: 10,
  },

  infoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.surface.border,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: theme.surface.cardAlt,
  },
  infoText: {
    marginLeft: 6,
    color: theme.text.primary,
    fontSize: 14,
    fontWeight: '500',
  },

  favouriteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.brand.primary,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: theme.surface.card,
  },
  favouriteButtonActive: {
    backgroundColor: theme.brand.primarySoft,
  },
  favouriteText: {
    marginLeft: 6,
    color: theme.text.primary,
    fontSize: 14,
    fontWeight: '500',
  },

  directionsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    backgroundColor: theme.controls.buttonSecondaryBg,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  directionsText: {
    marginLeft: 6,
    color: theme.text.onDark,
    fontSize: 14,
    fontWeight: '500',
  },
});