// app/login.tsx
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
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
import { loginWithEmail } from '../hooks/authHelpers';

const MILKSHAKE_ICON = require('../assets/images/milkshake-icon.png');

export default function LoginScreen() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = useMemo(() => {
    const e = email.trim();
    return e.length > 3 && password.length >= 6 && !submitting;
  }, [email, password, submitting]);

  const handleLogin = async () => {
    if (!canSubmit) return;

    try {
      setSubmitting(true);
      await loginWithEmail(email.trim(), password);
      router.replace('/');
    } catch (error: any) {
      alert('Login failed: ' + (error?.message ?? 'Unknown error'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Back to home */}
          <View style={styles.headerRow}>
            <TouchableOpacity
              style={styles.backButtonRow}
              onPress={() => router.replace('/')} // ✅ always go straight home
              activeOpacity={0.8}
            >
              <Ionicons
                name="chevron-back"
                size={18}
                color={theme.text.primary}
              />
              <Text style={styles.backText}>Back to home</Text>
            </TouchableOpacity>
          </View>

          {/* Card */}
          <View style={styles.formCard}>
            {/* Brand row */}
            <View style={styles.brandRow}>
              <View style={styles.brandIcon}>
                <Image
                  source={MILKSHAKE_ICON}
                  style={styles.brandIconImage}
                  resizeMode="contain"
                />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.title}>Login</Text>
                <Text style={styles.subtitle}>
                  Save favourites, add shakes, and rate the best spots.
                </Text>
              </View>
            </View>

            {/* Email */}
            <Text style={styles.label}>Email</Text>
            <View style={styles.inputRow}>
              <Ionicons
                name="mail-outline"
                size={18}
                color={theme.text.muted}
              />
              <TextInput
                placeholder="you@example.com"
                placeholderTextColor={theme.controls.inputPlaceholder}
                value={email}
                onChangeText={setEmail}
                style={styles.input}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                returnKeyType="next"
              />
            </View>

            {/* Password */}
            <Text style={[styles.label, { marginTop: 10 }]}>Password</Text>
            <View style={styles.inputRow}>
              <Ionicons
                name="lock-closed-outline"
                size={18}
                color={theme.text.muted}
              />
              <TextInput
                placeholder="Your password"
                placeholderTextColor={theme.controls.inputPlaceholder}
                value={password}
                onChangeText={setPassword}
                style={styles.input}
                secureTextEntry={!showPassword}
                returnKeyType="done"
                onSubmitEditing={handleLogin}
              />

              <TouchableOpacity
                onPress={() => setShowPassword(prev => !prev)}
                activeOpacity={0.8}
                style={styles.eyeButton}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={18}
                  color={theme.text.muted}
                />
              </TouchableOpacity>
            </View>

            {/* Forgot password */}
            <TouchableOpacity
              onPress={() => {
                alert('Forgot password coming next.');
              }}
              activeOpacity={0.85}
              style={styles.forgotRow}
            >
              <Text style={styles.forgotText}>Forgot password?</Text>
            </TouchableOpacity>

            {/* Login button */}
            <TouchableOpacity
              style={[styles.button, !canSubmit && styles.buttonDisabled]}
              onPress={handleLogin}
              activeOpacity={0.85}
              disabled={!canSubmit}
            >
              {submitting ? (
                <ActivityIndicator />
              ) : (
                <Text style={styles.buttonText}>Login</Text>
              )}
            </TouchableOpacity>

            {/* Switch to signup */}
            <View style={styles.bottomRow}>
              <Text style={styles.bottomText}>Don’t have an account?</Text>
              <TouchableOpacity
                onPress={() => router.replace('/signup')} // ✅ replace instead of push
                activeOpacity={0.85}
              >
                <Text style={styles.bottomLink}> Sign Up</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={{ height: 20 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.app.screenBackground,
    paddingHorizontal: 16,
  },

  scrollContent: {
    flexGrow: 1,
    paddingTop: 14,
    paddingBottom: 20,
    justifyContent: 'center',
  },

  headerRow: {
    position: 'absolute',
    top: 10,
    left: 16,
    right: 16,
    zIndex: 2,
  },

  backButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: 10,
  },

  backText: {
    marginLeft: 4,
    fontSize: 14,
    color: theme.text.primary,
    fontWeight: '600',
  },

  formCard: {
    backgroundColor: theme.surface.card,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 18,
    borderWidth: 1,
    borderColor: theme.surface.border,
  },

  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },

  // ✅ PNG already has the green circle, so keep the container transparent
  brandIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },

  // ✅ show the icon exactly as-is (NO tintColor)
  brandIconImage: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },

  title: {
    fontSize: 28,
    fontWeight: '900',
    color: theme.text.primary,
  },

  subtitle: {
    marginTop: 3,
    fontSize: 13,
    color: theme.text.secondary,
    fontWeight: '600',
  },

  label: {
    fontSize: 13,
    fontWeight: '800',
    color: theme.text.secondary,
    marginBottom: 6,
    marginTop: 6,
  },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: theme.surface.border,
    backgroundColor: theme.controls.inputBg,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 52,
  },

  input: {
    flex: 1,
    fontSize: 16,
    color: theme.text.primary,
  },

  eyeButton: {
    padding: 6,
    borderRadius: 10,
  },

  forgotRow: {
    marginTop: 10,
    alignSelf: 'flex-end',
  },

  forgotText: {
    color: theme.text.primary,
    fontWeight: '700',
    fontSize: 13,
    opacity: 0.85,
  },

  button: {
    marginTop: 14,
    backgroundColor: theme.controls.buttonPrimaryBg,
    height: 54,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },

  buttonDisabled: {
    opacity: 0.5,
  },

  buttonText: {
    color: theme.text.onBrand,
    fontWeight: '900',
    fontSize: 18,
  },

  bottomRow: {
    marginTop: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },

  bottomText: {
    color: theme.text.secondary,
    fontWeight: '700',
    fontSize: 14,
  },

  bottomLink: {
    color: theme.text.primary,
    fontWeight: '900',
    fontSize: 14,
  },
});
