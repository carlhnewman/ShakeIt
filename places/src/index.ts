import * as admin from "firebase-admin";
import { defineSecret } from "firebase-functions/params";
import { setGlobalOptions } from "firebase-functions/v2";
import { onRequest } from "firebase-functions/v2/https";

if (!admin.apps.length) {
  admin.initializeApp();
}

setGlobalOptions({
  region: "australia-southeast1",
  maxInstances: 10,
});

const PLACES_API_KEY = defineSecret("PLACES_API_KEY");
const ADMIN_BOOTSTRAP_KEY = defineSecret("ADMIN_BOOTSTRAP_KEY");

function setCors(res: any) {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.set("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
}

function sendJson(res: any, status: number, body: any) {
  setCors(res);
  res.status(status);
  res.set("Content-Type", "application/json");
  res.send(JSON.stringify(body ?? {}));
}

function sendNoContent(res: any) {
  setCors(res);
  res.status(204).send("");
}

function isFiniteNumber(n: any): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function asNumber(x: any): number | null {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (typeof x === "string" && x.trim() !== "" && Number.isFinite(Number(x))) {
    return Number(x);
  }
  return null;
}

function requirePostJson(req: any, res: any): any | null {
  if (req.method === "OPTIONS") {
    sendNoContent(res);
    return null;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed. Use POST." });
    return null;
  }

  return req.body ?? {};
}

function clampRadiusMeters(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.floor(n)));
}

async function requireAuth(req: any, res: any) {
  const header = String(req.headers?.authorization ?? "");
  const match = header.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();

  if (!token) {
    sendJson(res, 401, { error: "Missing Authorization bearer token" });
    return null;
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    const isAdmin = decoded?.admin === true;
    return { uid: decoded.uid, isAdmin, decoded };
  } catch {
    sendJson(res, 401, { error: "Invalid or expired token" });
    return null;
  }
}

function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000;

  const toRad = (d: number) => (d * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export const placesAutocompleteHttp = onRequest(
  { secrets: [PLACES_API_KEY] },
  async (req, res) => {
    if (req.method === "GET") {
      return sendJson(res, 200, { ok: true, name: "placesAutocompleteHttp" });
    }

    const body = requirePostJson(req, res);
    if (!body) return;

    const input = typeof body.input === "string" ? body.input.trim() : "";
    const lat = asNumber(body.latitude);
    const lon = asNumber(body.longitude);

    const country =
      typeof body.country === "string" ? body.country : "nz";

    const language =
      typeof body.language === "string" ? body.language : "en-NZ";

    const radiusMeters = asNumber(body.radiusMeters) ?? 50000;

    if (!input || input.length < 2) {
      return sendJson(res, 200, { predictions: [] });
    }

    if (lat == null || lon == null) {
      return sendJson(res, 400, { error: "Missing latitude/longitude" });
    }

    const key = PLACES_API_KEY.value();

    const url =
  "https://maps.googleapis.com/maps/api/place/autocomplete/json" +
  `?input=${encodeURIComponent(input)}` +
  `&key=${encodeURIComponent(key)}` +
  `&language=${encodeURIComponent(language)}` +
  `&components=country:${encodeURIComponent(country)}` +
  `&location=${lat},${lon}` +
  `&radius=${clampRadiusMeters(radiusMeters,1000,100000)}` +
  "&strictbounds=true";

    try {
      const r = await fetch(url);
      const j = await r.json();

      const rows = Array.isArray(j?.predictions) ? j.predictions : [];

      const predictions = rows
        .map((p: any) => {
          const placeId =
            typeof p.place_id === "string" ? p.place_id : "";

          const description =
            typeof p.description === "string" ? p.description : "";

          if (!placeId || !description) return null;

          return { placeId, description };
        })
        .filter(Boolean);

      return sendJson(res, 200, { predictions });
    } catch {
      return sendJson(res, 500, { error: "Autocomplete failed" });
    }
  }
);

export const placeDetailsHttp = onRequest(
  { secrets: [PLACES_API_KEY] },
  async (req, res) => {
    if (req.method === "GET") {
      return sendJson(res, 200, { ok: true, name: "placeDetailsHttp" });
    }

    const body = requirePostJson(req, res);
    if (!body) return;

    const placeId =
      typeof body.placeId === "string" ? body.placeId.trim() : "";

    if (!placeId) {
      return sendJson(res, 400, { error: "Missing placeId" });
    }

    const key = PLACES_API_KEY.value();

    const url =
      `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`;

    try {
      const r = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask":
            "displayName,formattedAddress,location",
        },
      });

      const j: any = await r.json();

      if (!r.ok) {
        return sendJson(res, 400, {
          error: "Places API place details failed",
          debug: j,
        });
      }

      const name =
        typeof j?.displayName?.text === "string"
          ? j.displayName.text.trim()
          : "";

      const address =
        typeof j?.formattedAddress === "string"
          ? j.formattedAddress.trim()
          : "";

      const plat = j?.location?.latitude;
      const plon = j?.location?.longitude;

      if (
        !name ||
        !address ||
        !isFiniteNumber(plat) ||
        !isFiniteNumber(plon)
      ) {
        return sendJson(res, 400, {
          error: "Google returned incomplete details",
          debug: j,
        });
      }

      return sendJson(res, 200, {
        name,
        address,
        latitude: plat,
        longitude: plon,
      });
    } catch {
      return sendJson(res, 500, {
        error: "Place details failed",
      });
    }
  }
);

export const createShopHttp = onRequest(async (req, res) => {
  if (req.method === "GET") {
    return sendJson(res, 200, { ok: true, name: "createShopHttp" });
  }

  const body = requirePostJson(req, res);
  if (!body) return;

  const authCtx = await requireAuth(req, res);
  if (!authCtx) return;

  const { uid, isAdmin } = authCtx;

  const googlePlaceId =
    typeof body.googlePlaceId === "string"
      ? body.googlePlaceId.trim()
      : "";

  const name =
    typeof body.name === "string" ? body.name.trim() : "";

  const address =
    typeof body.address === "string"
      ? body.address.trim()
      : "";

  const latitude = asNumber(body.latitude);
  const longitude = asNumber(body.longitude);

  const shopKey =
    typeof body.shopKey === "string" ? body.shopKey.trim() : "";

  const placeDescription =
    typeof body.placeDescription === "string"
      ? body.placeDescription.trim()
      : "";

  const milkshakePrice =
    body.milkshakePrice === null ||
    body.milkshakePrice === undefined
      ? null
      : asNumber(body.milkshakePrice);

  const thickshakePrice =
    body.thickshakePrice === null ||
    body.thickshakePrice === undefined
      ? null
      : asNumber(body.thickshakePrice);

  if (
    !googlePlaceId ||
    !name ||
    !address ||
    latitude == null ||
    longitude == null ||
    !shopKey
  ) {
    return sendJson(res, 400, {
      error:
        "Missing required fields (googlePlaceId, name, address, latitude, longitude, shopKey)",
    });
  }

  const approved = isAdmin === true;

  const db = admin.firestore();

  const indexRef =
    db.collection("shopPlaceIndex").doc(googlePlaceId);

  const rateRef =
    db.collection("rateLimits").doc(uid);

  const WINDOW_MS = 30000;
  const nowMs = Date.now();

  try {
    const result = await db.runTransaction(async (tx) => {
      const rateSnap = await tx.get(rateRef);

      const lastMs = rateSnap.exists
        ? Number(rateSnap.data()?.lastCreateMs ?? 0)
        : 0;

      if (Number.isFinite(lastMs) && nowMs - lastMs < WINDOW_MS) {
        throw new Error("RATE_LIMIT");
      }

      tx.set(
        rateRef,
        {
          lastCreateMs: nowMs,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      const idxSnap = await tx.get(indexRef);

      if (idxSnap.exists) {
        const existingShopId = String(
          idxSnap.data()?.shopId ?? ""
        ).trim();

        if (existingShopId) {
          return {
            created: false,
            shopId: existingShopId,
            approved,
          };
        }
      }

      const shopRef = db.collection("shops").doc();

      const now =
        admin.firestore.FieldValue.serverTimestamp();

      tx.set(shopRef, {
        name,
        address,
        latitude,
        longitude,
        googlePlaceId,
        shopKey,

        placeDescription: placeDescription || null,

        imageKey: null,
        milkshakePrice: milkshakePrice ?? null,
        thickshakePrice: thickshakePrice ?? null,

        rating: null,
        ratingAverage: null,
        ratingCount: 0,

        approved,
        submittedBy: uid,
        submittedAt: now,
        approvedBy: approved ? uid : null,
        approvedAt: approved ? now : null,

        createdAt: now,
        updatedAt: now,
      });

      tx.set(indexRef, {
        shopId: shopRef.id,
        googlePlaceId,
        createdAt: now,
      });

      return {
        created: true,
        shopId: shopRef.id,
        approved,
      };
    });

    return sendJson(res, 200, result);
  } catch (e: any) {
    if (String(e?.message ?? "") === "RATE_LIMIT") {
      return sendJson(res, 429, {
        error: "Please wait before adding another business.",
      });
    }

    console.error("createShopHttp failed", e);

    return sendJson(res, 500, {
      error: "Create shop failed",
    });
  }
});

export const setAdminClaimHttp = onRequest(
  { secrets: [ADMIN_BOOTSTRAP_KEY] },
  async (req, res) => {
    if (req.method === "GET") {
      return sendJson(res, 200, { ok: true, name: "setAdminClaimHttp" });
    }

    const body = requirePostJson(req, res);
    if (!body) return;

    const providedKey =
      typeof body.bootstrapKey === "string"
        ? body.bootstrapKey
        : "";

    const expectedKey = ADMIN_BOOTSTRAP_KEY.value();

    if (providedKey !== expectedKey) {
      return sendJson(res, 403, { error: "Forbidden" });
    }

    const uid =
      typeof body.uid === "string" ? body.uid.trim() : "";

    if (!uid) {
      return sendJson(res, 400, { error: "Missing uid" });
    }

    try {
      await admin.auth().setCustomUserClaims(uid, {
        admin: true,
      });

      return sendJson(res, 200, {
        ok: true,
        message: "Admin claim set",
        uid,
      });
    } catch (e) {
      console.error(e);

      return sendJson(res, 500, {
        error: "Failed to set admin claim",
      });
    }
  }
);

export const getNearbyShopsHttp = onRequest(async (req, res) => {
  const body = requirePostJson(req, res);
  if (!body) return;

  const lat = asNumber(body.latitude);
  const lon = asNumber(body.longitude);
  const radiusMeters = asNumber(body.radiusMeters) ?? 5000;

  if (lat == null || lon == null) {
    return sendJson(res, 400, { error: "Missing latitude/longitude" });
  }

  const db = admin.firestore();

  try {
    const shopsSnap = await db.collection("shops").get();
    const shops = shopsSnap.docs
      .map((doc) => {
        const data = doc.data();
        if (
          !data.latitude ||
          !data.longitude ||
          !isFiniteNumber(data.latitude) ||
          !isFiniteNumber(data.longitude)
        ) {
          return null;
        }
        const dist = distanceMeters(lat, lon, data.latitude, data.longitude);
        return { id: doc.id, ...data, distanceMeters: dist };
      })
      .filter((s) => s && s.distanceMeters <= clampRadiusMeters(radiusMeters, 0, 100000))
      .sort((a, b) => (a!.distanceMeters - b!.distanceMeters));

    return sendJson(res, 200, { shops });
  } catch (e) {
    console.error("getNearbyShopsHttp failed", e);
    return sendJson(res, 500, { error: "Failed to fetch nearby shops" });
  }
});

export const updateShopHttp = onRequest(async (req, res) => {
  const body = requirePostJson(req, res);
  if (!body) return;

  const authCtx = await requireAuth(req, res);
  if (!authCtx) return;
  const { uid, isAdmin } = authCtx;

  const shopId = typeof body.shopId === "string" ? body.shopId.trim() : "";
  if (!shopId) {
    return sendJson(res, 400, { error: "Missing shopId" });
  }

  const updates: any = {};
  if (typeof body.name === "string") updates.name = body.name.trim();
  if (typeof body.address === "string") updates.address = body.address.trim();
  if (isFiniteNumber(body.latitude)) updates.latitude = body.latitude;
  if (isFiniteNumber(body.longitude)) updates.longitude = body.longitude;
  if (isFiniteNumber(body.milkshakePrice)) updates.milkshakePrice = body.milkshakePrice;
  if (isFiniteNumber(body.thickshakePrice)) updates.thickshakePrice = body.thickshakePrice;
  if (typeof body.placeDescription === "string") updates.placeDescription = body.placeDescription.trim();

  if (Object.keys(updates).length === 0) {
    return sendJson(res, 400, { error: "No valid fields to update" });
  }

  const db = admin.firestore();
  const shopRef = db.collection("shops").doc(shopId);

  try {
    const shopSnap = await shopRef.get();
    if (!shopSnap.exists) {
      return sendJson(res, 404, { error: "Shop not found" });
    }

    const shopData = shopSnap.data();
    if (!isAdmin && shopData?.submittedBy !== uid) {
      return sendJson(res, 403, { error: "Not authorized to update this shop" });
    }

    updates.updatedAt = admin.firestore.FieldValue.serverTimestamp();
    await shopRef.update(updates);

    return sendJson(res, 200, { ok: true, shopId, updates });
  } catch (e) {
    console.error("updateShopHttp failed", e);
    return sendJson(res, 500, { error: "Failed to update shop" });
  }
});

export const deleteShopHttp = onRequest(async (req, res) => {
  const body = requirePostJson(req, res);
  if (!body) return;

  const authCtx = await requireAuth(req, res);
  if (!authCtx) return;
  const { uid, isAdmin } = authCtx;

  const shopId = typeof body.shopId === "string" ? body.shopId.trim() : "";
  if (!shopId) {
    return sendJson(res, 400, { error: "Missing shopId" });
  }

  const db = admin.firestore();
  const shopRef = db.collection("shops").doc(shopId);

  try {
    const shopSnap = await shopRef.get();
    if (!shopSnap.exists) {
      return sendJson(res, 404, { error: "Shop not found" });
    }

    const shopData = shopSnap.data();
    if (!isAdmin && shopData?.submittedBy !== uid) {
      return sendJson(res, 403, { error: "Not authorized to delete this shop" });
    }

    await shopRef.delete();

    // Also remove from index if exists
    const indexRef = db.collection("shopPlaceIndex").doc(shopData?.googlePlaceId ?? "");
    await indexRef.delete();

    return sendJson(res, 200, { ok: true, shopId });
  } catch (e) {
    console.error("deleteShopHttp failed", e);
    return sendJson(res, 500, { error: "Failed to delete shop" });
  }
});

// Any other helper functions can go here

console.log("Firebase functions backend loaded successfully");