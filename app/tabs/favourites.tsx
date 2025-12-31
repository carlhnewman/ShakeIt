// app/tabs/favourites.tsx
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { collection, getDocs } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  FlatList,
  Image,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { theme } from '../../constants/colors';
import { db } from '../../firebase';

// Core, hard-coded shops (match IDs used in Home / Explore / Details)
const CORE_SHOPS = [
  {
    id: '1',
    name: "Captain Morgan's",
    area: 'Gisborne',
    address: '285 Grey Street, Gisborne',
    rating: 4.5,
    priceLine: '$9 Thick Shake, $6.5 Milkshake',
    image: require('../../assets/images/captainmorgans.png'),
  },
  {
    id: '2',
    name: 'Te Poi Cafe',
    area: 'Te Poi',
    address: '5 Te Poi Road, Te Poi',
    rating: 4.5,
    priceLine: '$8 Thick Shake, $6 Milkshake',
    image: require('../../assets/images/tepoicafe.png'),
  },
  {
    id: '3',
    name: 'Hot Bread Shop Cafe',
    area: 'Ōpōtiki',
    address: '43 Saint John Street, Ōpōtiki',
    rating: 4.0,
    priceLine: '$8 Thick Shake, $5.5 Milkshake',
    image: require('../../assets/images/hotbreadshop.png'),
  },
];

type DisplayShop = {
  id: string;
  name: string;
  rating: number | null;
  priceLine?: string;
  addressLine?: string; // this is what we actually show: area/suburb
  area?: string;
  image: any;
};

const DEFAULT_IMAGE = require('../../assets/images/defaultshake.png');

// helper: pull a rough area/suburb from an address string
const getAreaFromAddress = (address?: string): string | undefined => {
  if (!address) return undefined;
  const parts = address.split(',');
  if (parts.length >= 2) {
    return parts[1].trim();
  }
  return undefined;
};

const FavouritesScreen = () => {
  const router = useRouter();
  const [favouriteIds, setFavouriteIds] = useState<string[]>([]);
  const [shops, setShops] = useState<DisplayShop[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const stored = await AsyncStorage.getItem('favourites');
        const ids: string[] = stored ? JSON.parse(stored) : [];
        setFavouriteIds(ids);

        // Core shops that are in favourites
        const coreMatches: DisplayShop[] = CORE_SHOPS.filter((s) =>
          ids.includes(s.id),
        ).map((s) => ({
          id: s.id,
          name: s.name,
          rating: s.rating,
          priceLine: s.priceLine,
          // show just "Gisborne", "Te Poi", etc.
          addressLine: s.area,
          area: s.area,
          image: s.image,
        }));

        // Firestore shops (user-added)
        const snap = await getDocs(collection(db, 'shops'));
        const cloudMatches: DisplayShop[] = snap.docs
          .filter((doc) => ids.includes(doc.id))
          .map((doc) => {
            const data = doc.data() as any;
            const milk = data.milkshakePrice;
            const thick = data.thickshakePrice;
            let priceLine: string | undefined;

            if (milk && thick) {
              priceLine = `$${(typeof milk === 'number' ? milk.toFixed(2) : milk)} Milkshake, $${(typeof thick === 'number' ? thick.toFixed(2) : thick)} Thick Shake`;
            } else if (milk) {
              priceLine = `$${(typeof milk === 'number' ? milk.toFixed(2) : milk)} Milkshake`;
            } else if (thick) {
              priceLine = `$${(typeof thick === 'number' ? thick.toFixed(2) : thick)} Thick Shake`;
            }

            const area = getAreaFromAddress(data.address);

            return {
              id: doc.id,
              name: data.name ?? 'Unknown shop',
              rating: data.rating ?? null,
              priceLine,
              // show area/suburb if we can derive it, otherwise fall back to full address
              addressLine: area ?? (data.address ?? ''),
              area,
              image: DEFAULT_IMAGE,
            } as DisplayShop;
          });

        setShops([...coreMatches, ...cloudMatches]);
      } catch (err) {
        console.error('Error loading favourites:', err);
        setShops([]);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const renderItem = ({ item }: { item: DisplayShop }) => {
    const handlePress = () => {
      router.push(`/shake/${item.id}`);
    };

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={handlePress}
        activeOpacity={0.8}
      >
        <Image source={item.image} style={styles.image} />
        <View style={styles.cardContent}>
          <View style={styles.titleRow}>
            <Text style={styles.name} numberOfLines={2}>
              {item.name}
            </Text>
            {item.rating != null && (
              <View style={styles.ratingPill}>
                <Ionicons
                  name="star"
                  size={14}
                  color={theme.text.onBrand}
                />
                <Text style={styles.ratingText}>
                  {item.rating.toFixed(1)}
                </Text>
              </View>
            )}
          </View>
          {item.priceLine && (
            <Text style={styles.price} numberOfLines={1}>
              {item.priceLine}
            </Text>
          )}
          {item.addressLine && (
            <Text style={styles.address} numberOfLines={1}>
              {item.addressLine}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Loading favourites…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!shops.length) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>No favourites yet</Text>
          <Text style={styles.emptyText}>
            Tap the heart on a milkshake spot in Explore to add it here.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.header}>Favourites</Text>
      <FlatList
        data={shops}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 20 }}
      />
    </SafeAreaView>
  );
};

export default FavouritesScreen;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.app.screenBackground,
  },
  header: {
    fontSize: 28,
    fontWeight: '800',
    color: theme.text.primary,
    paddingHorizontal: 16,
    marginTop: 8,      // bring it down from the very top
    marginBottom: 12,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: theme.surface.card,
    borderRadius: 16,
    marginBottom: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.surface.border,
  },
  image: {
    width: 110,
    height: 110,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
  },
  cardContent: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  name: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: theme.text.primary,
  },
  ratingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.brand.primary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    marginLeft: 6,
  },
  ratingText: {
    color: theme.text.onBrand,
    fontSize: 13,
    marginLeft: 3,
    fontWeight: '600',
  },
  price: {
    marginTop: 4,
    fontSize: 14,
    color: theme.text.primary,
  },
  address: {
    marginTop: 2,
    fontSize: 13,
    color: theme.text.secondary,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 6,
    color: theme.text.primary,
  },
  emptyText: {
    fontSize: 14,
    color: theme.text.secondary,
    textAlign: 'center',
  },
});
