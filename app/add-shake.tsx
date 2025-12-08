import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import React, { useState } from 'react';
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

export default function AddShakeScreen() {
  const router = useRouter();

  const [businessName, setBusinessName] = useState('');
  const [address, setAddress] = useState('');
  const [milkshakePrice, setMilkshakePrice] = useState('');
  const [thickshakePrice, setThickshakePrice] = useState('');
  const [rating, setRating] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!businessName.trim()) {
      Alert.alert('Missing name', 'Please enter a business name.');
      return;
    }

    if (!address.trim()) {
      Alert.alert('Missing address', 'Please enter an address.');
      return;
    }

    const milkPriceNum =
      milkshakePrice.trim() !== '' ? parseFloat(milkshakePrice) : null;
    const thickPriceNum =
      thickshakePrice.trim() !== '' ? parseFloat(thickshakePrice) : null;
    const ratingNum = rating.trim() !== '' ? parseFloat(rating) : null;

    try {
      setSaving(true);

      await addDoc(collection(db, 'shops'), {
        name: businessName.trim(),
        address: address.trim(),
        milkshakePrice: milkPriceNum,
        thickshakePrice: thickPriceNum,
        rating: ratingNum,
        createdAt: serverTimestamp(),
      });

      Alert.alert('Business added', 'Your milkshake spot has been saved!', [
        { text: 'OK', onPress: () => router.back() },
      ]);

      setBusinessName('');
      setAddress('');
      setMilkshakePrice('');
      setThickshakePrice('');
      setRating('');
    } catch (err: any) {
      console.error('Error adding business:', err);
      Alert.alert(
        'Error',
        'Something went wrong saving the business. Please try again.',
      );
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
        {/* Header */}
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

          {/* Business name */}
          <Text style={styles.label}>Business name *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Joe's Dairy"
            placeholderTextColor={theme.controls.inputPlaceholder}
            value={businessName}
            onChangeText={setBusinessName}
          />

          {/* Address */}
          <Text style={styles.label}>Address *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 10 Sykes Road, Manurewa, Auckland"
            placeholderTextColor={theme.controls.inputPlaceholder}
            value={address}
            onChangeText={setAddress}
          />

          {/* Prices */}
          <Text style={styles.sectionTitle}>Prices (optional)</Text>

          <Text style={styles.label}>Milkshake price</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 6.50"
            placeholderTextColor={theme.controls.inputPlaceholder}
            keyboardType="decimal-pad"
            value={milkshakePrice}
            onChangeText={setMilkshakePrice}
          />

          <Text style={styles.label}>Thick shake price</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 8.00"
            placeholderTextColor={theme.controls.inputPlaceholder}
            keyboardType="decimal-pad"
            value={thickshakePrice}
            onChangeText={setThickshakePrice}
          />

          {/* Rating */}
          <Text style={styles.label}>Rating (0–5, optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 4.5"
            placeholderTextColor={theme.controls.inputPlaceholder}
            keyboardType="decimal-pad"
            value={rating}
            onChangeText={setRating}
          />

          {/* Photos placeholder */}
          <Text style={styles.sectionTitle}>Photos (coming soon)</Text>
          <TouchableOpacity style={styles.disabledButton} disabled>
            <Text style={styles.disabledButtonText}>
              Add photo (not yet enabled)
            </Text>
          </TouchableOpacity>

          {/* Save button */}
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

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.app.screenBackground,
  },

  container: {
    padding: 20,
    paddingBottom: 40,
  },

  header: {
    height: 50,
    justifyContent: 'center',
    paddingHorizontal: 16,
    backgroundColor: theme.app.screenBackground,
  },
  headerBack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerBackText: {
    marginLeft: 4,
    fontSize: 16,
    color: theme.text.primary,
    fontWeight: '600',
  },

  title: {
    fontSize: 24,
    fontWeight: '800',
    color: theme.text.primary,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 24,
    marginBottom: 8,
    color: theme.text.primary,
  },
  label: {
    fontSize: 14,
    marginTop: 12,
    marginBottom: 4,
    color: theme.text.primary,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.surface.border,
    backgroundColor: theme.controls.inputBg,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: theme.text.primary,
  },
  disabledButton: {
    marginTop: 8,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: theme.surface.border,
    alignItems: 'center',
  },
  disabledButtonText: {
    color: theme.text.muted,
    fontSize: 14,
    fontWeight: '500',
  },
  saveButton: {
    marginTop: 28,
    backgroundColor: theme.controls.buttonPrimaryBg,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  saveButtonText: {
    color: theme.text.onBrand,
    fontSize: 16,
    fontWeight: '700',
  },
});
