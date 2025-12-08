// app/shake/[id].tsx
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Dimensions,
  Image,
  Linking,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { theme } from '../../constants/colors';
import { db } from '../../firebase';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const DEFAULT_IMAGE = require('../../assets/images/defaultshake.png');

type Shop = {
  id: string;
  name: string;
  area?: string;
  address?: string;
  rating?: number | null;
  milkshakePrice?: number | null;
  thickshakePrice?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  images: any[]; // array of require(...) or { uri: string }
};

// Core shops (1, 2, 3)
const CORE_SHOPS: Shop[] = [
  {
    id: '1',
    name: "Captain Morgan's",
    area: 'Gisborne',
    address: '285 Grey Street, Gisborne',
    rating: 4.5,
    milkshakePrice: 6.5,
    thickshakePrice: 9,
    latitude: -38.6704,
    longitude: 178.0169,
    images: [require('../../assets/images/captainmorgans.png')],
  },
  {
    id: '2',
    name: 'Te Poi Cafe',
    area: 'Te Poi',
    address: '5 Te Poi Road, Te Poi',
    rating: 4.5,
    milkshakePrice: 6,
    thickshakePrice: 8,
    latitude: -37.8724,
    longitude: 175.8423,
    images: [require('../../assets/images/tepoicafe.png')],
  },
  {
    id: '3',
    name: 'Hot Bread Shop Cafe',
    area: 'Ōpōtiki',
    address: '43 Saint John Street, Ōpōtiki',
    rating: 4.0,
    milkshakePrice: 5.5,
    thickshakePrice: 8,
    latitude: -38.0118,
    longitude: 177.2869,
    images: [require('../../assets/images/hotbreadshop.png')],
  },
];

export default function ShakeDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [shop, setShop] = useState<Shop | null>(null);
  const [loading, setLoading] = useState(true);
  const [favourites, setFavourites] = useState<string[]>([]);

  useEffect(() => {
    const load = async () => {
      if (!id) return;

      try {
        // 1) Try local/core shop first
        const core = CORE_SHOPS.find((s) => s.id === id);
        if (core) {
          setShop(core);
        } else {
          // 2) Otherwise load from Firestore
          const ref = doc(db, 'shops', id as string);
          const snap = await getDoc(ref);

          if (snap.exists()) {
            const data = snap.data() as any;
            const milk = data.milkshakePrice ?? null;
            const thick = data.thickshakePrice ?? null;
            const rating = data.rating ?? null;

            const fsShop: Shop = {
              id: snap.id,
              name: data.name ?? 'Unknown shop',
              area: undefined,
              address: data.address ?? '',
              rating,
              milkshakePrice: milk,
              thickshakePrice: thick,
              latitude: data.latitude ?? null,
              longitude: data.longitude ?? null,
              // Later we will replace this with real uploaded photos
              images: [DEFAULT_IMAGE],
            };

            setShop(fsShop);
          } else {
            setShop(null);
          }
        }

        const stored = await AsyncStorage.getItem('favourites');
        setFavourites(stored ? JSON.parse(stored) : []);
      } catch (err) {
        console.error('Error loading shop details:', err);
        setShop(null);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [id]);

  const isFavourite = shop ? favourites.includes(shop.id) : false;

  const toggleFavourite = async () => {
    if (!shop) return;
    let updated: string[];
    if (isFavourite) {
      updated = favourites.filter((f) => f !== shop.id);
    } else {
      updated = [...favourites, shop.id];
    }
    setFavourites(updated);
    await AsyncStorage.setItem('favourites', JSON.stringify(updated));
  };

  // Open in Apple / Google Maps
  const openMapsForShop = (target: Shop) => {
    let appleUrl = '';
    let googleUrl = '';

    if (target.latitude != null && target.longitude != null) {
      const coords = `${target.latitude},${target.longitude}`;
      appleUrl = `http://maps.apple.com/?daddr=${coords}`;
      googleUrl = `https://www.google.com/maps/dir/?api=1&destination=${coords}`;
    } else if (target.address) {
      const query = encodeURIComponent(`${target.name} ${target.address}`);
      appleUrl = `http://maps.apple.com/?daddr=${query}`;
      googleUrl = `https://www.google.com/maps/dir/?api=1&destination=${query}`;
    } else {
      const query = encodeURIComponent(target.name);
      appleUrl = `http://maps.apple.com/?daddr=${query}`;
      googleUrl = `https://www.google.com/maps/dir/?api=1&destination=${query}`;
    }

    if (Platform.OS === 'ios') {
      Alert.alert('Open in maps', undefined, [
        { text: 'Apple Maps', onPress: () => Linking.openURL(appleUrl) },
        { text: 'Google Maps', onPress: () => Linking.openURL(googleUrl) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    } else {
      // Android – just fire Google Maps
      Linking.openURL(googleUrl);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.screen}>
        <Text style={styles.loadingText}>Loading…</Text>
      </SafeAreaView>
    );
  }

  if (!shop) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.notFoundContainer}>
          <Text style={styles.notFoundTitle}>Shop not found</Text>
          <Text style={styles.notFoundText}>
            We couldn&apos;t find details for this milkshake spot.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const priceLineParts = [];
  if (shop.thickshakePrice != null) {
    priceLineParts.push(
      `$${typeof shop.thickshakePrice === 'number'
        ? shop.thickshakePrice.toFixed(2)
        : shop.thickshakePrice} Thick Shake`,
    );
  }
  if (shop.milkshakePrice != null) {
    priceLineParts.push(
      `$${typeof shop.milkshakePrice === 'number'
        ? shop.milkshakePrice.toFixed(2)
        : shop.milkshakePrice} Milkshake`,
    );
  }
  const priceLine = priceLineParts.join(', ');

  return (
    <SafeAreaView style={styles.screen}>
      {/* Back button */}
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons
            name="chevron-back"
            size={24}
            color={theme.nav.headerIcon}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {shop.name}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Photo strip */}
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          style={styles.photoStrip}
        >
          {shop.images.map((img, index) => (
            <Image key={index} source={img} style={styles.photo} />
          ))}
        </ScrollView>

        <View style={styles.content}>
          <View style={styles.titleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{shop.name}</Text>
              {shop.area && <Text style={styles.area}>{shop.area}</Text>}
              {shop.address && <Text style={styles.address}>{shop.address}</Text>}
            </View>
            {shop.rating != null && (
              <View style={styles.ratingPill}>
                <Ionicons
                  name="star"
                  size={16}
                  color={theme.text.onBrand}
                />
                <Text style={styles.ratingPillText}>
                  {shop.rating.toFixed(1)}
                </Text>
              </View>
            )}
          </View>

          {priceLine ? <Text style={styles.price}>{priceLine}</Text> : null}

          {/* Buttons */}
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[
                styles.favouriteButton,
                isFavourite && styles.favouriteButtonActive,
              ]}
              onPress={toggleFavourite}
            >
              <Ionicons
                name={isFavourite ? 'heart' : 'heart-outline'}
                size={20}
                color={theme.text.onBrand}
              />
              <Text style={styles.favouriteText}>
                {isFavourite ? 'Favourited' : 'Add to favourites'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.directionsButton}
              onPress={() => openMapsForShop(shop)}
            >
              <Ionicons
                name="map"
                size={20}
                color={theme.text.onBrand}
              />
              <Text style={styles.directionsText}>Get directions</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.comingSoonContainer}>
            <Text style={styles.comingSoonTitle}>Coming soon</Text>
            <Text style={styles.comingSoonText}>
              Ratings, reviews, photos, and price history will show up here once
              we wire them in.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.app.screenBackground,
  },
  loadingText: {
    padding: 16,
    color: theme.text.primary,
  },
  notFoundContainer: {
    padding: 16,
  },
  notFoundTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
    color: theme.text.primary,
  },
  notFoundText: {
    color: theme.text.secondary,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
    backgroundColor: theme.nav.headerBackground,
  },
  backButton: {
    padding: 4,
    marginRight: 4,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    color: theme.nav.headerText,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  photoStrip: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH * 0.55,
    backgroundColor: theme.app.screenBackground,
  },
  photo: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH * 0.55,
    resizeMode: 'cover',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  name: {
    fontSize: 26,
    fontWeight: '800',
    color: theme.text.primary,
  },
  area: {
    fontSize: 16,
    color: theme.text.secondary,
    marginTop: 2,
  },
  address: {
    fontSize: 14,
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
    marginTop: 4,
  },
  ratingPillText: {
    color: theme.text.onBrand,
    fontWeight: '700',
    marginLeft: 4,
  },
  price: {
    marginTop: 10,
    fontSize: 16,
    color: theme.text.primary,
  },

  // Symmetrical buttons
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    marginBottom: 24,
  },
  favouriteButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    paddingVertical: 12,
    marginRight: 8,
    backgroundColor: theme.controls.buttonPrimaryBg,
  },
  favouriteButtonActive: {
    backgroundColor: theme.brand.accentSoft,
  },
  favouriteText: {
    marginLeft: 6,
    color: theme.text.onBrand,
    fontSize: 16,
    fontWeight: '600',
  },
  directionsButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    paddingVertical: 12,
    marginLeft: 8,
    backgroundColor: theme.controls.buttonSecondaryBg,
  },
  directionsText: {
    marginLeft: 6,
    color: theme.text.onDark,
    fontSize: 16,
    fontWeight: '600',
  },

  comingSoonContainer: {
    marginTop: 30,
  },
  comingSoonTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
    color: theme.text.primary,
  },
  comingSoonText: {
    fontSize: 15,
    color: theme.text.secondary,
  },
});
