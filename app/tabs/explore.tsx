// app/tabs/explore.tsx
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Dimensions,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import Modal from 'react-native-modal';

import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { theme } from '../../constants/colors';
import { db } from '../../firebase';

// ✅ ADD: default image + helper for core ids
const DEFAULT_IMAGE = require('../../assets/images/defaultshake.png');

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

  const [location, setLocation] = useState<any>(null);
  const [favourites, setFavourites] = useState<string[]>([]);
  const [mapRef, setMapRef] = useState<MapView | null>(null);
  const [selectedShop, setSelectedShop] = useState<DisplayShop | null>(null);

  // key to force MapView remount (clears selected marker)
  const [mapKey, setMapKey] = useState(0);

  // 🔥 shops loaded from Firestore
  const [cloudShops, setCloudShops] = useState<CloudShop[]>([]);

  // --------------------
  // Location + favourites
  // --------------------
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const userLocation = await Location.getCurrentPositionAsync({});
        setLocation(userLocation.coords);
      }

      const storedFavourites = await AsyncStorage.getItem('favourites');
      if (storedFavourites) {
        setFavourites(JSON.parse(storedFavourites));
      }
    })();
  }, []);

  // --------------------
  // Subscribe to Firestore /shops
  // --------------------
  useEffect(() => {
    const q = query(collection(db, 'shops'), orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      snapshot => {
        const next: CloudShop[] = [];
        snapshot.forEach(doc => {
          const data = doc.data() as any;
          next.push({
            id: doc.id,
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
          });
        });
        setCloudShops(next);
      },
      err => {
        console.warn('Error subscribing to shops:', err);
      },
    );

    return () => unsubscribe();
  }, []);

  // --------------------
  // When Explore tab regains focus: clear sheet & marker selection
  // --------------------
  useFocusEffect(
    React.useCallback(() => {
      setSelectedShop(null);
      setMapKey(prev => prev + 1); // force MapView remount to clear selected marker
    }, []),
  );

  // --------------------
  // Firestore only (no local shops, no merge)
  // --------------------
  const allShops: DisplayShop[] = useMemo(() => {
    return cloudShops.map(shop => {
      // Build a price string for display
      let priceText = '';
      if (shop.thickshakePrice != null && shop.milkshakePrice != null) {
        priceText = `$${shop.thickshakePrice.toFixed(
          2,
        )} Thick Shake, $${shop.milkshakePrice.toFixed(2)} Milkshake`;
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
        // ✅ CHANGED: core ids get real photos, others default
        image: getShopImage(shop.id),
        area,
        address: shop.address,
        isCloud: true,
      };
    });
  }, [cloudShops]);

  const toggleFavourite = async (id: string) => {
    const updated = favourites.includes(id)
      ? favourites.filter(fav => fav !== id)
      : [...favourites, id];

    setFavourites(updated);
    await AsyncStorage.setItem('favourites', JSON.stringify(updated));
  };

  const openMaps = (shop: DisplayShop) => {
    // Prefer coords if we have them
    if (shop.latitude != null && shop.longitude != null) {
      const url = `https://www.google.com/maps/dir/?api=1&destination=${shop.latitude},${shop.longitude}`;
      Linking.openURL(url);
      return;
    }

    // Fallback: search by name + address
    if (shop.address) {
      const query = encodeURIComponent(`${shop.name} ${shop.address}`);
      const url = `https://www.google.com/maps/search/?api=1&query=${query}`;
      Linking.openURL(url);
    }
  };

  const zoomToUserLocation = () => {
    if (mapRef && location) {
      mapRef.animateToRegion({
        latitude: location.latitude,
        longitude: location.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      });
    }
  };

  // helper: close sheet AND reset marker selection
  const closeSheetAndDeselect = () => {
    setSelectedShop(null);
    setMapKey(prev => prev + 1); // remount map so the pin shrinks back
  };

  if (!location) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading map…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        key={mapKey} // <- remounts on focus or when we clear selection
        ref={ref => setMapRef(ref)}
        style={styles.map}
        initialRegion={{
          latitude: location.latitude,
          longitude: location.longitude,
          latitudeDelta: 0.6,
          longitudeDelta: 0.6,
        }}
        showsUserLocation={true}
        showsMyLocationButton={false}
        followsUserLocation={false}
        toolbarEnabled={false}
      >
        {allShops.map(shop => {
          if (shop.latitude == null || shop.longitude == null) {
            // No coords yet → can’t draw a marker
            return null;
          }

          return (
            <Marker
              key={shop.id}
              coordinate={{
                latitude: shop.latitude,
                longitude: shop.longitude,
              }}
              // iOS: fires when the marker is selected (big pin)
              onSelect={() => setSelectedShop(shop)}
              // Android / web (and harmless duplicate on iOS)
              onPress={() => setSelectedShop(shop)}
            />
          );
        })}
      </MapView>

      {/* Zoom to Me button */}
      <TouchableOpacity style={styles.zoomButton} onPress={zoomToUserLocation}>
        <Ionicons name="navigate" size={32} color={theme.text.primary} />
      </TouchableOpacity>

      {/* Bottom sheet */}
      <Modal
        isVisible={!!selectedShop}
        onBackdropPress={closeSheetAndDeselect}
        onSwipeComplete={closeSheetAndDeselect}
        swipeDirection="down"
        style={styles.bottomModal}
      >
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />

          {selectedShop && (
            <ScrollView contentContainerStyle={styles.sheetContent}>
              <Image source={selectedShop.image} style={styles.image} />

              <View style={styles.headerRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>{selectedShop.name}</Text>
                  {selectedShop.area && (
                    <Text style={styles.areaText}>{selectedShop.area}</Text>
                  )}
                  {selectedShop.address && (
                    <Text style={styles.addressText}>{selectedShop.address}</Text>
                  )}
                </View>
                <View style={styles.ratingPill}>
                  <Ionicons name="star" size={16} color={theme.text.onBrand} />
                  <Text style={styles.ratingPillText}>
                    {selectedShop.rating.toFixed(1)}
                  </Text>
                </View>
              </View>

              <Text style={styles.priceText}>{selectedShop.price}</Text>

              {/* Actions row: Details | Favourite | Directions */}
              <View style={styles.actionsRow}>
                <TouchableOpacity
                  style={styles.infoButton}
                  onPress={() => {
                    const id = selectedShop.id;
                    setSelectedShop(null); // collapse sheet
                    router.push(`/shake/${id}`); // then navigate
                  }}
                >
                  <Ionicons
                    name="information-circle-outline"
                    size={18}
                    color={theme.text.primary}
                  />
                  <Text style={styles.infoText}>Details</Text>
                </TouchableOpacity>

                {(() => {
                  const isFav = favourites.includes(selectedShop.id);
                  return (
                    <TouchableOpacity
                      style={[
                        styles.favouriteButton,
                        isFav && styles.favouriteButtonActive,
                      ]}
                      onPress={() => toggleFavourite(selectedShop.id)}
                    >
                      <Ionicons
                        name={isFav ? 'heart' : 'heart-outline'}
                        size={18}
                        color={theme.text.primary}
                      />
                      <Text style={styles.favouriteText}>
                        {isFav ? 'Favourited' : 'Favourite'}
                      </Text>
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
          )}
        </View>
      </Modal>
    </View>
  );
}

const SHEET_HEIGHT = Dimensions.get('window').height * 0.5;

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
