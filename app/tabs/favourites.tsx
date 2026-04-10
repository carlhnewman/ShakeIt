// app/tabs/favourites.tsx
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../../constants/colors';
import { db } from '../../firebase';

// ✅ Versioned storage key (prevents old junk favouriting old IDs)
const FAV_KEY_V2 = 'favourites_v2';
const FAV_KEY_V1 = 'favourites';

type DisplayShop = {
  id: string;
  name: string;
  rating: number | null;
  priceLine?: string;
  addressLine?: string;
  image: any; // require(...) or {uri}
};

const DEFAULT_IMAGE = require('../../assets/images/defaultshake.png');

// helper: pull a rough area/suburb from an address string
const getAreaFromAddress = (address?: string): string | undefined => {
  if (!address) return undefined;
  const parts = address.split(',');
  if (parts.length >= 2) return parts[1].trim();
  return undefined;
};

// ✅ helper: safe https uri image
const safeUri = (url: any) => {
  const u = typeof url === 'string' ? url.trim() : '';
  return u.startsWith('https://') ? { uri: u } : null;
};

const FavouritesScreen = () => {
  const router = useRouter();

  const [favouriteIds, setFavouriteIds] = useState<string[]>([]);
  const [shopDocById, setShopDocById] = useState<Map<string, any>>(new Map());
  const [loading, setLoading] = useState(true);

  const unsubRef = useRef<null | (() => void)>(null);

  const loadFavouriteIds = useCallback(async () => {
    // 1) Load favourites (v2), with a one-time migration from v1
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

    setFavouriteIds(ids);
    return ids;
  }, []);

  // ✅ Re-load favourites + re-subscribe every time this tab is focused
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      const run = async () => {
        setLoading(true);

        try {
          const ids = await loadFavouriteIds();

          // stop previous listener if any
          if (unsubRef.current) {
            unsubRef.current();
            unsubRef.current = null;
          }

          // If no favourites, clear and bail
          if (!ids.length) {
            setShopDocById(new Map());
            setLoading(false);
            return;
          }

          // 2) Live listen to shops so images/ratings update instantly
          const q = query(collection(db, 'shops'));

          const unsub = onSnapshot(
            q,
            async (snap) => {
              if (cancelled) return;

              const next = new Map<string, any>();
              snap.docs.forEach((d) => next.set(d.id, d.data() as any));
              setShopDocById(next);

              // 3) Clean up any favourite IDs that no longer exist in Firestore
              const cleanedIds = ids.filter((id) => next.has(id));

              if (cleanedIds.length !== ids.length) {
                setFavouriteIds(cleanedIds);
                await AsyncStorage.setItem(FAV_KEY_V2, JSON.stringify(cleanedIds));
              }

              setLoading(false);
            },
            (err) => {
              console.error('Favourites shops listener failed:', err);
              setShopDocById(new Map());
              setLoading(false);
            },
          );

          unsubRef.current = unsub;
        } catch (err) {
          console.error('Error loading favourites:', err);
          setFavouriteIds([]);
          setShopDocById(new Map());
          setLoading(false);
        }
      };

      run();

      return () => {
        cancelled = true;
        if (unsubRef.current) {
          unsubRef.current();
          unsubRef.current = null;
        }
      };
    }, [loadFavouriteIds]),
  );

  const shops: DisplayShop[] = useMemo(() => {
    if (!favouriteIds.length) return [];

    const list: DisplayShop[] = favouriteIds
      .map((id) => {
        const data = shopDocById.get(id);
        if (!data) return null;

        const name = typeof data.name === 'string' ? data.name : 'Unknown shop';

        const ratingAverage =
          typeof data.ratingAverage === 'number'
            ? data.ratingAverage
            : data.ratingAverage != null
            ? Number(data.ratingAverage)
            : null;

        const ratingLegacy =
          typeof data.rating === 'number'
            ? data.rating
            : data.rating != null
            ? Number(data.rating)
            : null;

        const rating = ratingAverage != null ? ratingAverage : ratingLegacy != null ? ratingLegacy : null;

        const milk = data.milkshakePrice;
        const thick = data.thickshakePrice;

        const milkNum = typeof milk === 'number' ? milk : milk != null ? Number(milk) : null;
        const thickNum = typeof thick === 'number' ? thick : thick != null ? Number(thick) : null;

        let priceLine: string | undefined = undefined;
        if (milkNum != null && thickNum != null) {
          priceLine = `$${thickNum.toFixed(2)} Thick Shake, $${milkNum.toFixed(2)} Milkshake`;
        } else if (milkNum != null) {
          priceLine = `$${milkNum.toFixed(2)} Milkshake`;
        } else if (thickNum != null) {
          priceLine = `$${thickNum.toFixed(2)} Thick Shake`;
        }

        const address = typeof data.address === 'string' ? data.address : '';
        const area = getAreaFromAddress(address);
        const addressLine = area ?? address;

        const preview = safeUri(data.previewPhotoUrl);
        const image = preview ?? DEFAULT_IMAGE;

        return {
          id,
          name,
          rating,
          priceLine,
          addressLine,
          image,
        } as DisplayShop;
      })
      .filter(Boolean) as DisplayShop[];

    // ensure unique
    return Array.from(new Map(list.map((s) => [s.id, s])).values());
  }, [favouriteIds, shopDocById]);

  const renderItem = ({ item }: { item: DisplayShop }) => {
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push(`/shake/${item.id}`)}
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
                <Ionicons name="star" size={14} color={theme.text.onBrand} />
                <Text style={styles.ratingText}>{item.rating.toFixed(1)}</Text>
              </View>
            )}
          </View>

          {!!item.priceLine && (
            <Text style={styles.price} numberOfLines={1}>
              {item.priceLine}
            </Text>
          )}

          {!!item.addressLine && (
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
    <SafeAreaView style={styles.screen} edges={['top']}>
  <View style={styles.headerContainer}>
    <Text style={styles.header}>Favourites</Text>
  </View>

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
  headerContainer: {
  paddingTop: 12,
  paddingHorizontal: 16,
  paddingBottom: 6,
  backgroundColor: theme.app.screenBackground,
},
  header: {
    fontSize: 28,
    fontWeight: '800',
    color: theme.text.primary,
    paddingHorizontal: 16,
    marginTop: 8,
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
