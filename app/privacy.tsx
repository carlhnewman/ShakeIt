import { router } from 'expo-router';
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { theme } from '../constants/colors';

export default function PrivacyScreen() {
  return (
    <SafeAreaView style={styles.container}>
      {/* Back Button */}
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <Text style={styles.backButtonText}>← Back</Text>
      </TouchableOpacity>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Privacy Policy</Text>

        <Text style={styles.text}>
          ShakeMap respects your privacy.
        </Text>

        <Text style={styles.text}>
          We collect only the minimum information required to operate the app:
          login details, location (to show nearby shakes), and user-submitted
          content such as ratings and images.
        </Text>

        <Text style={styles.text}>
          We do not sell your data. Ever.
        </Text>

        <Text style={styles.text}>
          If you have any privacy concerns, contact us at:
        </Text>

        <Text style={styles.email}>privacy@shakeit.nz</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.app.screenBackground,
  },

  // Back button styling (same vibe as your menu buttons)
  backButton: {
    marginTop: 10,
    marginLeft: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.brand.primary,
    alignSelf: 'flex-start',
  },
  backButtonText: {
    color: theme.brand.primary,
    fontSize: 16,
    fontWeight: '600',
  },

  content: {
    padding: 20,
    paddingTop: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: theme.text.primary,
    marginBottom: 20,
  },
  text: {
    fontSize: 16,
    color: theme.text.secondary,
    marginBottom: 16,
    lineHeight: 22,
  },
  email: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.brand.primary,
  },
});
