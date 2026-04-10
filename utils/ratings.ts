import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

export async function submitOrUpdateRating(params: {
  shopId: string;
  uid: string;
  rating: number; // 1..5
}) {
  const { shopId, uid, rating } = params;

  if (!shopId) throw new Error('shopId is required');
  if (!uid) throw new Error('uid is required');
  if (rating < 1 || rating > 5) throw new Error('rating must be 1..5');

  const shopRef = doc(db, 'shops', shopId);
  const userRatingRef = doc(db, 'shops', shopId, 'ratings', uid);

  await runTransaction(db, async (tx) => {
    const shopSnap = await tx.get(shopRef);
    const shopData = shopSnap.exists() ? shopSnap.data() as any : {};

    const avg = typeof shopData.ratingAverage === 'number' ? shopData.ratingAverage : 0;
    const count = typeof shopData.ratingCount === 'number' ? shopData.ratingCount : 0;

    const userSnap = await tx.get(userRatingRef);
    const hadPrev = userSnap.exists();
    const prev = hadPrev ? Number((userSnap.data() as any).rating) : null;

    // update aggregates safely
    let newCount = count;
    let newAvg = avg;

    if (!hadPrev) {
      // first ever rating from this user
      newCount = count + 1;
      newAvg = newCount === 0 ? rating : (avg * count + rating) / newCount;

      tx.set(userRatingRef, {
        rating,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      // user is changing their rating (count stays same)
      if (prev == null || Number.isNaN(prev)) {
        // edge case: doc exists but rating missing -> treat as new
        newCount = count + 1;
        newAvg = newCount === 0 ? rating : (avg * count + rating) / newCount;
      } else {
        newAvg = count === 0 ? rating : (avg * count - prev + rating) / count;
      }

      tx.set(
        userRatingRef,
        { rating, updatedAt: serverTimestamp() },
        { merge: true }
      );
    }

    tx.set(
      shopRef,
      {
        ratingAverage: newAvg,
        ratingCount: newCount,
        // optional: keep legacy field in sync so older screens don't break
        rating: newAvg,
      },
      { merge: true }
    );
  });
}
