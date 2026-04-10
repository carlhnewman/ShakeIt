// app/pick-place.tsx
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Callout, MapPressEvent, Marker, Region } from 'react-native-maps';
import { theme } from '../constants/colors';

/**
 * ✅ Nearby search Cloud Function
 * Accepts: { latitude, longitude, radiusMeters?, keyword? }
 * Returns: { results: [{ placeId, description, latitude, longitude }] }
 */
const PLACES_NEARBY_URL =
  'https://placesnearbyhttp-aai2vr2x4a-ts.a.run.app/placesNearbyHttp';

type NearbyResult = {
  placeId: string;
  description: string; // "Name — Address"
  latitude: number;
  longitude: number;
};

export default function PickPlaceScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ startLat?: string; startLng?: string }>();

  const startLat = params?.startLat ? Number(params.startLat) : null;
  const startLng = params?.startLng ? Number(params.startLng) : null;

  const [pin, setPin] = useState<{ latitude: number; longitude: number } | null>(null);
  const [region, setRegion] = useState<Region>(() => ({
    latitude: Number.isFinite(startLat as any) ? (startLat as number) : -36.8485,
    longitude: Number.isFinite(startLng as any) ? (startLng as number) : 174.7633,
    latitudeDelta: 0.02,
    longitudeDelta: 0.02,
  }));

  const [loadingNearby, setLoadingNearby] = useState(false);
  const [results, setResults] = useState<NearbyResult[]>([]);

  // Best-effort: if no start coords passed, try get current location
  useEffect(() => {
    if (Number.isFinite(startLat as any) && Number.isFinite(startLng as any)) return;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const loc = await Location.getCurrentPositionAsync({});
        setRegion((r) => ({
          ...r,
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        }));
      } catch {
        // ignore
      }
    })();
  }, [startLat, startLng]);

  const canSearch = useMemo(() => !!pin && !loadingNearby, [pin, loadingNearby]);

  const onMapPress = (e: MapPressEvent) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    setPin({ latitude, longitude });
    setResults([]);

    Alert.alert('Pin dropped', 'Now tap “Search this spot”.');
  };

  const searchNearby = async () => {
    if (!pin) return;

    try {
      setLoadingNearby(true);
      setResults([]);

      const res = await fetch(PLACES_NEARBY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          latitude: pin.latitude,
          longitude: pin.longitude,
          radiusMeters: 2000, // ✅ broad mode (malls + big sites need bigger radius)
          keyword: '', // ✅ blank = broad businesses
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        console.warn('Nearby error:', json);
        Alert.alert('Error', String(json?.error ?? 'Nearby search failed'));
        return;
      }

      const rows = Array.isArray(json.results) ? json.results : [];

      const cleaned: NearbyResult[] = rows
        .map((r: any) => {
          const placeId = String(r.placeId ?? '').trim();
          const description = String(r.description ?? '').trim();
          const latitude = Number(r.latitude);
          const longitude = Number(r.longitude);

          if (!placeId || !description) return null;
          if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

          return { placeId, description, latitude, longitude };
        })
        .filter(Boolean) as NearbyResult[];

      if (!cleaned.length) {
        Alert.alert('No places found', 'Try zooming in or tapping closer to the business.');
        return;
      }

      console.log('🧭 nearby raw:', rows.length, 'cleaned:', cleaned.length);
      setResults(cleaned);

      // ✅ Nice UX: zoom to the pin area after search
      setRegion((prev) => ({
        ...prev,
        latitude: pin.latitude,
        longitude: pin.longitude,
        latitudeDelta: Math.min(prev.latitudeDelta, 0.02),
        longitudeDelta: Math.min(prev.longitudeDelta, 0.02),
      }));
    } catch (e) {
      console.warn(e);
      Alert.alert('Error', 'Nearby search failed. Check your PLACES_NEARBY_URL endpoint.');
    } finally {
      setLoadingNearby(false);
    }
  };

  const choosePlace = (placeId: string) => {
    router.replace({
      pathname: '/add-shake',
      params: { pickedPlaceId: placeId },
    });
  };

  const titleFromDescription = (desc: string) => {
    const parts = desc.split('—').map((s) => s.trim());
    return parts[0] || desc;
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBack} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={theme.text.primary} />
          <Text style={styles.headerBackText}>Back</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.searchButton, !canSearch && { opacity: 0.5 }]}
          disabled={!canSearch}
          onPress={searchNearby}
        >
          {loadingNearby ? <ActivityIndicator /> : <Text style={styles.searchButtonText}>Search this spot</Text>}
        </TouchableOpacity>
      </View>

      <MapView
        style={styles.map}
        region={region}
        onRegionChangeComplete={setRegion}
        onPress={onMapPress}
      >
        {pin && <Marker coordinate={pin} />}

        {results.map((r) => (
          <Marker
            key={r.placeId}
            coordinate={{ latitude: r.latitude, longitude: r.longitude }}
            title={titleFromDescription(r.description)}
            description={r.description}
            tracksViewChanges={false}
          >
            <Callout onPress={() => choosePlace(r.placeId)}>
              <View style={{ maxWidth: 260 }}>
                <Text style={{ fontWeight: '800' }}>{titleFromDescription(r.description)}</Text>
                <Text style={{ marginTop: 4 }}>{r.description}</Text>
                <Text style={{ marginTop: 6, fontWeight: '800' }}>Tap to select</Text>
              </View>
            </Callout>
          </Marker>
        ))}
      </MapView>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Tap the map to drop a pin, then “Search this spot”.</Text>

        {!!results.length && (
          <View style={styles.resultsBox}>
            <ScrollView style={styles.resultsScroll} contentContainerStyle={styles.resultsScrollContent}>
              {results.map((r) => (
                <TouchableOpacity
                  key={r.placeId}
                  style={styles.resultRow}
                  onPress={() => choosePlace(r.placeId)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.resultText}>{r.description}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    height: 56,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerBack: { flexDirection: 'row', alignItems: 'center' },
  headerBackText: { marginLeft: 4, fontSize: 16, fontWeight: '700' },
  searchButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  searchButtonText: { fontSize: 14, fontWeight: '800' },
  map: { flex: 1 },
  panel: {
    padding: 14,
    borderTopWidth: 1,
  },
  panelTitle: { fontSize: 14, fontWeight: '700' },
  resultsBox: {
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  resultsScroll: {
    maxHeight: 320, // ✅ makes it scroll instead of getting cut off
  },
  resultsScrollContent: {},
  resultRow: { padding: 12, borderBottomWidth: 1 },
  resultText: { fontSize: 14, fontWeight: '600' },
});
