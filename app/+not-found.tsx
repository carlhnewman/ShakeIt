// app/+not-found.tsx
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../constants/colors';

export default function NotFound() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>404</Text>
      <Text style={styles.message}>Shake not found.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.app.screenBackground,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 48,
    fontWeight: 'bold',
    marginBottom: 16,
    color: theme.text.primary,
  },
  message: {
    fontSize: 18,
    color: theme.text.secondary,
  },
});
