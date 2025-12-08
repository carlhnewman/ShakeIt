import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { theme } from '../constants/colors';
import { registerWithEmail } from '../hooks/authHelpers';

const SignupScreen = () => {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSignup = async () => {
    try {
      await registerWithEmail(email, password);
      router.replace('/'); // back to home/tabs
    } catch (error: any) {
      alert('Signup failed: ' + error.message);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Create Account</Text>

      <TextInput
        placeholder="Email"
        placeholderTextColor={theme.controls.inputPlaceholder}
        value={email}
        onChangeText={setEmail}
        style={styles.input}
        autoCapitalize="none"
        keyboardType="email-address"
      />

      <TextInput
        placeholder="Password (min 6 characters)"
        placeholderTextColor={theme.controls.inputPlaceholder}
        value={password}
        onChangeText={setPassword}
        style={styles.input}
        secureTextEntry
      />

      <TouchableOpacity style={styles.button} onPress={handleSignup}>
        <Text style={styles.buttonText}>Sign Up</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.push('/login')}>
        <Text style={styles.link}>Already have an account? Log In</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
};

export default SignupScreen;

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    padding: 20, 
    backgroundColor: theme.app.screenBackground,
  },

  title: {
    fontSize: 32,
    fontWeight: '800',
    color: theme.text.primary,
    marginBottom: 30,
    textAlign: 'center',
  },

  input: {
    borderWidth: 1,
    borderColor: theme.surface.border,
    backgroundColor: theme.controls.inputBg,
    borderRadius: 10,
    padding: 14,
    marginBottom: 15,
    fontSize: 16,
    color: theme.text.primary,
  },

  button: {
    backgroundColor: theme.controls.buttonPrimaryBg,
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },

  buttonText: { 
    color: theme.text.onBrand, 
    fontWeight: '700', 
    fontSize: 18,
  },

  link: {
    marginTop: 20,
    textAlign: 'center',
    color: theme.text.primary,
    fontWeight: '600',
    fontSize: 15,
  },
});
