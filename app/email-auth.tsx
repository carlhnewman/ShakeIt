import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { theme } from '../constants/colors';
import { auth } from '../firebase'; // adjust path if needed

export default function EmailAuthScreen() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignup, setIsSignup] = useState(false);

  const handleAuth = async () => {
  try {
    if (isSignup) {
      await createUserWithEmailAndPassword(auth, email, password);
    } else {
      await signInWithEmailAndPassword(auth, email, password);
    }

    router.replace('/'); // go home after success
  } catch (error: any) {
    console.log(error.message);
  }
};

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.content}>
          {/* Back */}
          <TouchableOpacity
            style={styles.backRow}
            onPress={() => router.replace('/login')}
          >
            <Ionicons name="chevron-back" size={18} color={theme.text.primary} />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>

          {/* Card */}
          <View style={styles.card}>
            <Text style={styles.title}>
              {isSignup ? 'Create Account' : 'Welcome Back'}
            </Text>

            <Text style={styles.subtitle}>
              {isSignup
                ? 'Sign up to start rating milkshakes.'
                : 'Login to continue.'}
            </Text>

            {/* Email */}
            <TextInput
              placeholder="Email"
              value={email}
              onChangeText={setEmail}
              style={styles.input}
              autoCapitalize="none"
              keyboardType="email-address"
            />

            {/* Password */}
            <TextInput
              placeholder="Password"
              value={password}
              onChangeText={setPassword}
              style={styles.input}
              secureTextEntry
            />

            {/* Button */}
            <TouchableOpacity style={styles.button} onPress={handleAuth}>
              <Text style={styles.buttonText}>
                {isSignup ? 'Create Account' : 'Login'}
              </Text>
            </TouchableOpacity>

            {/* Toggle */}
            <TouchableOpacity
              onPress={() => setIsSignup(!isSignup)}
              style={{ marginTop: 12 }}
            >
              <Text style={styles.toggleText}>
                {isSignup
                  ? 'Already have an account? Login'
                  : "Don't have an account? Sign up"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
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
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  backText: {
    marginLeft: 4,
    fontSize: 14,
    color: theme.text.primary,
    fontWeight: '600',
  },
  card: {
    backgroundColor: theme.surface.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.surface.border,
  },
  title: {
    fontSize: 26,
    fontWeight: '900',
    color: theme.text.primary,
  },
  subtitle: {
    fontSize: 13,
    color: theme.text.secondary,
    fontWeight: '600',
    marginBottom: 16,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  button: {
    marginTop: 16,
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
  toggleText: {
    textAlign: 'center',
    color: theme.text.secondary,
    fontWeight: '600',
  },
});