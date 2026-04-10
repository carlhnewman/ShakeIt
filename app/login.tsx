import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';

import { theme } from '../constants/colors';

import * as AppleAuthentication from 'expo-apple-authentication';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
const GOOGLE_ICON = require('../assets/images/google.png');

WebBrowser.maybeCompleteAuthSession();


import { GoogleAuthProvider, OAuthProvider, signInWithCredential } from 'firebase/auth';
import { auth } from '../firebase';

const MILKSHAKE_ICON = require('../assets/images/milkshake-icon.png');

export default function LoginScreen() {
  const router = useRouter();

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
  iosClientId: '740761063675-rinofgh5q5f8th9hngmn918katn75q70.apps.googleusercontent.com',
  androidClientId: '740761063675-tnt2en1008oirnal8ikbhdrfmd20bppq.apps.googleusercontent.com',
});

console.log('REQUEST:', request);

  // ✅ Google login handler
  useEffect(() => {
  if (response?.type === 'success') {
    const { id_token } = response.params;

    const credential = GoogleAuthProvider.credential(id_token);
    signInWithCredential(auth, credential)
      .then(() => {
        router.replace('/');
      })
      .catch((error) => {
        console.error('Firebase login error:', error);
      });
  }
}, [response]);

// 👇 ADD THIS HERE (not in JSX)
useEffect(() => {
  console.log('AUTH RESPONSE:', response);
}, [response]);

// 👇 ADD THIS ONE HERE
useEffect(() => {
  console.log('REQUEST CHANGED:', request);
}, [request]);

  const handleAppleLogin = async () => {
    try {
      const appleCredential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        ],
      });

      const provider = new OAuthProvider('apple.com');

      const credential = provider.credential({
        idToken: appleCredential.identityToken!,
      });

      await signInWithCredential(auth, credential);

      router.replace('/');
    } catch (err: any) {
      if (err.code !== 'ERR_CANCELED') {
        alert(err.message);
      }
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
          <View>
          {/* Back Button */}
          <View style={styles.headerRow}>
            <TouchableOpacity
              style={styles.backButtonRow}
              onPress={() => router.replace('/')}
              activeOpacity={0.8}
            >
              <Ionicons name="chevron-back" size={18} color={theme.text.primary} />
              <Text style={styles.backText}>Back to home</Text>
            </TouchableOpacity>
          </View>

          {/* Card */}
          <View style={styles.formCard}>
            {/* Logo + Title */}
            <View style={styles.brandRow}>
              <View style={styles.brandIcon}>
                <Image
                  source={MILKSHAKE_ICON}
                  style={styles.brandIconImage}
                  resizeMode="contain"
                />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.title}>Welcome</Text>
                <Text style={styles.subtitle}>
                  Discover and rate the best milkshakes near you.
                </Text>
              </View>
            </View>

            {/* Buttons */}
            <View style={{ marginTop: 20 }}>
              {/* Google */}
              <TouchableOpacity
  style={[
    styles.button,
    {
      backgroundColor: '#fff',
      borderWidth: 1,
      borderColor: '#ddd',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
    },
  ]}
  onPress={() => {
  console.log('LOGIN BUTTON PRESSED');

  if (!request) {
    console.log('REQUEST NOT READY');
    return;
  }

  promptAsync();
}}
>
  <Image
    source={GOOGLE_ICON}
    style={{ width: 20, height: 20 }}
  />
  <Text style={[styles.buttonText, { color: '#000' }]}>
    Continue with Google
  </Text>
</TouchableOpacity>

              {/* Apple */}
              {Platform.OS === 'ios' && (
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={
                    AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
                  }
                  buttonStyle={
                    AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                  }
                  cornerRadius={12}
                  style={{ width: '100%', height: 54, marginTop: 10 }}
                  onPress={handleAppleLogin}
                />
              )}

              {/* Divider */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  marginVertical: 16,
                }}
              >
                <View
                  style={{ flex: 1, height: 1, backgroundColor: '#ddd' }}
                />
                <Text
                  style={{
                    marginHorizontal: 10,
                    color: '#888',
                    fontWeight: '600',
                  }}
                >
                  OR
                </Text>
                <View
                  style={{ flex: 1, height: 1, backgroundColor: '#ddd' }}
                />
              </View>

              {/* Email */}
              <TouchableOpacity
                style={[styles.button, { backgroundColor: '#eee' }]}
                onPress={() => router.push('/email-auth')}
              >
                <Text style={[styles.buttonText, { color: '#000' }]}>
                  Continue with Email
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={{ height: 20 }} />
          </View>
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
  marginBottom: 12,
},
  backButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 6,
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
    padding: 16,
    borderWidth: 1,
    borderColor: theme.surface.border,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  brandIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: 'hidden',
  },
  brandIconImage: {
    width: 36,
    height: 36,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: theme.text.primary,
  },
  subtitle: {
    fontSize: 13,
    color: theme.text.secondary,
    fontWeight: '600',
  },
  button: {
    marginTop: 14,
    backgroundColor: theme.controls.buttonPrimaryBg,
    height: 54,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: theme.text.onBrand,
    fontWeight: '900',
    fontSize: 18,
  },
});