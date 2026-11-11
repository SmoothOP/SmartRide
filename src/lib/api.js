import {
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, writeBatch, runTransaction,
  query, where, serverTimestamp, increment, Timestamp, deleteDoc,
} from 'firebase/firestore'
import { db } from './firebase'
import { DEFAULT_SETTINGS } from './config'
import { ROUTES, nextDepartures, timesFrom, runsOn, atTime } from './timetable'
import {
  waitingQueue, positionOf, bookingWindow, canBook, isSuspended, distanceM, randomToken, tsMs, freeSeats,
} from './rules'

const ref = (path, id) => doc(db, path, id)

// ── Settings ────────────────────────────────────────────────
export async function getSettings() {
  const snap = await getDoc(ref('settings', 'app'))
  return { ...DEFAULT_SETTINGS, ...(snap.exists() ? snap.data() : {}) }
}
export const saveSettings = (patch) => setDoc(ref('settings', 'app'), patch, { merge: true })

// ── Arrival QR (waiting-area display) ───────────────────────
export async function rotateArrivalCode(prevCode = null) {
  const code = randomToken(8)
  await setDoc(ref('station', 'arrival'), { code, prevCode, issuedAt: Date.now() })
  return code
}

async function validateArrivalCode(code, settings) {
  const snap = await getDoc(ref('station', 'arrival'))
  if (!snap.exists()) throw new Error('The waiting-area display is not running.')
  const s = snap.data()
  const period = settings.qrRotateSec * 1000
  const age = Date.now() - s.issuedAt
  if (code === s.code && age < period * 2) return true
  if (code === s.prevCode && age < period) return true // grace for a code that just rotated
  throw new Error('That QR code has expired. Scan the live code on the waiting-area screen.')
}

export async function currentArrivalCode() {
  const snap = await getDoc(ref('station', 'arrival'))
  return snap.exists() ? snap.data().code : null
}

// ── Location ────────────────────────────────────────────────
export function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Location is not available on this device.'))
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }),
      () => reject(new Error('Location permission is needed to confirm you are at the waiting area.')),
      { enableHighAccuracy: true, timeout: 10000 },
    )
  })
}

// ── Students ────────────────────────────────────────────────
export async function ensureStudent(uid, name, studentId) {
  const r = ref('students', uid)
  const snap = await getDoc(r)
  if (!snap.exists()) {
    await setDoc(r, { uid, name, studentId, noShows: 0, suspendedUntil: 0, sim: false, createdAt: serverTimestamp() })
  } else if (name) {
    await updateDoc(r, { name, studentId })
  }
}

// ── Stage 1–3: verified arrival → virtual queue ─────────────
export async function checkIn({ uid, routeId, code }) {
  const settings = await getSettings()
  await validateArrivalCode(code, settings)

  let distance = null
  if (!settings.bypassLocation) {
    const pos = await getPosition()
    distance = Math.round(distanceM(pos, settings.geofence))
    if (distance > settings.geofence.radiusM + Math.min(pos.acc ?? 0, 100)) {
      throw new Error(`You appear to be ${distance} m from the waiting area. Check in when you arrive.`)
    }
  }

  const student = (await getDoc(ref('students', uid))).data()
  if (isSuspended(student)) {
    throw new Error(`Booking is suspended until ${new Date(tsMs(student.suspendedUntil)).toLocaleDateString()} after ${student.noShows} no-shows.`)
  }
  const existing = await getDoc(ref('queue', uid))
  if (existing.exists() && ['waiting', 'booked'].includes(existing.data().status)) {
    throw new Error('You are already checked in.')
  }
  await setDoc(ref('queue', uid), {
    uid, name: student.name, studentId: student.studentId, routeId,
    arrivedAt: serverTimestamp(), // server time, so nobody can fake an earlier arrival
    status: 'waiting', bookingId: null, sim: false, locationDistanceM: distance,
  })
}

export const leaveQueue = (uid) => updateDoc(ref('queue', uid), { status: 'left' })

// ── Stage 4–5: booking a seat ───────────────────────────────
export async function bookSeat({ uid, busId }) {
  const settings = await getSettings()
  // Fairness check: recompute position and window from fresh data.
  const me = (await getDoc(ref('queue', uid))).data()
  if (!me || me.status !== 'waiting') throw new Error('You need to be waiting in the queue to book.')
  const [qSnap, bSnap] = await Promise.all([
    getDocs(query(collection(db, 'queue'), where('routeId', '==', me.routeId))),
    getDocs(query(collection(db, 'buses'), where('routeId', '==', me.routeId))),
  ])
  const waiting = waitingQueue(qSnap.docs.map((d) => d.data()), me.routeId)
  const buses = bSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
  const window = bookingWindow(buses, me.routeId, settings.bookingWindowBuses)
  const entry = window.find((w) => w.bus.id === busId)
  const pos = positionOf(uid, waiting)
  if (!entry) throw new Error('That bus is not open for booking right now.')
  if (!canBook(pos, entry)) throw new Error(`Students ahead of you get these seats first (you are #${pos}).`)

  // Capacity + state checks happen atomically, so two people can never take the last seat.
  const bookingRef = doc(collection(db, 'bookings'))
  await runTransaction(db, async (tx) => {
    const [bus, q, st] = await Promise.all([
      tx.get(ref('buses', busId)), tx.get(ref('queue', uid)), tx.get(ref('students', uid)),
    ])
    if (!bus.exists() || bus.data().status === 'departed') throw new Error('This bus has already left.')
    if (freeSeats(bus.data()) <= 0) throw new Error('Sorry, that bus just filled up.')
    if (q.data()?.status !== 'waiting') throw new Error('You already have an active booking.')
    if (isSuspended(st.data())) throw new Error('Your booking privileges are suspended.')
    tx.update(ref('buses', busId), { booked: increment(1) })
    tx.update(ref('queue', uid), { status: 'booked', bookingId: bookingRef.id })
    tx.set(bookingRef, {
      uid, name: st.data().name, studentId: st.data().studentId, busId, routeId: me.routeId,
      busLabel: bus.data().label, departAt: bus.data().departAt,
      status: 'confirmed', token: randomToken(12), createdAt: serverTimestamp(), boardedAt: null, sim: false,
    })
  })
  return bookingRef.id
}

export async function cancelBooking(bookingId) {
  await runTransaction(db, async (tx) => {
    const b = await tx.get(ref('bookings', bookingId))
    if (!b.exists() || b.data().status !== 'confirmed') throw new Error('This booking can no longer be cancelled.')
    const { busId, uid } = b.data()
    tx.update(ref('bookings', bookingId), { status: 'cancelled', cancelledAt: serverTimestamp() })
    tx.update(ref('buses', busId), { booked: increment(-1) })
    // They are still physically waiting, so they keep their original arrival time.
    tx.update(ref('queue', uid), { status: 'waiting', bookingId: null })
  })
}

// ── Stage 6–7: boarding verification ────────────────────────
export function parseBoardingQR(text) {
  const m = /^SMARTRIDE:B:([A-Za-z0-9]+):([A-Z0-9]+)$/.exec(String(text).trim())
  return m ? { bookingId: m[1], token: m[2] } : null
}
export const boardingQRText = (booking) => `SMARTRIDE:B:${booking.id}:${booking.token}`

export async function boardByQR(text, { busId } = {}) {
  const parsed = parseBoardingQR(text)
  if (!parsed) {
    if (String(text).includes('/checkin')) throw new Error('That is the arrival QR, not a boarding pass.')
    throw new Error('Not a SmartRide boarding pass.')
  }
  return runTransaction(db, async (tx) => {
    const b = await tx.get(ref('bookings', parsed.bookingId))
    if (!b.exists() || b.data().token !== parsed.token) throw new Error('Invalid boarding pass.')
    const bk = b.data()
    if (busId && bk.busId !== busId) throw new Error(`Wrong bus: this pass is for the ${bk.busLabel} bus.`)
    if (bk.status === 'boarded') throw new Error(`${bk.name} has already boarded. Passes can't be reused.`)
    if (bk.status === 'no_show') throw new Error('This reservation expired at the boarding cutoff.')
    if (bk.status !== 'confirmed') throw new Error('This booking was cancelled.')
    const bus = await tx.get(ref('buses', bk.busId))
    if (bus.data()?.status === 'departed') throw new Error('This bus has already departed.')
    tx.update(ref('bookings', parsed.bookingId), { status: 'boarded', boardedAt: serverTimestamp() })
    tx.update(ref('buses', bk.busId), { boarded: increment(1) })
    tx.set(ref('queue', bk.uid), { status: 'boarded' }, { merge: true })
    return { ...bk, id: parsed.bookingId }
  })
}

// ── Stage 8–9: boarding cutoff, no-shows, seat release ──────
async function expireUnboarded(busId) {
  const settings = await getSettings()
  const snap = await getDocs(query(collection(db, 'bookings'), where('busId', '==', busId)))
  const unboarded = snap.docs.filter((d) => d.data().status === 'confirmed')
  const batch = writeBatch(db)
  for (const d of unboarded) {
    const { uid } = d.data()
    batch.update(d.ref, { status: 'no_show', expiredAt: serverTimestamp() })
    batch.set(ref('queue', uid), { status: 'expired' }, { merge: true })
    const st = (await getDoc(ref('students', uid))).data() ?? {}
    const noShows = (st.noShows ?? 0) + 1
    const patch = { noShows }
    if (noShows >= settings.noShowLimit) patch.suspendedUntil = Date.now() + settings.suspendDays * 86400000
    batch.set(ref('students', uid), patch, { merge: true })
  }
  if (unboarded.length) batch.update(ref('buses', busId), { booked: increment(-unboarded.length) })
  await batch.commit()
  return unboarded.length
}

/** Boarding cutoff: unclaimed reservations expire and the seats go back to the waiting queue. */
export async function boardingCutoff(busId) {
  const released = await expireUnboarded(busId)
  await updateDoc(ref('buses', busId), { status: 'cutoff', releasedSeats: increment(released) })
  return released
}

export async function departBus(busId) {
  await expireUnboarded(busId)
  await updateDoc(ref('buses', busId), { status: 'departed', departedAt: Date.now() })
}

// ── Appeals (Gemini workflow agent will triage these in the final round) ──
export const submitAppeal = (data) =>
  addDoc(collection(db, 'appeals'), { ...data, status: 'pending', createdAt: serverTimestamp() })

export const resolveAppeal = async (appeal, approve) => {
  await updateDoc(ref('appeals', appeal.id), { status: approve ? 'approved' : 'rejected' })
  if (approve) {
    const st = (await getDoc(ref('students', appeal.uid))).data() ?? {}
    await setDoc(ref('students', appeal.uid), { noShows: Math.max(0, (st.noShows ?? 1) - 1), suspendedUntil: 0 }, { merge: true })
  }
}

// ── Admin: buses ────────────────────────────────────────────
export const addBus = ({ routeId, label, departAt, capacity }) =>
  addDoc(collection(db, 'buses'), {
    routeId, label, departAt, capacity: Number(capacity), booked: 0, boarded: 0, releasedSeats: 0, status: 'scheduled',
  })
export const removeBus = (id) => deleteDoc(ref('buses', id))

// ── Demo controls ───────────────────────────────────────────
async function deleteAll(name, filter = () => true) {
  const snap = await getDocs(collection(db, name))
  const docs = snap.docs.filter((d) => filter(d.data()))
  for (let i = 0; i < docs.length; i += 450) {
    const batch = writeBatch(db)
    docs.slice(i, i + 450).forEach((d) => batch.delete(d.ref))
    await batch.commit()
  }
}

/** Schedules the next 3 real departures from APU on every route (starting at least 8 minutes from now). */
export async function seedBuses({ capacity = 30 } = {}) {
  const from = Date.now() + 8 * 60000
  const batch = writeBatch(db)
  ROUTES.forEach((r) => {
    nextDepartures(r.id, from, 3).forEach(({ time, ms }) => {
      batch.set(doc(collection(db, 'buses')), {
        routeId: r.id, label: time, departAt: ms, capacity, booked: 0, boarded: 0, releasedSeats: 0, status: 'scheduled',
      })
    })
  })
  await batch.commit()
}

export async function resetDemo({ keepHistory = true } = {}) {
  await Promise.all([
    deleteAll('buses'), deleteAll('queue'), deleteAll('bookings'), deleteAll('appeals'),
    deleteAll('students', (s) => s.sim),
  ])
  // Clear no-show records for real users too, so every demo starts clean.
  const st = await getDocs(collection(db, 'students'))
  const batch = writeBatch(db)
  st.docs.forEach((d) => batch.update(d.ref, { noShows: 0, suspendedUntil: 0 }))
  await batch.commit()
  if (!keepHistory) await deleteAll('tripStats')
  await seedBuses()
}

const FIRST = ['Aisyah', 'Wei Jie', 'Arjun', 'Nur', 'Daniel', 'Mei Ling', 'Haziq', 'Priya', 'Hafiz', 'Jia Hui', 'Omar', 'Kavitha', 'Irfan', 'Sofia', 'Ravi', 'Hannah', 'Amir', 'Yi Xuan']
const LAST = ['Rahman', 'Tan', 'Kumar', 'Lim', 'Ismail', 'Wong', 'Abdullah', 'Nair', 'Lee', 'Hassan', 'Chong', 'Singh']

/** Simulated students arrive at the waiting area, 20 seconds apart, before the presenter. */
export async function simulateArrivals(routeId, n) {
  const existing = await getDocs(collection(db, 'students'))
  const start = existing.docs.filter((d) => d.data().sim).length
  const base = Date.now() - n * 20000
  const batch = writeBatch(db)
  for (let i = 0; i < n; i++) {
    const k = start + i
    const uid = `sim_${String(k + 1).padStart(3, '0')}`
    const name = `${FIRST[k % FIRST.length]} ${LAST[(k * 7) % LAST.length]}`
    const studentId = `TP0${String(70000 + k * 37).padStart(5, '0')}`
    batch.set(ref('students', uid), { uid, name, studentId, noShows: 0, suspendedUntil: 0, sim: true })
    batch.set(ref('queue', uid), {
      uid, name, studentId, routeId, arrivedAt: Timestamp.fromMillis(base + i * 20000),
      status: 'waiting', bookingId: null, sim: true,
    })
  }
  await batch.commit()
}

/**
 * Simulated students book in strict queue order using the same fairness rule as real students.
 * Real students are never booked on their behalf; they keep their place, so sims behind them can't jump ahead.
 */
export async function simAutoBook(routeId, { firstBusOnly = true } = {}) {
  const settings = await getSettings()
  const [qSnap, bSnap] = await Promise.all([
    getDocs(query(collection(db, 'queue'), where('routeId', '==', routeId))),
    getDocs(query(collection(db, 'buses'), where('routeId', '==', routeId))),
  ])
  const queueAll = qSnap.docs.map((d) => d.data())
  const buses = bSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
  let waiting = waitingQueue(queueAll, routeId)
  // "First bus only" = the bus that is next with free seats right now; it doesn't roll over to later buses.
  const targetId = bookingWindow(buses, routeId, settings.bookingWindowBuses)[0]?.bus.id
  const batch = writeBatch(db)
  let made = 0
  for (const entry of [...waiting]) {
    if (!entry.sim) continue
    const pos = positionOf(entry.uid, waiting)
    let window = bookingWindow(buses, routeId, settings.bookingWindowBuses)
    if (firstBusOnly) window = window.filter((w) => w.bus.id === targetId)
    const target = window.find((w) => canBook(pos, w))
    if (!target) continue
    const bus = target.bus
    bus.booked = (bus.booked ?? 0) + 1
    const bRef = doc(collection(db, 'bookings'))
    batch.set(bRef, {
      uid: entry.uid, name: entry.name, studentId: entry.studentId, busId: bus.id, routeId,
      busLabel: bus.label, departAt: bus.departAt, status: 'confirmed', token: randomToken(12),
      createdAt: serverTimestamp(), boardedAt: null, sim: true,
    })
    batch.update(ref('queue', entry.uid), { status: 'booked', bookingId: bRef.id })
    waiting = waiting.filter((w) => w.uid !== entry.uid)
    made++
  }
  buses.forEach((b) => batch.update(ref('buses', b.id), { booked: b.booked ?? 0 }))
  await batch.commit()
  return made
}

/** A simulated passenger on this bus cancels (the latest-booked one). */
export async function simCancelOne(busId) {
  const snap = await getDocs(query(collection(db, 'bookings'), where('busId', '==', busId)))
  const sims = snap.docs.filter((d) => d.data().sim && d.data().status === 'confirmed')
  if (!sims.length) throw new Error('No simulated confirmed bookings on this bus.')
  const pick = sims[Math.floor(sims.length / 2)]
  await cancelBooking(pick.id)
  await updateDoc(ref('queue', pick.data().uid), { status: 'left' }) // they decided not to ride
  return pick.data().name
}

/** Simulated passengers present their boarding passes; `noShows` of them never turn up. */
export async function simBoard(busId, noShows = 3) {
  const snap = await getDocs(query(collection(db, 'bookings'), where('busId', '==', busId)))
  const sims = snap.docs
    .filter((d) => d.data().sim && d.data().status === 'confirmed')
    .sort((a, b) => a.id.localeCompare(b.id))
  const boarding = sims.slice(0, Math.max(0, sims.length - noShows))
  const batch = writeBatch(db)
  boarding.forEach((d) => {
    batch.update(d.ref, { status: 'boarded', boardedAt: serverTimestamp() })
    batch.update(ref('queue', d.data().uid), { status: 'boarded' })
  })
  batch.update(ref('buses', busId), { boarded: increment(boarding.length) })
  await batch.commit()
  return boarding.length
}

/** Four weeks of synthetic trip history, one row per real timetabled departure from APU. */
export async function generateHistory() {
  await deleteAll('tripStats')
  let seed = 42
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  // Relative popularity per destination (simulated; replace with real counts once data exists)
  const routeWeight = {
    lrt: 1.0, fortune: 0.85, cog: 0.75, kingston: 0.6, parkhill: 0.55, mvertica: 0.55, bloomsvale: 0.5,
    harmony: 0.5, kuchai: 0.45, maple: 0.45, divo: 0.45, bayu: 0.4, mosque: 0.6,
  }
  // Evening rush after classes; quieter late morning
  const hourShape = (h) => ({ 10: 0.45, 11: 0.55, 12: 0.75, 13: 0.8, 14: 0.6, 15: 0.75, 16: 0.95, 17: 1.0, 18: 0.9, 19: 0.6, 20: 0.4, 21: 0.35 }[h] ?? 0.5)
  const rows = []
  const today = new Date(); today.setHours(0, 0, 0, 0)
  for (let d = 28; d >= 1; d--) {
    const day = new Date(today.getTime() - d * 86400000)
    const dow = day.getDay()
    if (dow === 0) continue // assume no Sunday classes
    const dayFactor = dow === 6 ? 0.35 : dow === 5 ? 0.85 : 1
    for (const r of ROUTES) {
      if (!runsOn(r, day)) continue
      const times = timesFrom(r.id)
      // Fewer departures → each bus carries more of the route's demand
      const spread = Math.min(1.6, 1 + 8 / Math.max(4, times.length * 2))
      for (const t of times) {
        const hour = Number(t.slice(0, 2))
        const capacity = 30
        const demand = Math.round(capacity * 1.05 * hourShape(hour) * routeWeight[r.id] * spread * dayFactor * (0.75 + rand() * 0.5))
        const booked = Math.min(capacity, demand)
        const noShows = Math.round(booked * (0.04 + rand() * 0.1 + (hour >= 17 ? 0.03 : 0)))
        const overflow = Math.max(0, demand - capacity)
        rows.push({
          day: day.toISOString().slice(0, 10), dow, hour, time: t, departAt: atTime(day, t), routeId: r.id, capacity, demand, booked,
          boarded: booked - noShows, noShows, overflow, avgWaitMin: Math.round(3 + (overflow / capacity) * 25 + rand() * 4),
        })
      }
    }
  }
  for (let i = 0; i < rows.length; i += 450) {
    const batch = writeBatch(db)
    rows.slice(i, i + 450).forEach((row) => batch.set(doc(collection(db, 'tripStats')), row))
    await batch.commit()
  }
  return rows.length
}
