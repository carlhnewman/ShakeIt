// app/moderation.tsx
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Image,
    SafeAreaView,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { theme } from '../constants/colors';
import { useAuth } from '../context/AuthContext';
import { approvePost, isAdmin, listenAllPendingPosts, PendingPost, rejectPost } from '../utils/moderation';

export default function ModerationScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [rows, setRows] = useState<PendingPost[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  const admin = useMemo(() => isAdmin(user?.uid), [user?.uid]);

  useEffect(() => {
    if (!admin) {
      Alert.alert('Not allowed', 'Admin only.');
      router.back();
    }
  }, [admin, router]);

  useEffect(() => {
    if (!admin) return;

    setLoading(true);

    const unsub = listenAllPendingPosts(
      (pending) => {
        setRows(pending);
        setLoading(false);
      },
      (e) => {
        setLoading(false);
        Alert.alert('Listener error', e?.message ?? 'Unknown error');
      },
    );

    return unsub;
  }, [admin]);

  const onApprove = async (shopId: string, postId: string) => {
    if (!user?.uid) {
      Alert.alert('Login required', 'You must be logged in as admin.');
      return;
    }

    try {
      setApprovingId(postId);
      await approvePost(shopId, postId, user.uid);
    } catch (e: any) {
      Alert.alert('Approve failed', e?.message ?? 'Unknown error');
    } finally {
      setApprovingId(null);
    }
  };

  const onReject = (item: PendingPost) => {
    Alert.alert('Reject post?', 'This will delete the post from the database.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            setRejectingId(item.id);
            await rejectPost(item.shopId, item.id);
          } catch (e: any) {
            Alert.alert('Reject failed', e?.message ?? 'Unknown error');
          } finally {
            setRejectingId(null);
          }
        },
      },
    ]);
  };

  if (!admin) return null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.app.screenBackground }}>
      <View style={{ padding: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 6, marginRight: 8 }}>
            <Ionicons name="chevron-back" size={28} color={theme.text.primary} />
          </TouchableOpacity>

          <Text style={{ fontSize: 22, fontWeight: '800', color: theme.text.primary }}>
            Admin Moderation
          </Text>
        </View>

        <Text style={{ marginTop: 2, color: theme.text.muted }}>
          Pending posts across all shops (approved == false)
        </Text>

        {loading ? (
          <View style={{ marginTop: 20 }}>
            <ActivityIndicator />
          </View>
        ) : rows.length === 0 ? (
          <Text style={{ marginTop: 20, color: theme.text.muted }}>No pending posts 🎉</Text>
        ) : (
          <FlatList
            style={{ marginTop: 16 }}
            data={rows}
            keyExtractor={(item) => `${item.shopId}:${item.id}`}
            renderItem={({ item }) => {
              const firstUrl =
                Array.isArray(item.photoUrls) && item.photoUrls.length > 0 ? item.photoUrls[0] : null;

              const isApproving = approvingId === item.id;
              const isRejecting = rejectingId === item.id;
              const disabled = isApproving || isRejecting;

              return (
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: theme.surface.border,
                    borderRadius: 14,
                    padding: 12,
                    marginBottom: 14,
                    backgroundColor: theme.surface.sheet,
                  }}
                >
                  {firstUrl ? (
                    <Image
                      source={{ uri: firstUrl }}
                      style={{ width: '100%', height: 220, borderRadius: 12 }}
                      resizeMode="cover"
                    />
                  ) : null}

                  <Text style={{ marginTop: 10, fontWeight: '700', color: theme.text.primary }}>
                    {item.caption?.trim()?.length ? item.caption : '(no caption)'}
                  </Text>

                  <Text style={{ marginTop: 6, color: theme.text.muted }}>Shop: {item.shopId}</Text>
                  <Text style={{ marginTop: 4, color: theme.text.muted }}>Post: {item.id}</Text>

                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                    <TouchableOpacity
                      onPress={() => onReject(item)}
                      disabled={disabled}
                      style={{
                        flex: 1,
                        paddingVertical: 12,
                        borderRadius: 12,
                        alignItems: 'center',
                        backgroundColor: (theme.controls as any)?.buttonDangerBg ?? '#d9534f',
                        opacity: disabled ? 0.6 : 1,
                      }}
                    >
                      {isRejecting ? (
                        <ActivityIndicator />
                      ) : (
                        <Text style={{ color: theme.text.onBrand, fontWeight: '900' }}>Reject</Text>
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => onApprove(item.shopId, item.id)}
                      disabled={disabled}
                      style={{
                        flex: 1,
                        paddingVertical: 12,
                        borderRadius: 12,
                        alignItems: 'center',
                        backgroundColor: theme.controls.buttonPrimaryBg,
                        opacity: disabled ? 0.6 : 1,
                      }}
                    >
                      {isApproving ? (
                        <ActivityIndicator />
                      ) : (
                        <Text style={{ color: theme.text.onBrand, fontWeight: '900' }}>Approve</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              );
            }}
          />
        )}
      </View>
    </SafeAreaView>
  );
}
