// app/tabs/_layout.tsx
import { Ionicons } from '@expo/vector-icons';
import { Tabs, useRouter } from 'expo-router';
import { TouchableOpacity } from 'react-native';
import { theme } from '../../constants/colors';
import { useAuth } from '../../context/AuthContext';
import { ExploreHighlightProvider } from '../../context/ExploreHighlightContext';

const ADMIN_UID = 'JP7PKiVf2ZUjMEg6McrMbrozjf03';

export default function Layout() {
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = user?.uid === ADMIN_UID;

  return (
    <ExploreHighlightProvider>
      <Tabs
        screenOptions={({ route }) => ({
          headerShown: false,

          tabBarActiveTintColor: theme.text.primary,
          tabBarInactiveTintColor: theme.text.muted,

          tabBarStyle: {
            height: 80,
            paddingBottom: 20,
            paddingTop: 10,
            backgroundColor: theme.surface.sheet,
            borderTopWidth: 0.5,
            borderTopColor: theme.surface.border,
          },

          tabBarLabelStyle: {
            fontSize: 13,
            fontWeight: '600',
            paddingBottom: 6,
          },

          tabBarIcon: ({ focused, color }) => {
            let iconName: keyof typeof Ionicons.glyphMap;

            if (route.name === 'index') {
              iconName = focused ? 'home' : 'home-outline';
            } else if (route.name === 'explore') {
              iconName = focused ? 'map' : 'map-outline';
            } else if (route.name === 'favourites') {
              iconName = focused ? 'heart' : 'heart-outline';
            } else {
              iconName = 'ellipse-outline';
            }

            return <Ionicons name={iconName} size={28} color={color} />;
          },
        })}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarLabel: 'Home',

            // ✅ Header ON for Home so we get a top-right button
            headerShown: true,
            headerTitle: 'ShakeMap',
            headerStyle: { backgroundColor: theme.surface.sheet },
            headerTitleStyle: { color: theme.text.primary },
            headerTintColor: theme.text.primary,

            headerRight: () =>
              isAdmin ? (
                <TouchableOpacity
                  onPress={() => router.push('/moderation')}
                  style={{ marginRight: 14 }}
                >
                  <Ionicons name="shield-checkmark" size={24} color={theme.text.primary} />
                </TouchableOpacity>
              ) : null,
          }}
        />

        <Tabs.Screen
          name="explore"
          options={{
            title: 'Explore',
            tabBarLabel: 'Explore',
            headerShown: false,
          }}
        />

        <Tabs.Screen
          name="favourites"
          options={{
            title: 'Favourites',
            tabBarLabel: 'Favourites',
            headerShown: false,
          }}
        />
      </Tabs>
    </ExploreHighlightProvider>
  );
}
