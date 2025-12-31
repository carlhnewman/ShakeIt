import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import {
  addDoc,
  collection,
  getDocs,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
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
import { db } from '../firebase';

/* 🔑 Cloud Functions (Gen2 / Cloud Run URLs) */
const PLACES_AUTOCOMPLETE_URL =
  'https://placesautocompletehttp-aai2vr2x4a-ts.a.run.app/placesAutocompleteHttp';

const PLACE_DETAILS_URL =
  'https://placedetailshttp-aai2vr2x4a-ts.a.run.app/placeDetailsHttp';

/* Types */
type PlaceSuggestion = {
  placeId: string;
  description: string;
};

type SelectedPlace = {
  placeId: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
};

export default function AddShakeScreen() {
  const router = useRouter();

  /* Search + selection */
  const [queryText, setQueryText] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [selectedPlace, setSelectedPlace] =
    useState<SelectedPlace | null>(null);

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

  /* Prices / rating */
  const [milkshakePrice, setMilkshakePrice] = useState('');
  const [thickshakePrice, setThickshakePrice] = useState('');
  const [rating, setRating] = useState('');

  const [saving, setSaving] = useState(false);

  // ✅ FIX: React Native setTimeout returns a number; this works on iOS/Android/Web
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* 🔎 Autocomplete (debounced) */
  useEffect(() => {
    if (queryText.trim().length < 2 || selectedPlace) {
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
            latitude: userCoords?.latitude ?? null,
            longitude: userCoords?.longitude ?? null,
          }),
        });

        const json = await res.json();
        setSuggestions(json.predictions ?? []);
      } catch (err) {
        console.warn('Autocomplete failed', err);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [queryText, selectedPlace, userCoords]);

  /* 📍 Select place → fetch details */
  const handleSelectPlace = async (item: PlaceSuggestion) => {
    try {
      const res = await fetch(PLACE_DETAILS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placeId: item.placeId }),
      });

      const json = await res.json();

      setSelectedPlace({
        placeId: item.placeId,
        name: json.name,
        address: json.address,
        latitude: json.latitude,
        longitude: json.longitude,
      });

      setQueryText(json.name);
      setSuggestions([]);
    } catch (err) {
      Alert.alert('Error', 'Failed to fetch place details.');
    }
  };

  /* 💾 Save with duplicate warning */
  const handleSave = async () => {
    if (!selectedPlace) {
      Alert.alert(
        'Select a business',
        'Please choose a business from the list.',
      );
      return;
    }

    const milkPrice =
      milkshakePrice.trim() !== '' ? parseFloat(milkshakePrice) : null;
    const thickPrice =
      thickshakePrice.trim() !== '' ? parseFloat(thickshakePrice) : null;
    const ratingNum = rating.trim() !== '' ? parseFloat(rating) : null;

    try {
      setSaving(true);

      /* 🔍 Check for existing business */
      const q = query(
        collection(db, 'shops'),
        where('googlePlaceId', '==', selectedPlace.placeId),
      );

      const existing = await getDocs(q);

      if (!existing.empty) {
        const docId = existing.docs[0].id;

        Alert.alert(
          'Business already exists',
          'This business is already on ShakeMap.',
          [
            {
              text: 'View business',
              onPress: () => {
                setSaving(false);
                router.replace(`/shake/${docId}`);
              },
            },
            {
              text: 'Cancel',
              style: 'cancel',
              onPress: () => setSaving(false),
            },
          ],
        );
        return;
      }

      /* ✅ Create new shop */
      await addDoc(collection(db, 'shops'), {
        name: selectedPlace.name,
        address: selectedPlace.address,
        latitude: selectedPlace.latitude,
        longitude: selectedPlace.longitude,
        googlePlaceId: selectedPlace.placeId,
        milkshakePrice: milkPrice,
        thickshakePrice: thickPrice,
        rating: ratingNum,
        createdAt: serverTimestamp(),
      });

      Alert.alert('Saved', 'Milkshake spot added!', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Could not save business.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.headerBack}
            onPress={() => router.back()}
          >
            <Ionicons
              name="chevron-back"
              size={22}
              color={theme.text.primary}
            />
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
            onChangeText={text => {
              setQueryText(text);
              setSelectedPlace(null);
            }}
          />

          {!selectedPlace && suggestions.length > 0 && (
            <View style={styles.suggestions}>
              {suggestions.map(item => (
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

          <TextInput
            style={styles.input}
            placeholder="Rating (0–5)"
            keyboardType="decimal-pad"
            value={rating}
            onChangeText={setRating}
          />

          <TouchableOpacity
            style={[styles.saveButton, saving && { opacity: 0.7 }]}
            onPress={handleSave}
            disabled={saving}
          >
            <Text style={styles.saveButtonText}>{saving ? 'Saving…' : 'Save'}</Text>
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
