// firebase.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  getReactNativePersistence,
  initializeAuth,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyDaQB_dL5Mkn7UEx5wUWHr5LyUycDqd4Jw',
  authDomain: 'shakemap-fdd96.firebaseapp.com',
  projectId: 'shakemap-fdd96',
  storageBucket: 'shakemap-fdd96.firebasestorage.app',
  messagingSenderId: '740761063675',
  appId: '1:740761063675:web:faf2c5a20e2b89db45205e',
};

// Prevent double initialization (important for Expo fast refresh)
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Initialize Firebase Auth with AsyncStorage persistence
// This MUST be called only once globally.
const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

// Initialize Firestore
const db = getFirestore(app);

export const firebaseApp = app;
export { auth, db };
