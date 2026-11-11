// Deterministic SmartRide rules. No AI involved — these decide who can book what.
// Pure functions so they can be tested and explained.

export const tsMs = (v) => {
  if (v == null) return Date.now() // pending server timestamp (just written locally)
  if (typeof v === 'number') return v
  if (typeof v.toMillis === 'function') return v.toMillis()
  return Number(v)
}

export const freeSeats = (bus) => Math.max(0, (bus.capacity ?? 0) - (bus.booked ?? 0))

/** Waiting (not yet booked) students for a route, in verified-arrival (FIFO) order. */
export function waitingQueue(entries, routeId) {
  return entries
    .filter((e) => e.status === 'waiting' && e.routeId === routeId)
    .sort((a, b) => tsMs(a.arrivedAt) - tsMs(b.arrivedAt) || String(a.uid).localeCompare(String(b.uid)))
}

/** 1-based position in the waiting queue, or 0 if not waiting. */
export function positionOf(uid, waiting) {
  return waiting.findIndex((e) => e.uid === uid) + 1
}

/** Buses for a route that haven't departed, earliest first. */
export function upcomingBuses(buses, routeId) {
  return buses
    .filter((b) => b.routeId === routeId && b.status !== 'departed')
    .sort((a, b) => tsMs(a.departAt) - tsMs(b.departAt))
}

/**
 * The booking window: the next N buses that still have free seats.
 * Each entry carries cumFree = free seats on this bus and every earlier bus in the window.
 *
 * FAIRNESS RULE: the student at waiting position p may book bus k only if p <= cumFree(k).
 * Booking a seat reduces cumFree by 1 for that bus and later ones, so everyone
 * ahead of you (positions < p) is always still guaranteed a seat. Nobody can be
 * overtaken by someone who arrived later.
 */
export function bookingWindow(buses, routeId, windowSize = 2) {
  let cum = 0
  return upcomingBuses(buses, routeId)
    .filter((b) => freeSeats(b) > 0)
    .slice(0, windowSize)
    .map((bus) => {
      cum += freeSeats(bus)
      return { bus, free: freeSeats(bus), cumFree: cum }
    })
}

export const canBook = (position, windowEntry) =>
  position > 0 && !!windowEntry && position <= windowEntry.cumFree

/** Which bus a waiting student will most likely get, and roughly when. */
export function estimate(position, buses, routeId, now = Date.now()) {
  if (position <= 0) return null
  let cum = 0
  for (const bus of upcomingBuses(buses, routeId)) {
    cum += freeSeats(bus)
    if (position <= cum) {
      return { bus, waitMin: Math.max(0, Math.round((tsMs(bus.departAt) - now) / 60000)) }
    }
  }
  return { bus: null, waitMin: null } // more people than scheduled seats
}

export function isSuspended(student, now = Date.now()) {
  return !!student?.suspendedUntil && tsMs(student.suspendedUntil) > now
}

/** Distance in metres between two lat/lng points (haversine). */
export function distanceM(a, b) {
  const R = 6371000
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export const randomToken = (len = 10) => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const arr = new Uint32Array(len)
  crypto.getRandomValues(arr)
  return Array.from(arr, (n) => chars[n % chars.length]).join('')
}

export function fmtTime(ms) {
  const d = new Date(tsMs(ms))
  const t = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return d.toDateString() === new Date().toDateString() ? t : `${d.toLocaleDateString([], { weekday: 'short' })} ${t}`
}

/** "in 7 min", "in 2 h 5 min", "now" */
export function fmtIn(ms, now = Date.now()) {
  const mins = Math.round((tsMs(ms) - now) / 60000)
  if (mins <= 0) return 'now'
  if (mins < 60) return `in ${mins} min`
  const h = Math.floor(mins / 60)
  return h >= 24 ? `in ${Math.round(h / 24)} d` : `in ${h} h${mins % 60 ? ` ${mins % 60} min` : ''}`
}
