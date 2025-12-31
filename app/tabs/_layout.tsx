// app/tabs/_layout.tsx
import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { theme } from '../../constants/colors';
import { ExploreHighlightProvider } from '../../context/ExploreHighlightContext';

export default function Layout() {
  return (
    <ExploreHighlightProvider>
      <Tabs
        screenOptions={({ route }) => ({
          headerShown: false,

          // Active / inactive colours
          tabBarActiveTintColor: theme.text.primary,
          tabBarInactiveTintColor: theme.text.muted,

          // Tab bar surface
          tabBarStyle: {
            height: 80,
            paddingBottom: 20,
            paddingTop: 10,
            backgroundColor: theme.surface.sheet,
            borderTopWidth: 0.5,
            borderTopColor: theme.surface.border,
          },

          // Label style (DON'T set color here, tintColor handles it)
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
          }}
        />
        <Tabs.Screen
          name="explore"
          options={{
            title: 'Explore',
            tabBarLabel: 'Explore',
          }}
        />
        <Tabs.Screen
          name="favourites"
          options={{
            title: 'Favourites',
            tabBarLabel: 'Favourites',
          }}
        />
      </Tabs>
    </ExploreHighlightProvider>
  );
}
