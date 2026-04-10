// app/add-shake.tsx
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { theme } from '../constants/colors';
import { useAuth } from '../context/AuthContext'; // ✅ NEW
import { auth } from '../firebase'; // ✅ NEW: for idToken

/* 🔑 Cloud Functions (Gen2 / Cloud Run URLs) */
const PLACES_AUTOCOMPLETE_URL =
  'https://placesautocompletehttp-aai2vr2x4a-ts.a.run.app';

const PLACE_DETAILS_URL =
  'https://placedetailshttp-aai2vr2x4a-ts.a.run.app';

// ✅ NEW: Create shop (server-safe uniqueness)
const CREATE_SHOP_URL = 'https://createshophttp-aai2vr2x4a-ts.a.run.app';

/* ✅ Helpers for stable shop identity (must match Home/Explore logic) */
const slugify = (s: string) =>
  s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const makeShopKey = (name: string, lat: number, lon: number) =>
  `${slugify(name)}|${lat.toFixed(5)}|${lon.toFixed(5)}`;

/* Types */
type PlaceSuggestion = {
  placeId: string;
  description: string; // ✅ this is the friendly display label from Google
};

type SelectedPlace = {
  placeId: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  description?: string; // ✅ NEW: store the friendly display label
};

export default function AddShakeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ pickedPlaceId?: string }>();
  const { isAdmin } = useAuth(); // ✅ NEW (still used for UI messaging)

  /* Search + selection */
  const [queryText, setQueryText] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<SelectedPlace | null>(null);

  /* ✅ Location bias for autocomplete */
  const [userCoords, setUserCoords] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  // Fetch user coords once (best-effort)
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;

        const loc = await Location.getCurrentPositionAsync({});
        setUserCoords({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });
      } catch (e) {
        console.warn('Location not available', e);
      }
    })();
  }, []);

  /* Prices */
  const [milkshakePrice, setMilkshakePrice] = useState('');
  const [thickshakePrice, setThickshakePrice] = useState('');

  const [saving, setSaving] = useState(false);

  // ✅ FIX: React Native setTimeout returns a number; this works on iOS/Android/Web
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSelection = () => {
    setSelectedPlace(null);
    setQueryText('');
    setSuggestions([]);
  };

  /* ✅ Handle returned pickedPlaceId (from /pick-place) */
  const lastHandledPickRef = useRef<string | null>(null);

  // ✅ NEW: Build Authorization header for protected endpoints (createShopHttp)
  const getAuthHeader = async () => {
    const user = auth.currentUser;
    if (!user) throw new Error('You must be logged in to add a business.');
    const token = await user.getIdToken(); // no force refresh needed here
    return { Authorization: `Bearer ${token}` };
  };

  // ✅ DEBUG-HARDENED place details fetch
  const fetchPlaceDetailsById = async (placeId: string) => {
    console.log('📍 fetchPlaceDetailsById placeId:', placeId);
    console.log('📍 PLACE_DETAILS_URL:', PLACE_DETAILS_URL);

    const res = await fetch(PLACE_DETAILS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ placeId }),
    });

    const text = await res.text(); // read raw first (best debug)
    let json: any = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      console.warn('⚠️ placeDetails non-JSON response:', text);
    }

    console.log('📍 placeDetails status:', res.status, 'ok:', res.ok);
    console.log('📍 placeDetails json:', json);

    if (!res.ok) {
      throw new Error(String(json?.error ?? `Place details HTTP ${res.status}`));
    }

    const next: SelectedPlace = {
      placeId: String(placeId),
      name: String(json.name ?? '').trim(),
      address: String(json.address ?? '').trim(),
      latitude: Number(json.latitude),
      longitude: Number(json.longitude),
      // description is added later (autocomplete knows it; pick-place fallback creates it)
    };

    if (
      !next.placeId ||
      !next.name ||
      !next.address ||
      !Number.isFinite(next.latitude) ||
      !Number.isFinite(next.longitude)
    ) {
      throw new Error('Incomplete details');
    }

    return next;
  };

  useEffect(() => {
    console.log('🧭 params.pickedPlaceId:', params?.pickedPlaceId);

    const picked =
      typeof params?.pickedPlaceId === 'string' ? params.pickedPlaceId : '';
    if (!picked) return;
    if (lastHandledPickRef.current === picked) return;

    lastHandledPickRef.current = picked;

    (async () => {
      try {
        const next = await fetchPlaceDetailsById(picked);

        // ✅ pick-place doesn’t have the autocomplete description,
        // so create a nice fallback label
        const fallbackDescription = `${next.name}, ${next.address}`.trim();

        setSelectedPlace({
          ...next,
          description: fallbackDescription,
        });

        setQueryText(next.name);
        setSuggestions([]);
      } catch (e: any) {
        console.warn('❌ place details failed:', e?.message ?? e);
        Alert.alert('Error', 'Could not load details for that place. Try again.');
      }
    })();
  }, [params?.pickedPlaceId]);

  /* 🔎 Autocomplete (debounced) */
  useEffect(() => {
    if (selectedPlace) {
      setSuggestions([]);
      return;
    }

    if (queryText.trim().length < 2) {
      setSuggestions([]);
      return;
    }

    // ✅ HARDEN: wait for coords so results are biased to NZ area
    if (!userCoords) {
      setSuggestions([]);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(PLACES_AUTOCOMPLETE_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input: queryText,
            latitude: userCoords.latitude,
            longitude: userCoords.longitude,
            country: 'nz',
            language: 'en-NZ',
            radiusMeters: 50000, // 50km bias
          }),
        });

        const json = await res.json();
        setSuggestions(Array.isArray(json.predictions) ? json.predictions : []);
      } catch (err) {
        console.warn('Autocomplete failed', err);
        setSuggestions([]);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [queryText, selectedPlace, userCoords]);

  /* 📍 Select place → fetch details */
  const handleSelectPlace = async (item: PlaceSuggestion) => {
    try {
      const next = await fetchPlaceDetailsById(item.placeId);

      // ✅ carry the user-friendly label through
      setSelectedPlace({
        ...next,
        description:
          item.description?.trim() || `${next.name}, ${next.address}`.trim(),
      });

      setQueryText(next.name);
      setSuggestions([]);
    } catch (e: any) {
      console.warn('❌ handleSelectPlace details failed:', e?.message ?? e);
      Alert.alert('Error', 'Failed to fetch place details.');
    }
  };

  const parseOptionalNumber = (raw: string) => {
    const t = raw.trim();
    if (t === '') return null;
    const n = Number(t);
    if (!Number.isFinite(n)) return null;
    return n;
  };

  /* 💾 Save via server createShopHttp (prevents duplicates across users) */
  const handleSave = async () => {
    if (saving) return;

    if (!selectedPlace) {
      Alert.alert('Select a business', 'Please choose a business from the list.');
      return;
    }

    const name = selectedPlace.name?.trim();
    const address = selectedPlace.address?.trim();
    const latitude = Number(selectedPlace.latitude);
    const longitude = Number(selectedPlace.longitude);
    const googlePlaceId = selectedPlace.placeId;

    // ✅ nice-to-have label
    const placeDescription = String(selectedPlace.description ?? '').trim();

    if (
      !googlePlaceId ||
      !name ||
      !address ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude)
    ) {
      Alert.alert('Missing details', 'Please re-select the business from Google.');
      return;
    }

    const milkPrice = parseOptionalNumber(milkshakePrice);
    const thickPrice = parseOptionalNumber(thickshakePrice);

    try {
      setSaving(true);

      if (
        !CREATE_SHOP_URL ||
        CREATE_SHOP_URL.includes('PASTE_YOUR_createShopHttp_URL_HERE')
      ) {
        Alert.alert(
          'Missing CREATE_SHOP_URL',
          'Paste your deployed createShopHttp URL into CREATE_SHOP_URL in add-shake.tsx.'
        );
        return;
      }

      // ✅ Must be logged in (backend requires Authorization header)
      let authHeader: { Authorization: string };
      try {
        authHeader = await getAuthHeader();
      } catch (e: any) {
        Alert.alert('Login required', String(e?.message ?? 'Please login first.'));
        router.push('/login');
        return;
      }

      const shopKey = makeShopKey(name, latitude, longitude);

      console.log('🛠️ createShop payload:', {
        googlePlaceId,
        name,
        address,
        latitude,
        longitude,
        shopKey,
        placeDescription,
        milkshakePrice: milkPrice,
        thickshakePrice: thickPrice,
      });
      console.log('🛠️ CREATE_SHOP_URL:', CREATE_SHOP_URL);

      const res = await fetch(CREATE_SHOP_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeader, // ✅ Authorization: Bearer <idToken>
        },
        body: JSON.stringify({
          googlePlaceId,
          name,
          address,
          latitude,
          longitude,
          shopKey,
          placeDescription, // ✅ NEW field sent to server
          milkshakePrice: milkPrice,
          thickshakePrice: thickPrice,
          // ❌ no "approved" here — server decides based on admin claim
        }),
      });

      const text = await res.text();
      let json: any = {};
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        console.warn('⚠️ createShop non-JSON response:', text);
      }

      console.log('🛠️ createShop status:', res.status, 'ok:', res.ok);
      console.log('🛠️ createShop json:', json);

      if (!res.ok) {
        Alert.alert(
          'Error',
          String(json?.error ?? `Create shop HTTP ${res.status}`)
        );
        return;
      }

      const shopId = String(json?.shopId ?? '').trim();
      const created = Boolean(json?.created);

      // ✅ backend returns approved now (based on server auth)
      const approved = Boolean(json?.approved);

      if (!shopId) {
        Alert.alert('Error', 'Create shop returned no shopId.');
        return;
      }

      if (!created) {
        Alert.alert(
          'Business already exists',
          'This business is already on ShakeMap.',
          [
            {
              text: 'View business',
              onPress: () => {
                setSaving(false);
                router.replace(`/shake/${shopId}`);
              },
            },
            { text: 'Cancel', style: 'cancel', onPress: () => setSaving(false) },
          ]
        );
        return;
      }

      if (!approved) {
        Alert.alert(
          'Submitted for review',
          'Thanks! This business will appear once approved.',
          [
            {
              text: 'OK',
              onPress: () => {
                clearSelection();
                setMilkshakePrice('');
                setThickshakePrice('');
                router.replace('/');
              },
            },
          ]
        );
        return;
      }

      Alert.alert('Saved', 'Milkshake spot added!', [
        {
          text: 'OK',
          onPress: () => {
            clearSelection();
            setMilkshakePrice('');
            setThickshakePrice('');
            router.replace(`/shake/${shopId}`);
          },
        },
      ]);
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Could not save business.');
    } finally {
      setSaving(false);
    }
  };

  const goPickOffMap = () => {
    router.push({
      pathname: '/pick-place',
      params: {
        startLat: userCoords ? String(userCoords.latitude) : undefined,
        startLng: userCoords ? String(userCoords.longitude) : undefined,
      },
    });
  };

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerBack} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={22} color={theme.text.primary} />
            <Text style={styles.headerBackText}>Home</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.title}>Add a milkshake spot</Text>

          <Text style={styles.label}>Business *</Text>

          <TextInput
            style={styles.input}
            placeholder="Start typing a business name"
            value={queryText}
            editable={true}
            onChangeText={(text) => {
              setQueryText(text);
              setSelectedPlace(null);
            }}
          />

          {!selectedPlace && (
            <TouchableOpacity
              onPress={goPickOffMap}
              style={{
                marginTop: 10,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="map-outline" size={18} color={theme.text.primary} />
              <Text style={{ fontWeight: '800' }}>Pick off a map</Text>
            </TouchableOpacity>
          )}

          {selectedPlace && (
            <View style={{ marginTop: 8, flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                onPress={clearSelection}
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderRadius: 10,
                  borderWidth: 1,
                }}
              >
                <Text style={{ fontWeight: '700' }}>Change business</Text>
              </TouchableOpacity>
            </View>
          )}

          {!selectedPlace && suggestions.length > 0 && (
            <View style={styles.suggestions}>
              {suggestions.map((item) => (
                <TouchableOpacity
                  key={item.placeId}
                  style={styles.suggestionRow}
                  onPress={() => handleSelectPlace(item)}
                >
                  <Text style={styles.suggestionName}>{item.description}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {selectedPlace && (
            <View style={styles.selectedBox}>
              <Ionicons name="checkmark-circle" size={18} color="#2ecc71" />
              <Text style={styles.selectedText}>{selectedPlace.address}</Text>
            </View>
          )}

          <Text style={styles.sectionTitle}>Prices (optional)</Text>

          <TextInput
            style={styles.input}
            placeholder="Milkshake price"
            keyboardType="decimal-pad"
            value={milkshakePrice}
            onChangeText={setMilkshakePrice}
          />

          <TextInput
            style={styles.input}
            placeholder="Thick shake price"
            keyboardType="decimal-pad"
            value={thickshakePrice}
            onChangeText={setThickshakePrice}
          />

          <TouchableOpacity
            style={[styles.saveButton, saving && { opacity: 0.7 }]}
            onPress={handleSave}
            disabled={saving}
          >
            <Text style={styles.saveButtonText}>
              {saving ? 'Saving…' : 'Save'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/* Styles unchanged (intentionally) */
const styles = StyleSheet.create({
  screen: { flex: 1 },
  container: { padding: 20 },
  header: { height: 50, justifyContent: 'center', paddingHorizontal: 16 },
  headerBack: { flexDirection: 'row', alignItems: 'center' },
  headerBackText: { marginLeft: 4, fontSize: 16, fontWeight: '600' },
  title: { fontSize: 24, fontWeight: '800', marginBottom: 20 },
  label: { marginTop: 12 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginTop: 6,
  },
  suggestions: {
    borderWidth: 1,
    borderRadius: 10,
    marginTop: 6,
  },
  suggestionRow: { padding: 12 },
  suggestionName: { fontWeight: '600' },
  selectedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 6,
  },
  selectedText: { fontWeight: '600' },
  sectionTitle: { marginTop: 24, fontSize: 18, fontWeight: '600' },
  saveButton: {
    marginTop: 28,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  saveButtonText: { fontSize: 16, fontWeight: '700' },
});