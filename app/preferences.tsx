// app/preferences.tsx
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { signOut } from 'firebase/auth';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { theme } from '../constants/colors';
import { auth } from '../firebase';
import {
  getPreferences,
  setPreferences,
  type Preferences,
} from '../utils/preferences';

export default function PreferencesScreen() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [saving, setSaving] = useState(false);

  // ✅ show account info + admin-only card
  const [checkingAdmin, setCheckingAdmin] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const firebaseUser = auth.currentUser;
  const email = firebaseUser?.email ?? '';

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const p = await getPreferences();
        if (!cancelled) setPrefs(p);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // ✅ Determine admin claim (token) when screen loads / user changes
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const user = auth.currentUser;
      if (!user) {
        setIsAdmin(false);
        return;
      }

      try {
        setCheckingAdmin(true);
        // force refresh so we don’t read a stale token
        await user.getIdToken(true);
        const tokenResult = await user.getIdTokenResult();
        const admin = tokenResult?.claims?.admin === true;
        if (!cancelled) setIsAdmin(admin);
      } catch {
        if (!cancelled) setIsAdmin(false);
      } finally {
        if (!cancelled) setCheckingAdmin(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [firebaseUser?.uid]);

  const update = async (patch: Partial<Preferences>) => {
    if (!prefs) return;

    const next = { ...prefs, ...patch };
    setPrefs(next);

    try {
      setSaving(true);
      await setPreferences(patch);
    } finally {
      setSaving(false);
    }
  };

  const selected = useMemo(() => (prefs?.mapApp ?? 'google'), [prefs]);

  const handleLogout = async () => {
    try {
      setSaving(true);
      await signOut(auth);
      setIsAdmin(false);
      router.replace('/'); // back home
    } catch (e: any) {
      // keep it simple
      alert('Logout failed: ' + (e?.message ?? 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  if (loading || !prefs) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color={theme.nav.headerIcon} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Preferences</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={{ padding: 16 }}>
          <ActivityIndicator />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={theme.nav.headerIcon} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Preferences</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* ✅ Account */}
        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <Ionicons name="person-outline" size={18} color={theme.text.primary} />
            <Text style={styles.cardTitle}>Account</Text>
          </View>

          {firebaseUser ? (
            <>
              <Text style={styles.cardHint}>
                Signed in as{' '}
                <Text style={{ fontWeight: '900' }}>{email || 'Unknown email'}</Text>
              </Text>

              <View style={{ marginTop: 12 }}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={handleLogout}
                  style={[styles.optionRow, { justifyContent: 'center' }]}
                  disabled={saving}
                >
                  <Text style={[styles.optionText, { marginLeft: 0 }]}>
                    {saving ? 'Logging out…' : 'Logout'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* ✅ Optional: keep a tiny spinner while checking admin, but no "Admin access" text */}
              {checkingAdmin ? (
                <View style={styles.savingRow}>
                  <ActivityIndicator />
                  <Text style={styles.savingText}>Checking access…</Text>
                </View>
              ) : null}
            </>
          ) : (
            <>
              <Text style={styles.cardHint}>You’re currently signed out.</Text>
              <View style={{ marginTop: 12 }}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => router.push('/login')}
                  style={[styles.optionRow, { justifyContent: 'center' }]}
                >
                  <Text style={[styles.optionText, { marginLeft: 0 }]}>
                    Go to Login
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>

        <View style={{ height: 14 }} />

        {/* ✅ Preferred map app */}
        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <Ionicons name="map-outline" size={18} color={theme.text.primary} />
            <Text style={styles.cardTitle}>Preferred map app</Text>
          </View>

          <Text style={styles.cardHint}>
            Default is Google Maps. If it isn’t installed on iPhone, ShakeMap will fall back to Apple
            Maps automatically.
          </Text>

          <View style={{ marginTop: 12 }}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => update({ mapApp: 'google' })}
              style={[styles.optionRow, selected === 'google' && styles.optionRowActive]}
              disabled={saving}
            >
              <View style={styles.optionLeft}>
                <Ionicons name="logo-google" size={18} color={theme.text.primary} />
                <Text style={styles.optionText}>Google Maps</Text>
              </View>

              {selected === 'google' ? (
                <Ionicons name="checkmark-circle" size={20} color={theme.brand.primary} />
              ) : (
                <Ionicons name="ellipse-outline" size={20} color={theme.text.muted} />
              )}
            </TouchableOpacity>

            <View style={{ height: 10 }} />

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => update({ mapApp: 'apple' })}
              style={[styles.optionRow, selected === 'apple' && styles.optionRowActive]}
              disabled={saving}
            >
              <View style={styles.optionLeft}>
                <Ionicons name="logo-apple" size={18} color={theme.text.primary} />
                <Text style={styles.optionText}>Apple Maps</Text>
              </View>

              {selected === 'apple' ? (
                <Ionicons name="checkmark-circle" size={20} color={theme.brand.primary} />
              ) : (
                <Ionicons name="ellipse-outline" size={20} color={theme.text.muted} />
              )}
            </TouchableOpacity>
          </View>

          {saving ? (
            <View style={styles.savingRow}>
              <ActivityIndicator />
              <Text style={styles.savingText}>Saving…</Text>
            </View>
          ) : null}
        </View>

        <View style={{ height: 14 }} />

        {/* ✅ App */}
        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <Ionicons name="information-circle-outline" size={18} color={theme.text.primary} />
            <Text style={styles.cardTitle}>App</Text>
          </View>

          <Text style={styles.cardHint}>Privacy, app info, and other settings.</Text>

          <View style={{ marginTop: 12 }}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => router.push('/privacy')}
              style={styles.optionRow}
            >
              <View style={styles.optionLeft}>
                <Ionicons name="lock-closed-outline" size={18} color={theme.text.primary} />
                <Text style={styles.optionText}>Privacy policy</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.text.muted} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ✅ Admin section (only show if admin claim true) */}
        {isAdmin ? (
          <>
            <View style={{ height: 14 }} />

            <View style={styles.card}>
              <View style={styles.cardTitleRow}>
                <Ionicons name="shield-checkmark-outline" size={18} color={theme.text.primary} />
                <Text style={styles.cardTitle}>Admin</Text>
              </View>

              <Text style={styles.cardHint}>
                Moderate new businesses and approve submissions.
              </Text>

              <View style={{ marginTop: 12 }}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => router.push('/moderation')}
                  style={styles.optionRow}
                >
                  <View style={styles.optionLeft}>
                    <Ionicons name="checkmark-done-outline" size={18} color={theme.text.primary} />
                    <Text style={styles.optionText}>Moderation</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={theme.text.muted} />
                </TouchableOpacity>
              </View>
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.app.screenBackground },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
    backgroundColor: theme.nav.headerBackground,
  },
  backButton: { padding: 4, marginRight: 4 },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    color: theme.nav.headerText,
  },

  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.surface.border,
    backgroundColor: theme.surface.card,
    padding: 14,
  },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center' },
  cardTitle: { marginLeft: 8, fontSize: 16, fontWeight: '900', color: theme.text.primary },
  cardHint: { marginTop: 8, color: theme.text.secondary, fontWeight: '600', lineHeight: 18 },

  optionRow: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.surface.border,
    backgroundColor: theme.surface.card,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  optionRowActive: {
    borderColor: theme.brand.primary,
    backgroundColor: theme.brand.primarySoft,
  },
  optionLeft: { flexDirection: 'row', alignItems: 'center' },
  optionText: { marginLeft: 10, color: theme.text.primary, fontWeight: '800' },

  savingRow: { marginTop: 12, flexDirection: 'row', alignItems: 'center' },
  savingText: { marginLeft: 10, color: theme.text.muted, fontWeight: '700' },
});