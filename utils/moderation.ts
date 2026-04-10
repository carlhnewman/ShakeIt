// utils/moderation.ts
import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
  writeBatch
} from 'firebase/firestore';
import { db } from '../firebase';

// 🔒 Admin UID(s)
const ADMIN_UIDS = new Set<string>(['JP7PKiVf2ZUjMEg6McrMbrozjf03']);

export function isAdmin(uid?: string | null) {
  return !!uid && ADMIN_UIDS.has(uid);
}

export type PendingPost = {
  id: string;
  shopId: string;
  userId?: string;
  caption?: string;
  photoUrls: string[];
  approved?: boolean;
  createdAt?: any;
};

/**
 * ✅ Global: Listen to ALL pending posts across ALL shops
 * Uses collectionGroup('posts') so you don't need shopId input.
 */
export function listenAllPendingPosts(
  onRows: (rows: PendingPost[]) => void,
  onError?: (e: any) => void,
) {
  const q = query(collectionGroup(db, 'posts'), orderBy('createdAt', 'desc'));

  return onSnapshot(
    q,
    (snap) => {
      const rows: PendingPost[] = snap.docs
        .map((d) => {
          const data = d.data() as any;

          // Only pending ones
          if (data.approved === true) return null;

          // Extract shopId from path: shops/{shopId}/posts/{postId}
          const shopId = d.ref.parent.parent?.id;
          if (!shopId) return null;

          return {
            id: d.id,
            shopId,
            userId: data.userId ?? '',
            caption: data.caption ?? '',
            photoUrls: Array.isArray(data.photoUrls) ? data.photoUrls : [],
            approved: !!data.approved,
            createdAt: data.createdAt ?? null,
          };
        })
        .filter(Boolean) as PendingPost[];

      onRows(rows);
    },
    (err) => onError?.(err),
  );
}

/**
 * ✅ Approve post (HARDENED)
 * - verifies post exists
 * - verifies shop doc exists (otherwise throws a clear error)
 * - marks post approved
 * - updates shops/{shopId}.previewPhotoUrl (only if valid https)
 * - does both updates in a batch (keeps state consistent)
 */
export async function approvePost(shopId: string, postId: string, adminUid: string) {
  const postRef = doc(db, `shops/${shopId}/posts/${postId}`);
  const shopRef = doc(db, `shops/${shopId}`);

  // 1) Verify post exists
  const postSnap = await getDoc(postRef);
  if (!postSnap.exists()) {
    throw new Error(`Post not found: shops/${shopId}/posts/${postId}`);
  }

  // 2) Verify shop exists (THIS is what your current version is missing)
  const shopSnap = await getDoc(shopRef);
  if (!shopSnap.exists()) {
  throw new Error(`Shop doc missing: shops/${shopId}.`);
}

  const data = postSnap.data() as any;

  const urlCandidate =
    Array.isArray(data?.photoUrls) && typeof data.photoUrls?.[0] === 'string'
      ? String(data.photoUrls[0]).trim()
      : '';

  const hasValidUrl = urlCandidate.startsWith('https://');

  // 3) Batch so we don't half-approve and then fail preview update
  const batch = writeBatch(db);

  batch.update(postRef, {
    approved: true,
    approvedAt: serverTimestamp(),
    approvedBy: adminUid,
  });

  if (hasValidUrl) {
    batch.update(shopRef, {
      previewPhotoUrl: urlCandidate,
      updatedAt: serverTimestamp(),
    });
  }

  await batch.commit();

  // Optional: if no valid URL, still approved but no preview change
  if (!hasValidUrl) {
    // not throwing — just means the upload/url write hasn't happened yet
    // (or the post has empty photoUrls)
    console.warn(`Approved post ${postId} but no valid https photoUrls[0] to set preview.`);
  }
}

/**
 * ❌ Reject post (deletes Firestore post doc)
 * NOTE: does NOT delete Firebase Storage files.
 */
export async function rejectPost(shopId: string, postId: string) {
  const refDoc = doc(db, `shops/${shopId}/posts/${postId}`);
  await deleteDoc(refDoc);
}

/**
 * (Optional / Legacy): per-shop pending listener
 */
export function listenPendingPostsForShop(
  shopId: string,
  onRows: (rows: PendingPost[]) => void,
  onError?: (e: any) => void,
) {
  const q = query(
    collection(db, `shops/${shopId}/posts`),
    where('approved', '==', false),
    orderBy('createdAt', 'desc'),
  );

  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          shopId,
          userId: data.userId ?? '',
          caption: data.caption ?? '',
          photoUrls: Array.isArray(data.photoUrls) ? data.photoUrls : [],
          approved: !!data.approved,
          createdAt: data.createdAt ?? null,
        } as PendingPost;
      });

      onRows(rows);
    },
    (err) => onError?.(err),
  );
}
