import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase'; // ✅ adjust path if needed

export async function seedCoreShopsIfMissing() {
  const core = [
    {
      id: '1',
      name: "Captain Morgan's",
      area: 'Gisborne',
      address: '285 Grey Street, Gisborne',
      latitude: -38.6704,
      longitude: 178.0169,
      milkshakePrice: 6.5,
      thickshakePrice: 9,
      // optional starter aggregates
      ratingAverage: 4.5,
      ratingCount: 0,
    },
    {
      id: '2',
      name: 'Te Poi Cafe',
      area: 'Te Poi',
      address: '5 Te Poi Road, Te Poi',
      latitude: -37.8724,
      longitude: 175.8423,
      milkshakePrice: 6,
      thickshakePrice: 8,
      ratingAverage: 4.5,
      ratingCount: 0,
    },
    {
      id: '3',
      name: 'Hot Bread Shop Cafe',
      area: 'Ōpōtiki',
      address: '43 Saint John Street, Ōpōtiki',
      latitude: -38.0118,
      longitude: 177.2869,
      milkshakePrice: 5.5,
      thickshakePrice: 8,
      ratingAverage: 4.0,
      ratingCount: 0,
    },
  ];

  // Write/merge so it’s safe to run multiple times
  await Promise.all(
    core.map(s =>
      setDoc(
        doc(db, 'shops', s.id),
        {
          ...s,
          createdAt: serverTimestamp(), // if doc exists, merge keeps it safe
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      )
    )
  );
}
