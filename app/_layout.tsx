// app/_layout.tsx
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { theme } from '../constants/colors';
import { AuthProvider } from '../context/AuthContext';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
    <AuthProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: {
            // unified app background, now driven by theme
            backgroundColor: theme.app.screenBackground,
          },
        }}
      >
        {/* Your main tabs live under app/tabs */}
        <Stack.Screen name="tabs" options={{ headerShown: false }} />

        {/* Shop details screen: app/shake/[id].tsx */}
        <Stack.Screen name="shake/[id]" options={{ headerShown: false }} />

        {/* ✅ Admin moderation screen: app/moderation.tsx */}
        <Stack.Screen name="moderation" options={{ headerShown: false }} />

        {/* Optional: auth screens (kept explicit for clarity) */}
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="signup" options={{ headerShown: false }} />

        {/* Other top-level screens */}
        <Stack.Screen name="add-shake" options={{ headerShown: false }} />
        <Stack.Screen name="preferences" options={{ headerShown: false }} />
        <Stack.Screen name="privacy" options={{ headerShown: false }} />

        {/* Not found */}
        <Stack.Screen name="+not-found" options={{ headerShown: false }} />
      </Stack>
    </AuthProvider>
    </SafeAreaProvider>
  );
}
