// app/_layout.tsx
import { Stack } from 'expo-router';
import { theme } from '../constants/colors';
import { AuthProvider } from '../context/AuthContext';

export default function RootLayout() {
  return (
    <AuthProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: {
            // unified app background, now driven by theme
            backgroundColor: theme.app.screenBackground,
          },
        }}
      />
    </AuthProvider>
  );
}
