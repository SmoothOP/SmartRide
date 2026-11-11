// ─────────────────────────────────────────────────────────────
// 1) Paste your Firebase web config here (Project settings → Your apps).
//    These values are safe to commit: Firebase web config is public by design.
// ─────────────────────────────────────────────────────────────
export const firebaseConfig = {
  apiKey: 'AIzaSyB4oZAGI4O3pLyEOtVsJt1KhWxZIeL3q4s',
  authDomain: 'smartride-52964.firebaseapp.com',
  projectId: 'smartride-52964',
  storageBucket: 'smartride-52964.firebasestorage.app',
  messagingSenderId: '93345111622',
  appId: '1:93345111622:web:49fb2a2c2460f2ec73f447',
}

// 2) Routes and timetable live in ./timetable.js (real APU shuttle schedule).
export { ROUTES, routeName } from './timetable'

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
