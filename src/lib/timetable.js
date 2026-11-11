// APU shuttle timetable (from APSpace → Bus Shuttle Services, Nov 2026).
// SmartRide manages departures FROM the APU shuttle stop only, the one place with a waiting-area screen and boarding scanners.

export const ROUTES = [
  { id: 'lrt', name: 'LRT Bukit Jalil' },
  { id: 'fortune', name: 'Fortune Park' },
  { id: 'cog', name: 'City of Green' },
  { id: 'kingston', name: 'Kingston Hotel' },
  { id: 'parkhill', name: 'Parkhill' },
  { id: 'mvertica', name: 'M Vertica' },
  { id: 'bloomsvale', name: 'Bloomsvale' },
  { id: 'harmony', name: 'Harmony' },
  { id: 'kuchai', name: 'Kuchai Sentral' },
  { id: 'maple', name: 'Maple' },
  { id: 'divo', name: "D'Ivo" },
  { id: 'bayu', name: 'Bayu Jalil' },
  { id: 'mosque', name: 'Mosque', fridayOnly: true },
]

export const FROM_APU = {
  lrt: '10:35 10:45 11:30 11:50 12:10 12:35 12:50 13:05 13:10 13:15 13:30 14:00 14:15 14:30 14:45 15:10 15:20 15:30 15:45 15:50 16:00 16:15 16:30 16:45 16:50 17:00 17:10 17:20 17:30 17:40 18:00 18:10 18:15 18:30 18:40 18:55 19:15 20:45 21:45',
  fortune: '10:30 11:25 12:20 13:00 13:15 14:10 15:00 15:50 16:00 16:20 16:55 17:00 17:30 17:40 18:00 18:15 18:40 19:15',
  cog: '10:35 11:30 12:30 13:00 14:00 14:30 15:30 16:00 16:30 17:40 18:00 18:40 19:00 20:45 21:45',
  kingston: '10:30 11:25 13:00 14:10 15:00 15:50 16:20 17:00 17:40 18:00 18:40 19:15',
  parkhill: '11:30 13:30 14:30 16:15 17:15 18:15 19:15',
  mvertica: '14:00 15:00 16:20 16:45 17:45 17:50 18:45',
  bloomsvale: '12:30 13:00 15:30 16:30 17:00 17:30 18:45',
  harmony: '12:30 13:00 15:30 16:30 17:00 17:30 18:45',
  kuchai: '11:00 13:00 16:30 18:30',
  maple: '11:00 13:00 16:30 18:30',
  divo: '11:00 13:00 16:30 18:30',
  bayu: '15:00 18:15',
  mosque: '12:30',
}

const parse = (s) => s.split(' ').map((t) => t.trim()).filter(Boolean)
export const timesFrom = (routeId) => parse(FROM_APU[routeId] ?? '')

export const routeName = (id) => ROUTES.find((r) => r.id === id)?.name ?? id
// All timetable maths happens in Malaysia time (UTC+8, no daylight saving), whatever the device's own time zone is.
export const TZ = 'Asia/Kuala_Lumpur'
const OFFSET = 8 * 3600000
const myt = (ms) => new Date(Number(ms) + OFFSET) // read with getUTC* to get Malaysian calendar fields

export const mytDay = (ms) => myt(ms).getUTCDay()
export const runsOn = (route, dayMs) => !route.fridayOnly || mytDay(dayMs) === 5

/** Timestamp for "HH:MM" Malaysia time on the Malaysian calendar day containing dayMs. */
export function atTime(dayMs, hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  const d = myt(dayMs)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h, m) - OFFSET
}

/** Midnight (Malaysia time) of the day containing ms. */
export const mytMidnight = (ms) => atTime(ms, '00:00')
export const mytDateString = (ms) => myt(ms).toISOString().slice(0, 10)

/** Next `count` real departures from APU for a route, after `fromMs` (looks up to 7 days ahead). */
export function nextDepartures(routeId, fromMs = Date.now(), count = 3) {
  const route = ROUTES.find((r) => r.id === routeId)
  const out = []
  for (let d = 0; d < 7 && out.length < count; d++) {
    const day = Number(fromMs) + d * 86400000
    if (!runsOn(route, day)) continue
    for (const t of timesFrom(routeId)) {
      const ms = atTime(day, t)
      if (ms > fromMs) out.push({ time: t, ms })
      if (out.length >= count) break
    }
  }
  return out
}
