// app/shake/[id].tsx
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  addDoc,
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../../constants/colors';
import { useAuth } from '../../context/AuthContext';
import { db, storage } from '../../firebase';

// ✅ NEW helper (create: utils/ratings.ts)
import { submitOrUpdateRating } from '../../utils/ratings';

// ✅ NEW: preferences (map app choice)
import { getPreferences } from '../../utils/preferences';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const DEFAULT_IMAGE = require('../../assets/images/defaultshake.png');

// ✅ Versioned favourites keys (MUST match favourites.tsx)
const FAV_KEY_V2 = 'favourites_v2';
const FAV_KEY_V1 = 'favourites';

// ✅ robust favourites parse + normalize
const parseFavs = (raw: string | null): string[] => {
  try {
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    return Array.from(
      new Set(arr.map((x) => String(x)).map((x) => x.trim()).filter((x) => x.length > 0)),
    );
  } catch {
    return [];
  }
};

type Shop = {
  id: string;
  name: string;
  area?: string;
  address?: string;

  // legacy / fallback
  rating?: number | null;

  // aggregate fields
  ratingAverage?: number | null;
  ratingCount?: number | null;

  milkshakePrice?: number | null;
  thickshakePrice?: number | null;
  latitude?: number | null;
  longitude?: number | null;

  // ✅ NEW: approved preview photo stored on shop doc
  previewPhotoUrl?: string | null;

  images: any[]; // array of require(...) or { uri: string }
};

type Post = {
  id: string;
  userId: string;
  photoUrls: string[];
  caption?: string;
  createdAt?: any;

  // ✅ NEW: approval gate
  approved?: boolean;
  approvedAt?: any;
  approvedBy?: string;
};

// ✅ NEW: comments (separate from photos)
type Comment = {
  id: string;
  userId: string;
  text: string;
  createdAt?: any;
};

// ✅ ADMIN: hardcode your UID for now (from logs)
const ADMIN_UIDS = new Set<string>(['JP7PKiVf2ZUjMEg6McrMbrozjf03']);

// ✅ helper: safe https image object
const safeUri = (url?: string | null) => {
  const u = typeof url === 'string' ? url.trim() : '';
  return u.startsWith('https://') ? { uri: u } : null;
};

// ✅ helper: short user tag
const shortUid = (uid?: string | null) => {
  const u = typeof uid === 'string' ? uid.trim() : '';
  if (!u) return '????';
  return u.slice(-4);
};

// ✅ helper: convert Firestore Timestamp / Date / number into Date
const toDateSafe = (v: any): Date | null => {
  if (!v) return null;

  // Firestore Timestamp
  if (typeof v?.toDate === 'function') {
    try {
      return v.toDate();
    } catch {
      return null;
    }
  }

  // already a Date
  if (v instanceof Date) return v;

  // millis number
  if (typeof v === 'number') return new Date(v);

  // { seconds, nanoseconds } shape
  if (typeof v?.seconds === 'number') return new Date(v.seconds * 1000);

  return null;
};

// ✅ helper: relative time text (2m ago / 3h ago / Yesterday / 12d ago)
const relativeTime = (createdAt: any) => {
  const d = toDateSafe(createdAt);
  if (!d) return '';

  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 0) return ''; // clock drift

  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;

  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 14) return `${diffDay}d ago`;

  // fallback to a simple date
  return d.toLocaleDateString();
};

export default function ShakeDetailsScreen() {
  const router = useRouter();
  const raw = useLocalSearchParams<{ id?: string | string[] }>();
const id = Array.isArray(raw.id) ? raw.id[0] : raw.id;
const shopId = typeof id === 'string' ? id.trim() : '';
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const isAdmin = !!user?.uid && ADMIN_UIDS.has(user.uid);

  const [shop, setShop] = useState<Shop | null>(null);
  const [loading, setLoading] = useState(true);

  // ✅ IMPORTANT: this MUST represent favourites_v2
  const [favourites, setFavourites] = useState<string[]>([]);

  // ⭐ rating state (per-user)
  const [myRating, setMyRating] = useState<number>(0);
  const [savedRating, setSavedRating] = useState<number>(0); // what they previously saved
  const [hasRated, setHasRated] = useState<boolean>(false);
  const [isEditingRating, setIsEditingRating] = useState<boolean>(false);
  const [loadingMyRating, setLoadingMyRating] = useState<boolean>(true);
  const [savingRating, setSavingRating] = useState<boolean>(false);

  // 📸 posts/photos
  const [posts, setPosts] = useState<Post[]>([]);
  const [loadingPosts, setLoadingPosts] = useState<boolean>(true);

  // ✅ CHANGED: captionDraft -> photoCaptionDraft (keeps photo captions separate)
  const [photoCaptionDraft, setPhotoCaptionDraft] = useState<string>('');

  // ✅ NEW: comments state
  const [comments, setComments] = useState<Comment[]>([]);
  const [loadingComments, setLoadingComments] = useState<boolean>(true);
  const [commentDraft, setCommentDraft] = useState<string>('');

  // ✅ NEW: staged photo (so caption/comment can be written before or after)
  const [pendingPhotoUri, setPendingPhotoUri] = useState<string | null>(null);

  // ✅ NEW: one “Post” action that can post comment and/or photo
  const [postingReview, setPostingReview] = useState<boolean>(false);

  // ✅ NEW: admin approve loading state (still used for the approval action, but not shown in UI here)
  const [approvingPostId, setApprovingPostId] = useState<string | null>(null);

  // ✅ NEW: full-screen gallery viewer (Google Maps style)
  const [galleryOpen, setGalleryOpen] = useState<boolean>(false);
  const [galleryIndex, setGalleryIndex] = useState<number>(0);
  const [galleryCurrent, setGalleryCurrent] = useState<number>(0);
  const galleryListRef = useRef<FlatList<any> | null>(null);

  // ✅ NEW: prevents repeated preview writes
  const lastPreviewSetRef = useRef<string | null>(null);

  // ✅ Load shop (LIVE Firestore listener)
useEffect(() => {
  if (!shopId) return;

  // 1) load favourites (v2) with one-time migration from v1
  (async () => {
    try {
      const rawV2 = await AsyncStorage.getItem(FAV_KEY_V2);
      if (rawV2) {
        setFavourites(parseFavs(rawV2));
        return;
      }

      const rawV1 = await AsyncStorage.getItem(FAV_KEY_V1);
      const migrated = parseFavs(rawV1);

      await AsyncStorage.setItem(FAV_KEY_V2, JSON.stringify(migrated));
      setFavourites(migrated);
    } catch {
      setFavourites([]);
    }
  })();

  setLoading(true);

  // 2) LIVE listener for shops/{id}
  const refDoc = doc(db, 'shops', shopId);

  const unsub = onSnapshot(
    refDoc,
    (snap) => {
      if (!snap.exists()) {
        setShop(null);
        setLoading(false);
        return;
      }

      const data = snap.data() as any;

      const milk = data.milkshakePrice ?? null;
      const thick = data.thickshakePrice ?? null;

      const legacyRating = data.rating ?? null;
      const ratingAverage = data.ratingAverage ?? null;
      const ratingCount = data.ratingCount ?? null;

      const previewPhotoUrl: string | null =
        typeof data.previewPhotoUrl === 'string' ? data.previewPhotoUrl : null;

      const previewObj = safeUri(previewPhotoUrl);

      let heroImages: any[] = [];
      if (previewObj) heroImages.push(previewObj);
      if (heroImages.length === 0) heroImages = [DEFAULT_IMAGE];

      const merged: Shop = {
        id: snap.id,
        name: String(data.name ?? 'Unknown shop'),
        area: typeof data.area === 'string' ? data.area : undefined,
        address: typeof data.address === 'string' ? data.address : '',

        rating: typeof legacyRating === 'number' ? legacyRating : null,
        ratingAverage: typeof ratingAverage === 'number' ? ratingAverage : null,
        ratingCount: typeof ratingCount === 'number' ? ratingCount : null,

        milkshakePrice: typeof milk === 'number' ? milk : null,
        thickshakePrice: typeof thick === 'number' ? thick : null,

        latitude: typeof data.latitude === 'number' ? data.latitude : null,
        longitude: typeof data.longitude === 'number' ? data.longitude : null,

        previewPhotoUrl,
        images: heroImages,
      };

      setShop(merged);
      setLoading(false);
    },
    (err) => {
      console.error('Shop listener error:', err);
      setShop(null);
      setLoading(false);
    },
  );

  return () => unsub();
}, [shopId]);

  // ✅ Live posts listener
  // - Admin: sees ALL posts
  // - Non-admin: sees only approved posts
  useEffect(() => {
    if (!shop?.id) return;

    setLoadingPosts(true);

    const base = collection(db, `shops/${shop.id}/posts`);

    const q = isAdmin
      ? query(base, orderBy('createdAt', 'desc'), limit(30))
      : query(base, where('approved', '==', true), orderBy('createdAt', 'desc'), limit(30));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: Post[] = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            userId: data.userId,
            photoUrls: Array.isArray(data.photoUrls) ? data.photoUrls : [],
            caption: data.caption ?? '',
            createdAt: data.createdAt ?? null,
            approved: !!data.approved,
            approvedAt: data.approvedAt ?? null,
            approvedBy: data.approvedBy ?? null,
          };
        });
        setPosts(rows);
        setLoadingPosts(false);
      },
      () => {
        setPosts([]);
        setLoadingPosts(false);
      },
    );

    return () => unsub();
  }, [shop?.id, isAdmin]);

  // ✅ NEW: Live comments listener (newest first)
  useEffect(() => {
    if (!shop?.id) return;

    setLoadingComments(true);

    const q = query(
      collection(db, `shops/${shop.id}/comments`),
      orderBy('createdAt', 'desc'),
      limit(50),
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: Comment[] = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            userId: data.userId ?? '',
            text: String(data.text ?? ''),
            createdAt: data.createdAt ?? null,
          };
        });

        setComments(rows.filter((c) => c.text.trim().length > 0));
        setLoadingComments(false);
      },
      () => {
        setComments([]);
        setLoadingComments(false);
      },
    );

    return () => unsub();
  }, [shop?.id]);

  // Load "my rating" (one per user per shop)
useEffect(() => {
  if (!shop?.id) return;

  // not logged in: reset and bail
  if (!user?.uid) {
    setMyRating(0);
    setSavedRating(0);
    setHasRated(false);
    setIsEditingRating(false);
    setLoadingMyRating(false);
    return;
  }

  setLoadingMyRating(true);

  const ratingRef = doc(db, `shops/${shop.id}/ratings/${user.uid}`);

  const unsub = onSnapshot(
    ratingRef,
    (snap) => {
      if (snap.exists()) {
        const data = snap.data() as any;
        const r = Number(data.rating) || 0;

        setMyRating(r);
        setSavedRating(r);
        setHasRated(r >= 1 && r <= 5);
        setIsEditingRating(false);
      } else {
        setMyRating(0);
        setSavedRating(0);
        setHasRated(false);
        setIsEditingRating(true);
      }
      setLoadingMyRating(false);
    },
    () => {
      setMyRating(0);
      setSavedRating(0);
      setHasRated(false);
      setIsEditingRating(false);
      setLoadingMyRating(false);
    },
  );

  return () => unsub();
}, [shop?.id, user?.uid]);

  const isFavourite = shop ? favourites.includes(shop.id) : false;

  const toggleFavourite = async () => {
    if (!shop) return;

    const updated = isFavourite
      ? favourites.filter((f) => f !== shop.id)
      : Array.from(new Set([...favourites, shop.id]));

    setFavourites(updated);

    // ✅ WRITE V2 (source of truth)
    await AsyncStorage.setItem(FAV_KEY_V2, JSON.stringify(updated));

    // ✅ ALSO write V1 (backwards compatibility if any old code still reads it)
    await AsyncStorage.setItem(FAV_KEY_V1, JSON.stringify(updated));
  };

  // ✅ Get directions: respect preference (Google/Apple) on iOS.
// On iOS we DO NOT trust canOpenURL — we just try the Google deep link and fall back.
const openMapsForShop = async (target: Shop) => {
  const hasCoords = target.latitude != null && target.longitude != null;

  const coords = hasCoords ? `${target.latitude},${target.longitude}` : '';
  const queryStr = encodeURIComponent(
    hasCoords ? coords : target.address ? `${target.name} ${target.address}` : target.name,
  );

  const appleUrl = hasCoords
    ? `http://maps.apple.com/?daddr=${coords}&dirflg=d`
    : `http://maps.apple.com/?daddr=${queryStr}&dirflg=d`;

  const googleAppUrl = hasCoords
    ? `comgooglemaps://?daddr=${coords}&directionsmode=driving`
    : `comgooglemaps://?daddr=${queryStr}&directionsmode=driving`;

  const googleWebUrl = hasCoords
    ? `https://www.google.com/maps/dir/?api=1&destination=${coords}`
    : `https://www.google.com/maps/dir/?api=1&destination=${queryStr}`;

  try {
    const prefs = await getPreferences();
    const preferred = prefs?.mapApp ?? 'google';

    if (Platform.OS === 'ios') {
      // ✅ If they explicitly chose Apple, use Apple first.
      if (preferred === 'apple') {
        try {
          await Linking.openURL(appleUrl);
          return;
        } catch (e) {
          // Apple failed for some reason → last resort
          await Linking.openURL(googleWebUrl);
          return;
        }
      }

      // ✅ Default/Google: TRY Google Maps app first, then Apple Maps.
      try {
        await Linking.openURL(googleAppUrl);
        return;
      } catch (e) {
        await Linking.openURL(appleUrl);
        return;
      }
    }

    // Android: prefer Google navigation intent, fallback to Google web
    const googleNav = hasCoords ? `google.navigation:q=${coords}` : `google.navigation:q=${queryStr}`;

    const canNav = await Linking.canOpenURL('google.navigation:');
    await Linking.openURL(canNav ? googleNav : googleWebUrl);
  } catch (e) {
    // last-ditch fallback
    try {
      await Linking.openURL(googleWebUrl);
    } catch (e2) {}
  }
};

  const refreshShopAggregates = async () => {
    if (!shop) return;

    try {
      const refDoc = doc(db, 'shops', shop.id);

      const unsub = onSnapshot(
        refDoc,
        (snap) => {
          if (!snap.exists()) return;
          const data = snap.data() as any;

          const ratingAverage =
            typeof data.ratingAverage === 'number' ? data.ratingAverage : null;
          const ratingCount =
            typeof data.ratingCount === 'number' ? data.ratingCount : null;

          setShop((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              ratingAverage: ratingAverage ?? prev.ratingAverage ?? null,
              ratingCount: ratingCount ?? prev.ratingCount ?? null,
              rating: typeof data.rating === 'number' ? data.rating : prev.rating,
            };
          });

          // one-shot update
          unsub();
        },
        () => {
          // ignore
        },
      );
    } catch {}
  };

  const saveRating = async () => {
    if (!shop) return;

    if (!user?.uid) {
      Alert.alert('Login required', 'Please log in to rate this shop.');
      return;
    }

    if (myRating < 1 || myRating > 5) {
      Alert.alert('Pick a rating', 'Please select 1–5 stars.');
      return;
    }

    if (hasRated && !isEditingRating) {
      Alert.alert('Locked', 'Tap “Change review” to update your rating.');
      return;
    }

    try {
      setSavingRating(true);

      await submitOrUpdateRating({
        shopId: shop.id,
        uid: user.uid,
        rating: myRating,
      });

      setSavedRating(myRating);
      setHasRated(true);
      setIsEditingRating(false);

      await refreshShopAggregates();

      Alert.alert(
        'Saved',
        hasRated ? 'Your rating has been updated.' : 'Your rating has been saved.',
      );
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to save rating.');
      if (hasRated) setMyRating(savedRating);
    } finally {
      setSavingRating(false);
    }
  };

  const canSaveRating = useMemo(() => {
    if (!user?.uid) return false;
    if (savingRating) return false;
    if (myRating < 1 || myRating > 5) return false;
    if (hasRated && !isEditingRating) return false;
    if (hasRated && myRating === savedRating) return false;
    return true;
  }, [user?.uid, myRating, savingRating, hasRated, isEditingRating, savedRating]);

  // ✅ CHANGED: pickImage() stages only (no upload)
  const pickImage = async (source: 'camera' | 'library') => {
    if (!shop) return;

    if (!user?.uid) {
      Alert.alert('Login required', 'Please log in to post a photo.');
      router.push('/login');
      return;
    }

    try {
      if (source === 'camera') {
        const camPerm = await ImagePicker.requestCameraPermissionsAsync();
        if (!camPerm.granted) {
          Alert.alert('Permission needed', 'Please allow camera access.');
          return;
        }
      } else {
        const libPerm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!libPerm.granted) {
          Alert.alert('Permission needed', 'Please allow photo access.');
          return;
        }
      }

      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({
              allowsEditing: true,
              quality: 1,
            })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true,
              quality: 1,
            });

      if (result.canceled) return;

      const uri = result.assets?.[0]?.uri;
      if (!uri) return;

      // ✅ IMPORTANT: stage only (no upload yet)
      setPendingPhotoUri(uri);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not pick photo.');
    }
  };

  const addPhoto = () => {
    Alert.alert('Add a photo', 'Choose a source', [
      { text: 'Take photo', onPress: () => pickImage('camera') },
      { text: 'Choose from library', onPress: () => pickImage('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  // ✅ Admin approve action (kept for completeness; your moderation screen does the real work)
  const approvePost = async (post: Post) => {
    if (!shop?.id) return;
    if (!isAdmin) return;

    const url = post.photoUrls?.[0];
    if (!url || !url.startsWith('https://')) {
      Alert.alert('No photo URL', 'This post has no valid photo URL to approve.');
      return;
    }

    try {
      setApprovingPostId(post.id);

      const postDoc = doc(db, `shops/${shop.id}/posts/${post.id}`);
      await updateDoc(postDoc, {
        approved: true,
        approvedAt: serverTimestamp(),
        approvedBy: user?.uid ?? 'admin',
      });

      // ✅ Set shop preview image immediately (drives Home screen previewPhotoUrl)
      const shopDoc = doc(db, 'shops', shop.id);
      await setDoc(
        shopDoc,
        {
          previewPhotoUrl: url,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      // ✅ update local shop images immediately (so user sees the hero update without reload)
      setShop((prev) => {
        if (!prev) return prev;
        const previewObj = safeUri(url);
        if (!previewObj) return prev;

        const already = prev.previewPhotoUrl === url;
        const images = already ? prev.images : [...prev.images, previewObj];

        return {
          ...prev,
          previewPhotoUrl: url,
          images,
        };
      });

      Alert.alert('Approved', 'Photo approved and set as shop preview.');
    } catch (e: any) {
      Alert.alert('Approve failed', e?.message ?? 'Could not approve this photo.');
    } finally {
      setApprovingPostId(null);
    }
  };

  // ✅ CHANGED: unified submit (comment and/or staged photo)
  const submitReview = async () => {
    if (!shop) return;

    const text = commentDraft.trim();
    const caption = photoCaptionDraft.trim();

    if (!user?.uid) {
      Alert.alert('Login required', 'Please log in to post.');
      router.push('/login');
      return;
    }

    // Nothing to post
    if (!pendingPhotoUri && !text) {
      Alert.alert('Nothing to post', 'Add a photo or write a comment first.');
      return;
    }

    try {
      setPostingReview(true);

      // 1) Comment (if typed)
      if (text) {
        await addDoc(collection(db, `shops/${shop.id}/comments`), {
          shopId: shop.id,
          userId: user.uid,
          text,
          createdAt: serverTimestamp(),
        });
        setCommentDraft('');
      }

      // 2) Photo (if selected)
      if (pendingPhotoUri) {
        const manipulated = await ImageManipulator.manipulateAsync(
          pendingPhotoUri,
          [{ resize: { width: 1280 } }],
          { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
        );

        const res = await fetch(manipulated.uri);
        const blob = await res.blob();

        const postRef = await addDoc(collection(db, `shops/${shop.id}/posts`), {
          shopId: shop.id,
          userId: user.uid,
          caption: caption ? caption : '',
          photoUrls: [],
          approved: false, // ✅ default to NOT approved
          createdAt: serverTimestamp(),
        });

        const fileName = `${postRef.id}.jpg`;
        const storagePath = `shop-photos/${shop.id}/${user.uid}/${fileName}`;
        const storageRef = ref(storage, storagePath);

        await uploadBytes(storageRef, blob);
        const downloadUrl = await getDownloadURL(storageRef);

        const postDoc = doc(db, `shops/${shop.id}/posts/${postRef.id}`);
        await updateDoc(postDoc, { photoUrls: [downloadUrl] });

        setPendingPhotoUri(null);
        setPhotoCaptionDraft('');

        Alert.alert('Posted', 'Photo uploaded — pending approval.');
        return;
      }

      Alert.alert('Posted', 'Thanks for contributing!');
    } catch (e: any) {
      Alert.alert('Failed', e?.message ?? 'Could not post.');
    } finally {
      setPostingReview(false);
    }
  };

  // ✅ NEW: approved-only gallery list (always)
  const approvedGallery = useMemo(() => {
    const out: { uri: string; caption?: string; postId: string }[] = [];
    posts.forEach((p) => {
      if (p.approved !== true) return;
      const cap = typeof p.caption === 'string' ? p.caption : '';
      (Array.isArray(p.photoUrls) ? p.photoUrls : []).forEach((u) => {
        const url = typeof u === 'string' ? u.trim() : '';
        if (url.startsWith('https://')) out.push({ uri: url, caption: cap, postId: p.id });
      });
    });
    return out;
  }, [posts]);

  // ✅ NEW: admin backfill previewPhotoUrl if missing (fixes Home placeholders)
  useEffect(() => {
    if (!isAdmin) return;
    if (!shop?.id) return;

    const latest = approvedGallery[0]?.uri ? approvedGallery[0].uri.trim() : '';
    if (!latest.startsWith('https://')) return;

    const current = typeof shop.previewPhotoUrl === 'string' ? shop.previewPhotoUrl.trim() : '';
    const hasPreview = current.startsWith('https://');
    if (hasPreview) return;

    if (lastPreviewSetRef.current === latest) return;
    lastPreviewSetRef.current = latest;

    // write once; shop listener will update UI + Home will start using it
    setDoc(
      doc(db, 'shops', shop.id),
      {
        previewPhotoUrl: latest,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    ).catch(() => {
      // ignore (permissions / offline)
    });
  }, [isAdmin, shop?.id, shop?.previewPhotoUrl, approvedGallery]);

  // ✅ Option A: "magic repair" hero-image effect removed
  // (No more auto-overriding hero image when placeholder)

  const latestApprovedCommunityPhoto = approvedGallery[0]?.uri ?? null;

  const openGalleryAt = (index: number) => {
    if (approvedGallery.length === 0) return;
    const safeIndex = Math.max(0, Math.min(index, approvedGallery.length - 1));
    setGalleryIndex(safeIndex);
    setGalleryCurrent(safeIndex);
    setGalleryOpen(true);

    // Let the modal render first, then jump
    setTimeout(() => {
      try {
        galleryListRef.current?.scrollToIndex({ index: safeIndex, animated: false });
      } catch {}
    }, 50);
  };

  if (loading) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <Text style={styles.loadingText}>Loading…</Text>
      </View>
    );
  }

  if (!shop) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.notFoundContainer}>
          <Text style={styles.notFoundTitle}>Shop not found</Text>
          <Text style={styles.notFoundText}>
            We couldn&apos;t find details for this milkshake spot.
          </Text>
        </View>
      </View>
    );
  }

  const priceLineParts: string[] = [];
  if (shop.thickshakePrice != null) {
    priceLineParts.push(
      `$${typeof shop.thickshakePrice === 'number'
        ? shop.thickshakePrice.toFixed(2)
        : shop.thickshakePrice} Thick Shake`,
    );
  }
  if (shop.milkshakePrice != null) {
    priceLineParts.push(
      `$${typeof shop.milkshakePrice === 'number'
        ? shop.milkshakePrice.toFixed(2)
        : shop.milkshakePrice} Milkshake`,
    );
  }
  const priceLine = priceLineParts.join(', ');

  const displayRating =
    typeof shop.ratingAverage === 'number'
      ? shop.ratingAverage
      : typeof shop.rating === 'number'
        ? shop.rating
        : null;

  const displayRatingCount = typeof shop.ratingCount === 'number' ? shop.ratingCount : null;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Back button */}
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={theme.nav.headerIcon} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {shop.name}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Photo strip (shop hero images) */}
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          style={styles.photoStrip}
        >
          {shop.images.map((img, index) => (
            <Image key={index} source={img} style={styles.photo} />
          ))}

          {/* Optional: show latest approved community photo as an extra slide */}
          {latestApprovedCommunityPhoto ? (
            <Image source={{ uri: latestApprovedCommunityPhoto }} style={styles.photo} />
          ) : null}
        </ScrollView>

        <View style={styles.content}>
          <View style={styles.titleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{shop.name}</Text>
              {shop.area && <Text style={styles.area}>{shop.area}</Text>}
              {shop.address && <Text style={styles.address}>{shop.address}</Text>}
            </View>

            {displayRating != null && (
              <View style={styles.ratingPill}>
                <Ionicons name="star" size={16} color={theme.text.onBrand} />
                <Text style={styles.ratingPillText}>
                  {displayRating.toFixed(1)}
                  {displayRatingCount != null ? ` (${displayRatingCount})` : ''}
                </Text>
              </View>
            )}
          </View>

          {priceLine ? <Text style={styles.price}>{priceLine}</Text> : null}

          {/* Buttons */}
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.favouriteButton, isFavourite && styles.favouriteButtonActive]}
              onPress={toggleFavourite}
            >
              <Ionicons
                name={isFavourite ? 'heart' : 'heart-outline'}
                size={20}
                color={theme.text.onBrand}
              />
              <Text style={styles.favouriteText}>
                {isFavourite ? 'Favourited' : 'Add to favourites'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.directionsButton} onPress={() => openMapsForShop(shop)}>
              <Ionicons name="map" size={20} color={theme.text.onBrand} />
              <Text style={styles.directionsText}>Get directions</Text>
            </TouchableOpacity>
          </View>

          {/* ⭐ Rate this shop */}
          <View style={styles.rateBox}>
            <Text style={styles.rateTitle}>Rate this shop</Text>

            {!user?.uid ? (
              <Text style={styles.rateHint}>Log in to leave a rating.</Text>
            ) : loadingMyRating ? (
              <View style={{ marginTop: 10 }}>
                <ActivityIndicator />
              </View>
            ) : (
              <>
                {hasRated && !isEditingRating ? (
                  <View style={styles.lockRow}>
                    <Text style={styles.lockText}>Your rating: ⭐ {savedRating.toFixed(0)}</Text>
                    <TouchableOpacity
                      style={styles.changeButton}
                      activeOpacity={0.85}
                      onPress={() => setIsEditingRating(true)}
                    >
                      <Text style={styles.changeButtonText}>Change review</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <Text style={styles.rateHint}>
                    Tap a star to {hasRated ? 'update' : 'save'} your rating.
                  </Text>
                )}

                <View style={[styles.starsRow, hasRated && !isEditingRating && { opacity: 0.45 }]}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <TouchableOpacity
                      key={n}
                      onPress={() => {
                        if (hasRated && !isEditingRating) return;
                        setMyRating(n);
                      }}
                      disabled={hasRated && !isEditingRating}
                      activeOpacity={0.8}
                      style={styles.starTap}
                    >
                      <Ionicons
                        name={n <= myRating ? 'star' : 'star-outline'}
                        size={26}
                        color={theme.text.primary}
                      />
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity
                  onPress={saveRating}
                  disabled={!canSaveRating}
                  activeOpacity={0.85}
                  style={[styles.saveRatingButton, !canSaveRating && { opacity: 0.5 }]}
                >
                  {savingRating ? (
                    <ActivityIndicator />
                  ) : (
                    <Text style={styles.saveRatingText}>
                      {hasRated ? 'Update rating' : 'Save rating'}
                    </Text>
                  )}
                </TouchableOpacity>

                {hasRated && isEditingRating && (
                  <TouchableOpacity
                    onPress={() => {
                      setMyRating(savedRating);
                      setIsEditingRating(false);
                    }}
                    activeOpacity={0.85}
                    style={styles.cancelEditBtn}
                  >
                    <Text style={styles.cancelEditText}>Cancel</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>

          {/* 📸 Community photos */}
          <View style={styles.photosSection}>
            <View style={styles.photosHeaderRow}>
              <Text style={styles.photosTitle}>Community photos</Text>

              {/* ✅ Option A: Moderate button removed from this page */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <TouchableOpacity onPress={addPhoto} activeOpacity={0.85} style={styles.addPhotoBtn}>
                  <Ionicons name="add" size={18} color={theme.text.onBrand} />
                  <Text style={styles.addPhotoText}>Add photo</Text>
                </TouchableOpacity>
              </View>
            </View>

            <Text style={styles.photosHint}>Post a photo even if you don’t want to rate or review.</Text>

            {/* ✅ staged photo */}
            {pendingPhotoUri ? (
              <View style={styles.pendingPhotoCard}>
                <Image source={{ uri: pendingPhotoUri }} style={styles.pendingPhotoImg} />

                <View style={{ flex: 1 }}>
                  <View style={styles.pendingPhotoTopRow}>
                    <Text style={styles.pendingPhotoTitle}>Ready to post</Text>

                    <TouchableOpacity
                      onPress={() => {
                        setPendingPhotoUri(null);
                        setPhotoCaptionDraft('');
                      }}
                      activeOpacity={0.85}
                      style={[styles.iconOnlyBtn, postingReview && { opacity: 0.5 }]}
                      disabled={postingReview}
                    >
                      <Ionicons name="trash-outline" size={18} color={theme.status.error} />
                    </TouchableOpacity>
                  </View>

                  <TextInput
                    value={photoCaptionDraft}
                    onChangeText={setPhotoCaptionDraft}
                    placeholder="Optional caption…"
                    placeholderTextColor={theme.text.muted}
                    style={styles.pendingPhotoCaption}
                  />

                  <TouchableOpacity
                    onPress={submitReview}
                    activeOpacity={0.85}
                    disabled={!user?.uid || postingReview}
                    style={[
                      styles.postPhotoBtn,
                      (!user?.uid || postingReview) && { opacity: 0.55 },
                    ]}
                  >
                    {postingReview ? (
                      <ActivityIndicator />
                    ) : (
                      <>
                        <Ionicons name="cloud-upload-outline" size={16} color={theme.text.onBrand} />
                        <Text style={styles.postPhotoText}>Post photo</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <Text style={styles.pendingPhotoTinyHint}>
                    Caption is optional — you can post photo-only.
                  </Text>
                </View>
              </View>
            ) : null}

            {loadingPosts ? (
              <View style={{ paddingVertical: 12 }}>
                <ActivityIndicator />
              </View>
            ) : approvedGallery.length === 0 ? (
              <View style={styles.emptyPhotos}>
                <Ionicons name="image-outline" size={20} color={theme.text.secondary} />
                <Text style={styles.emptyPhotosText}>No approved photos yet — be the first 📸</Text>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photosRow}>
                {approvedGallery.map((item, idx) => (
                  <TouchableOpacity
                    key={`${item.postId}:${item.uri}`}
                    activeOpacity={0.85}
                    onPress={() => openGalleryAt(idx)}
                    style={{ marginRight: 10, width: 120 }}
                  >
                    <Image source={{ uri: item.uri }} style={styles.photoThumb} />

                    {!!item.caption?.trim() && (
                      <Text numberOfLines={2} style={styles.photoCaption}>
                        {item.caption}
                      </Text>
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {/* ✅ Non-admin: explain approval gate */}
            {!isAdmin && <Text style={styles.approvalHint}>Photos appear here after approval.</Text>}
          </View>

          {/* 💬 Comments */}
          <View style={styles.commentsSection}>
            <Text style={styles.commentsTitle}>Comments</Text>
            <Text style={styles.commentsHint}>
              Leave a quick note — you don’t need to upload a photo.
            </Text>

            <View style={styles.commentComposer}>
              <TextInput
                value={commentDraft}
                onChangeText={setCommentDraft}
                placeholder={user?.uid ? 'Write a comment…' : 'Log in to comment…'}
                placeholderTextColor={theme.text.muted}
                style={styles.commentInput}
                editable={!!user?.uid && !postingReview}
                multiline
              />

              <View style={styles.commentActionsRow}>
                <TouchableOpacity
                  onPress={submitReview}
                  activeOpacity={0.85}
                  disabled={
                    !user?.uid ||
                    postingReview ||
                    (commentDraft.trim().length === 0 && !pendingPhotoUri)
                  }
                  style={[
                    styles.commentPostBtn,
                    (!user?.uid ||
                      postingReview ||
                      (commentDraft.trim().length === 0 && !pendingPhotoUri)) && {
                      opacity: 0.5,
                    },
                  ]}
                >
                  {postingReview ? (
                    <ActivityIndicator />
                  ) : (
                    <Text style={styles.commentPostText}>
                      {pendingPhotoUri && commentDraft.trim().length === 0 ? 'Post photo' : 'Post'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {loadingComments ? (
              <View style={{ paddingVertical: 12 }}>
                <ActivityIndicator />
              </View>
            ) : comments.length === 0 ? (
              <View style={styles.emptyComments}>
                <Ionicons
                  name="chatbubble-ellipses-outline"
                  size={20}
                  color={theme.text.secondary}
                />
                <Text style={styles.emptyCommentsText}>No comments yet — be the first 💬</Text>
              </View>
            ) : (
              <View style={{ marginTop: 10 }}>
                {comments.map((c) => {
                  const mine = !!user?.uid && c.userId === user.uid;
                  const who = mine ? 'You' : `User • ${shortUid(c.userId)}`;
                  const when = relativeTime(c.createdAt);

                  return (
                    <View key={c.id} style={styles.commentCard}>
                      <View style={styles.commentMetaRow}>
                        <Text style={styles.commentMetaText}>{who}</Text>
                        {!!when && <Text style={styles.commentMetaText}>{when}</Text>}
                      </View>

                      <Text style={styles.commentText}>{c.text}</Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      {/* ✅ Full-screen gallery modal (swipe through approved photos) */}
      <Modal
        visible={galleryOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setGalleryOpen(false)}
      >
        <View style={styles.galleryOverlay}>
          <View style={styles.galleryTopBar}>
            <Text style={styles.galleryCounter}>
              {approvedGallery.length ? `${galleryCurrent + 1} / ${approvedGallery.length}` : ''}
            </Text>

            <TouchableOpacity
              onPress={() => setGalleryOpen(false)}
              style={styles.galleryCloseBtn}
              activeOpacity={0.85}
            >
              <Ionicons name="close" size={24} color={theme.text.onDark} />
            </TouchableOpacity>
          </View>

          <FlatList
            ref={(r) => {
              galleryListRef.current = r as any;
            }}
            data={approvedGallery}
            keyExtractor={(it) => `${it.postId}:${it.uri}`}
            horizontal
            pagingEnabled
            initialScrollIndex={galleryIndex}
            getItemLayout={(_, index) => ({
              length: SCREEN_WIDTH,
              offset: SCREEN_WIDTH * index,
              index,
            })}
            showsHorizontalScrollIndicator={false}
            onScrollToIndexFailed={() => {
              // If for some reason it fails, just ignore and keep the modal open
            }}
            onMomentumScrollEnd={(e) => {
              const x = e.nativeEvent.contentOffset.x;
              const i = Math.round(x / SCREEN_WIDTH);
              if (Number.isFinite(i)) setGalleryCurrent(i);
            }}
            renderItem={({ item }) => (
              <View style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT, justifyContent: 'center' }}>
                <Image source={{ uri: item.uri }} style={styles.galleryImage} resizeMode="contain" />

                {!!item.caption?.trim() && (
                  <View style={styles.galleryCaptionWrap}>
                    <Text style={styles.galleryCaption} numberOfLines={3}>
                      {item.caption}
                    </Text>
                  </View>
                )}
              </View>
            )}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.app.screenBackground,
  },
  loadingText: {
    padding: 16,
    color: theme.text.primary,
  },
  notFoundContainer: {
    padding: 16,
  },
  notFoundTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
    color: theme.text.primary,
  },
  notFoundText: {
    color: theme.text.secondary,
  },
  headerRow: {
    flexDirection: 'row',
  alignItems: 'center',
  paddingHorizontal: 12,
  paddingTop: 8,
  paddingBottom: 8,
  backgroundColor: theme.nav.headerBackground,
},
  backButton: {
    padding: 4,
    marginRight: 4,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    color: theme.nav.headerText,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  photoStrip: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH * 0.55,
    backgroundColor: theme.app.screenBackground,
  },
  photo: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH * 0.55,
    resizeMode: 'cover',
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  name: {
    fontSize: 26,
    fontWeight: '800',
    color: theme.text.primary,
  },
  area: {
    fontSize: 16,
    color: theme.text.secondary,
    marginTop: 2,
  },
  address: {
    fontSize: 14,
    color: theme.text.secondary,
    marginTop: 2,
  },
  ratingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.brand.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    marginLeft: 8,
    marginTop: 4,
  },
  ratingPillText: {
    color: theme.text.onBrand,
    fontWeight: '700',
    marginLeft: 4,
  },
  price: {
    marginTop: 10,
    fontSize: 16,
    color: theme.text.primary,
  },

  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    marginBottom: 22,
    gap: 10,
  },
  favouriteButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    paddingVertical: 11,
    backgroundColor: theme.controls.buttonPrimaryBg,
  },
  favouriteButtonActive: {
    backgroundColor: theme.brand.accentSoft,
  },
  favouriteText: {
    marginLeft: 6,
    color: theme.text.onBrand,
    fontSize: 15,
    fontWeight: '700',
  },
  directionsButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    paddingVertical: 11,
    backgroundColor: theme.controls.buttonSecondaryBg,
  },
  directionsText: {
    marginLeft: 6,
    color: theme.text.onBrand,
    fontSize: 15,
    fontWeight: '700',
  },

  rateBox: {
    marginTop: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.surface.border,
    backgroundColor: theme.surface.card,
  },
  rateTitle: {
    color: theme.text.primary,
    fontWeight: '900',
    fontSize: 16,
  },
  rateHint: {
    marginTop: 6,
    color: theme.text.secondary,
    fontWeight: '600',
  },
  lockRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  lockText: {
    color: theme.text.primary,
    fontWeight: '800',
  },
  changeButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: theme.brand.primarySoft,
    borderWidth: 1,
    borderColor: theme.surface.border,
  },
  changeButtonText: {
    color: theme.text.primary,
    fontWeight: '900',
  },
  starsRow: {
    flexDirection: 'row',
    marginTop: 10,
  },
  starTap: {
    paddingVertical: 6,
    paddingHorizontal: 6,
    marginRight: 6,
  },
  saveRatingButton: {
    marginTop: 12,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.controls.buttonPrimaryBg,
  },
  saveRatingText: {
    color: theme.text.onBrand,
    fontWeight: '900',
    fontSize: 16,
  },
  cancelEditBtn: {
    marginTop: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  cancelEditText: {
    color: theme.text.muted,
    fontWeight: '800',
  },

  photosSection: {
    marginTop: 22,
    paddingBottom: 6,
  },
  photosHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  photosTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: theme.text.primary,
  },
  addPhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: theme.controls.buttonPrimaryBg,
  },
  addPhotoText: {
    color: theme.text.onBrand,
    fontWeight: '900',
  },
  photosHint: {
    marginTop: 6,
    color: theme.text.secondary,
    fontWeight: '600',
  },

  pendingPhotoCard: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.surface.border,
    backgroundColor: theme.surface.card,
  },
  pendingPhotoImg: {
    width: 74,
    height: 74,
    borderRadius: 12,
    backgroundColor: theme.surface.card,
  },
  pendingPhotoTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 8,
  },
  pendingPhotoTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: theme.text.primary,
  },
  iconOnlyBtn: {
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.brand.primarySoft,
    borderWidth: 1,
    borderColor: theme.surface.border,
  },
  pendingPhotoCaption: {
    borderWidth: 1,
    borderColor: theme.surface.border,
    backgroundColor: theme.surface.card,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: theme.text.primary,
    fontWeight: '600',
  },
  postPhotoBtn: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: theme.controls.buttonPrimaryBg,
  },
  postPhotoText: {
    color: theme.text.onBrand,
    fontWeight: '900',
    fontSize: 15,
  },
  pendingPhotoTinyHint: {
    marginTop: 8,
    color: theme.text.muted,
    fontWeight: '600',
    fontSize: 12,
  },

  emptyPhotos: {
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.surface.border,
    backgroundColor: theme.surface.card,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  emptyPhotosText: {
    color: theme.text.secondary,
    fontWeight: '700',
  },
  photosRow: {
    marginTop: 12,
  },
  photoThumb: {
    width: 96,
    height: 96,
    borderRadius: 12,
    backgroundColor: theme.surface.card,
  },
  photoCaption: {
    marginTop: 6,
    fontSize: 12,
    color: theme.text.secondary,
    fontWeight: '600',
  },
  approvalHint: {
    marginTop: 10,
    color: theme.text.muted,
    fontWeight: '700',
    fontSize: 12,
  },

  commentsSection: {
    marginTop: 22,
    paddingBottom: 10,
  },
  commentsTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: theme.text.primary,
  },
  commentsHint: {
    marginTop: 6,
    color: theme.text.secondary,
    fontWeight: '600',
  },
  commentComposer: {
    marginTop: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.surface.border,
    backgroundColor: theme.surface.card,
    padding: 12,
  },
  commentInput: {
    minHeight: 44,
    color: theme.text.primary,
    fontWeight: '600',
  },
  commentActionsRow: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  commentPostBtn: {
    height: 42,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.controls.buttonPrimaryBg,
    paddingHorizontal: 18,
  },
  commentPostText: {
    color: theme.text.onBrand,
    fontWeight: '900',
    fontSize: 15,
  },
  emptyComments: {
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.surface.border,
    backgroundColor: theme.surface.card,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  emptyCommentsText: {
    color: theme.text.secondary,
    fontWeight: '700',
  },
  commentCard: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.surface.border,
    backgroundColor: theme.surface.card,
    marginBottom: 10,
  },
  commentMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  commentMetaText: {
    color: theme.text.muted,
    fontWeight: '700',
    fontSize: 12,
  },
  commentText: {
    color: theme.text.primary,
    fontWeight: '600',
    lineHeight: 18,
  },

  // ✅ NEW: gallery modal styles
  galleryOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
  },
  galleryTopBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    paddingTop: 60,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  galleryCounter: {
    color: theme.text.onDark,
    fontWeight: '900',
    fontSize: 14,
  },
  galleryCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  galleryImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  galleryCaptionWrap: {
    position: 'absolute',
    bottom: 40,
    left: 16,
    right: 16,
    padding: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  galleryCaption: {
    color: theme.text.onDark,
    fontWeight: '700',
    lineHeight: 18,
  },
});
