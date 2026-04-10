import AsyncStorage from '@react-native-async-storage/async-storage';

export type Preferences = {
  units: 'km' | 'mi';
  autoCenterMap: boolean;
  defaultZoom: 'near' | 'normal' | 'far';
  notifyNearby: boolean;
  notifyFavourites: boolean;
  shareOnReviews: boolean;

  mapApp: 'google' | 'apple';
};

export const DEFAULT_PREFS: Preferences = {
  units: 'km',
  autoCenterMap: true,
  defaultZoom: 'normal',
  notifyNearby: true,
  notifyFavourites: true,
  shareOnReviews: false,

  mapApp: 'google',
};

const KEY = 'userPreferences';

export async function getPreferences(): Promise<Preferences> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return DEFAULT_PREFS;

  try {
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    return { ...DEFAULT_PREFS, ...parsed };
  } catch {
    return DEFAULT_PREFS;
  }
}

export async function setPreferences(update: Partial<Preferences>) {
  const current = await getPreferences();
  const next: Preferences = { ...current, ...update };
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
}
