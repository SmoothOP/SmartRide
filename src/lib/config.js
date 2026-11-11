// ─────────────────────────────────────────────────────────────
// 1) Paste your Firebase web config here (Project settings → Your apps).
//    These values are safe to commit: Firebase web config is public by design.
// ─────────────────────────────────────────────────────────────
export const firebaseConfig = {
  apiKey: 'REPLACE_ME',
  authDomain: 'REPLACE_ME.firebaseapp.com',
  projectId: 'REPLACE_ME',
  storageBucket: 'REPLACE_ME.appspot.com',
  messagingSenderId: 'REPLACE_ME',
  appId: 'REPLACE_ME',
}

// ─────────────────────────────────────────────────────────────
// 2) Shuttle destinations. Rename these to APU's real routes.
// ─────────────────────────────────────────────────────────────
export const ROUTES = [
  { id: 'lrt', name: 'LRT Bukit Jalil' },
  { id: 'res', name: 'Student Residence' },
  { id: 'mall', name: 'Pavilion Bukit Jalil' },
]

export const routeName = (id) => ROUTES.find((r) => r.id === id)?.name ?? id

// Default settings (admin can change most of these live in the dashboard)
export const DEFAULT_SETTINGS = {
  // Waiting area (approx. APU campus, Technology Park Malaysia). Admin can reset it to their current location.
  geofence: { lat: 3.0553, lng: 101.7005, radiusM: 150 },
  bypassLocation: true, // demo mode: judges aren't standing at the APU shuttle stop
  qrRotateSec: 15,
  noShowLimit: 3,
  suspendDays: 7,
  bookingWindowBuses: 2, // students may choose among the next N buses with free seats
}
