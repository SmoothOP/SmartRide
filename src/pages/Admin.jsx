import { useMemo, useState } from 'react'
import { ROUTES, routeName } from '../lib/config'
import { useCollection, useNow, useSettings } from '../lib/hooks'
import {
  boardingCutoff, departBus, addBus, removeBus, resetDemo, simulateArrivals, simAutoBook, simCancelOne, simBoard,
  generateHistory, saveSettings, getPosition, resolveAppeal,
} from '../lib/api'
import { upcomingBuses, waitingQueue, freeSeats, fmtTime, tsMs, isSuspended } from '../lib/rules'
import { TopBar, Badge, StatusBadge, GeminiSlot, useToast, useAction } from '../components/ui'

const TABS = [
  ['ops', 'Live operations'], ['records', 'Boarding records'], ['noshows', 'No-shows & appeals'],
  ['analytics', 'Analytics'], ['demo', 'Demo & settings'],
]

export default function Admin() {
  const [tab, setTab] = useState('ops')
  const [toastEl, notify] = useToast()
  const [busy, run] = useAction(notify)
  const ctx = { notify, busy, run }
  return (
    <div className="min-h-screen pb-16">
      <TopBar title="Transport admin" />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-5 flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
          {TABS.map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`rounded-lg px-3 py-2 text-sm font-medium ${tab === id ? 'bg-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
              {label}
            </button>
          ))}
        </div>
        {tab === 'ops' && <Operations {...ctx} />}
        {tab === 'records' && <Records />}
        {tab === 'noshows' && <NoShows {...ctx} />}
        {tab === 'analytics' && <Analytics {...ctx} />}
        {tab === 'demo' && <Demo {...ctx} />}
      </main>
      {toastEl}
    </div>
  )
}

// ── Live operations ─────────────────────────────────────────
function Operations({ busy, run }) {
  const now = useNow(5000)
  const [buses] = useCollection('buses')
  const [queue] = useCollection('queue')
  const [routeId, setRouteId] = useState(ROUTES[0].id)
  const list = upcomingBuses(buses, routeId)
  const departed = buses.filter((b) => b.routeId === routeId && b.status === 'departed')
  const waiting = waitingQueue(queue, routeId)

  const totals = useMemo(() => {
    const live = buses.filter((b) => b.status !== 'departed')
    return {
      waiting: queue.filter((q) => q.status === 'waiting').length,
      booked: live.reduce((s, b) => s + (b.booked ?? 0), 0),
      boarded: buses.reduce((s, b) => s + (b.boarded ?? 0), 0),
      released: buses.reduce((s, b) => s + (b.releasedSeats ?? 0), 0),
    }
  }, [buses, queue])

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Waiting now" value={totals.waiting} />
        <Stat label="Seats booked (upcoming)" value={totals.booked} />
        <Stat label="Boarded today" value={totals.boarded} />
        <Stat label="No-show seats released" value={totals.released} />
      </div>

      <div className="flex flex-wrap gap-2">
        {ROUTES.map((r) => (
          <button key={r.id} onClick={() => setRouteId(r.id)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${routeId === r.id ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200'}`}>
            {r.name} <span className="opacity-60">· {waitingQueue(queue, r.id).length} waiting</span>
          </button>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-3">
          {list.length === 0 && <p className="card p-5 text-sm text-slate-500">No upcoming buses. Add one below, or seed demo buses in Demo &amp; settings.</p>}
          {list.map((b) => {
            const mins = Math.round((tsMs(b.departAt) - now) / 60000)
            return (
              <div key={b.id} className="card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-bold">{b.label}</h3>
                  <StatusBadge status={b.status} />
                  <span className="text-sm text-slate-500">departs {fmtTime(b.departAt)} ({mins > 0 ? `in ${mins} min` : 'due now'})</span>
                </div>
                <CapacityBar bus={b} />
                <div className="mt-3 flex flex-wrap gap-2">
                  {b.status === 'scheduled' && (
                    <button className="btn-ghost px-3 py-1.5" disabled={busy}
                      onClick={() => run(() => boardingCutoff(b.id), (n) => `Boarding cutoff: ${n} unclaimed seat${n === 1 ? '' : 's'} released to the queue.`)}>
                      ⏱ Boarding cutoff
                    </button>
                  )}
                  <button className="btn-ghost px-3 py-1.5" disabled={busy} onClick={() => run(() => departBus(b.id), `${b.label} departed.`)}>🚌 Depart</button>
                  <span className="mx-1 w-px bg-slate-200" />
                  <button className="btn-ghost px-3 py-1.5 text-xs" disabled={busy}
                    onClick={() => run(() => simCancelOne(b.id), (n) => `${n} cancelled. The seat is open for the next in line.`)}>Sim: a passenger cancels</button>
                  <button className="btn-ghost px-3 py-1.5 text-xs" disabled={busy}
                    onClick={() => run(() => simBoard(b.id, 3), (n) => `${n} simulated passengers boarded; 3 didn't show up.`)}>Sim: board (3 no-shows)</button>
                  <button className="btn-danger ml-auto px-3 py-1.5 text-xs" disabled={busy} onClick={() => run(() => removeBus(b.id))}>Remove</button>
                </div>
              </div>
            )
          })}
          {departed.length > 0 && <p className="text-xs text-slate-500">Departed today: {departed.map((b) => `${b.label} (${b.boarded}/${b.capacity})`).join(', ')}</p>}
          <AddBus routeId={routeId} busy={busy} run={run} />
        </div>

        <div className="card h-fit p-4">
          <div className="flex items-center">
            <h3 className="font-semibold">Virtual queue · {routeName(routeId)}</h3>
            <button className="ml-auto text-xs text-brand-700 underline" disabled={busy}
              onClick={() => run(() => simAutoBook(routeId, { firstBusOnly: true }), (n) => n ? `${n} simulated student${n === 1 ? '' : 's'} booked, in queue order.` : 'Nobody in line is eligible for a free seat right now.')}>
              Sim: next in line books
            </button>
          </div>
          <p className="text-xs text-slate-500">Ordered by verified arrival time (FIFO)</p>
          <ol className="mt-3 max-h-[480px] space-y-1 overflow-auto">
            {waiting.length === 0 && <p className="text-sm text-slate-500">Nobody waiting.</p>}
            {waiting.map((q, i) => (
              <li key={q.uid} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${q.sim ? '' : 'bg-brand-50'}`}>
                <span className="w-7 text-right font-bold tabular-nums text-slate-400">{i + 1}</span>
                <span className="font-medium">{q.name}</span>
                {!q.sim && <Badge tone="teal">live</Badge>}
                <span className="ml-auto text-xs tabular-nums text-slate-500">{fmtTime(q.arrivedAt)}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, sub }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-extrabold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  )
}

function CapacityBar({ bus }) {
  const cap = bus.capacity || 1
  const boarded = bus.boarded ?? 0
  const booked = Math.max(0, (bus.booked ?? 0) - boarded)
  return (
    <div className="mt-3">
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-l-full bg-brand-700" style={{ width: `${(boarded / cap) * 100}%` }} title={`${boarded} boarded`} />
        <div className="h-full bg-brand-500/40" style={{ width: `${(booked / cap) * 100}%` }} title={`${booked} booked, not yet boarded`} />
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-4 text-xs text-slate-600">
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-brand-700" />{boarded} boarded</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-brand-500/40" />{booked} booked, not boarded</span>
        <span>{freeSeats(bus)} free of {bus.capacity}</span>
        {bus.releasedSeats > 0 && <span className="text-amber-700">{bus.releasedSeats} released from no-shows</span>}
      </div>
    </div>
  )
}

function AddBus({ routeId, busy, run }) {
  const [label, setLabel] = useState('')
  const [inMin, setInMin] = useState(20)
  const [capacity, setCapacity] = useState(30)
  return (
    <details className="card p-4">
      <summary className="cursor-pointer text-sm font-semibold">+ Add a bus to {routeName(routeId)}</summary>
      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        <input className="input" placeholder="Label, e.g. LRT-4" value={label} onChange={(e) => setLabel(e.target.value)} />
        <input className="input" type="number" min="1" value={inMin} onChange={(e) => setInMin(e.target.value)} title="Departs in (min)" />
        <input className="input" type="number" min="1" value={capacity} onChange={(e) => setCapacity(e.target.value)} title="Capacity" />
        <button className="btn-primary" disabled={busy || !label}
          onClick={() => run(() => addBus({ routeId, label, capacity, departAt: Date.now() + inMin * 60000 }), 'Bus added.').then(() => setLabel(''))}>Add</button>
      </div>
      <p className="mt-1 text-xs text-slate-500">Label · departs in (minutes) · capacity</p>
    </details>
  )
}

// ── Records ─────────────────────────────────────────────────
function Records() {
  const [bookings] = useCollection('bookings')
  const [filter, setFilter] = useState('all')
  const rows = bookings
    .filter((b) => filter === 'all' || b.status === filter)
    .sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt))
  const counts = bookings.reduce((m, b) => ({ ...m, [b.status]: (m[b.status] ?? 0) + 1 }), {})
  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap gap-2 border-b border-slate-200 p-3">
        {['all', 'confirmed', 'boarded', 'no_show', 'cancelled'].map((s) => (
          <button key={s} onClick={() => setFilter(s)} className={`rounded-full px-3 py-1 text-xs font-medium ${filter === s ? 'bg-slate-900 text-white' : 'bg-slate-100'}`}>
            {s === 'all' ? `All (${bookings.length})` : `${s.replace('_', '-')} (${counts[s] ?? 0})`}
          </button>
        ))}
      </div>
      <div className="max-h-[600px] overflow-auto">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-500">
            <tr><th className="p-3">Student</th><th className="p-3">ID</th><th className="p-3">Bus</th><th className="p-3">Status</th><th className="p-3">Booked</th><th className="p-3">Boarded</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className="p-5 text-center text-slate-500">No records yet.</td></tr>}
            {rows.map((b) => (
              <tr key={b.id} className="border-t border-slate-100">
                <td className="p-3 font-medium">{b.name} {!b.sim && <Badge tone="teal">live</Badge>}</td>
                <td className="p-3 tabular-nums text-slate-600">{b.studentId}</td>
                <td className="p-3">{b.busLabel}</td>
                <td className="p-3"><StatusBadge status={b.status} /></td>
                <td className="p-3 tabular-nums text-slate-600">{b.createdAt ? fmtTime(b.createdAt) : '–'}</td>
                <td className="p-3 tabular-nums text-slate-600">{b.boardedAt ? fmtTime(b.boardedAt) : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── No-shows & appeals ──────────────────────────────────────
function NoShows({ busy, run }) {
  const [students] = useCollection('students')
  const [appeals] = useCollection('appeals')
  const settings = useSettings()
  const flagged = students.filter((s) => (s.noShows ?? 0) > 0).sort((a, b) => b.noShows - a.noShows)
  const pending = appeals.filter((a) => a.status === 'pending')
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="card p-4">
        <h3 className="font-semibold">Booking reliability</h3>
        <p className="text-xs text-slate-500">Policy: {settings.noShowLimit} no-shows → booking suspended for {settings.suspendDays} days. Cancelling before the cutoff never counts.</p>
        <ul className="mt-3 divide-y divide-slate-100">
          {flagged.length === 0 && <p className="py-3 text-sm text-slate-500">No no-shows recorded.</p>}
          {flagged.map((s) => (
            <li key={s.id} className="flex items-center gap-2 py-2 text-sm">
              <span className="font-medium">{s.name}</span>
              <span className="text-slate-500">{s.studentId}</span>
              <span className="ml-auto tabular-nums">{s.noShows} no-show{s.noShows > 1 ? 's' : ''}</span>
              {isSuspended(s) && <Badge tone="red">Suspended</Badge>}
            </li>
          ))}
        </ul>
      </div>
      <div className="space-y-4">
        <div className="card p-4">
          <h3 className="font-semibold">Appeals <Badge tone="amber">{pending.length} pending</Badge></h3>
          <ul className="mt-3 space-y-2">
            {appeals.length === 0 && <p className="text-sm text-slate-500">No appeals yet.</p>}
            {appeals.sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt)).map((a) => (
              <li key={a.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{a.name}</span><Badge>{a.reason}</Badge><StatusBadge status={a.status} />
                </div>
                <p className="mt-1 text-slate-600">{a.details}</p>
                {a.status === 'pending' && (
                  <div className="mt-2 flex gap-2">
                    <button className="btn-primary px-3 py-1.5" disabled={busy} onClick={() => run(() => resolveAppeal(a, true), 'Approved: one no-show removed.')}>Approve</button>
                    <button className="btn-ghost px-3 py-1.5" disabled={busy} onClick={() => run(() => resolveAppeal(a, false), 'Appeal rejected.')}>Reject</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
        <GeminiSlot title="Appeal triage workflow" connector="Workflow agent · Gmail in → categorise → Google Sheets log → Google Chat to transport office">
          Students email or submit appeals. The agent categorises each one (emergency, technical, late class, no reason), attaches the student's booking history, and routes it to the right officer with a suggested decision. A human still makes the final call.
        </GeminiSlot>
      </div>
    </div>
  )
}

// ── Analytics ───────────────────────────────────────────────
function Analytics({ busy, run }) {
  const [trips, loading] = useCollection('tripStats')
  const a = useMemo(() => analyse(trips), [trips])

  if (loading) return <p className="text-slate-500">Loading…</p>
  if (!trips.length) {
    return (
      <div className="card p-6 text-center">
        <p className="text-slate-600">No trip history yet.</p>
        <button className="btn-primary mt-3" disabled={busy} onClick={() => run(generateHistory, (n) => `Generated ${n} simulated trips (4 weeks).`)}>
          Generate 4 weeks of simulated history
        </button>
      </div>
    )
  }
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Trips analysed" value={a.trips} sub="last 4 weeks (simulated)" />
        <Stat label="Average occupancy" value={`${a.occupancy}%`} />
        <Stat label="No-show rate" value={`${a.noShowRate}%`} sub={`${a.noShows} seats left empty`} />
        <Stat label="Trips over capacity" value={`${a.overCapPct}%`} sub={`${a.overflow} students left waiting`} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="card p-4">
          <h3 className="font-semibold">Average demand by departure hour</h3>
          <p className="text-xs text-slate-500">Students wanting each departure (all routes, weekdays). Dashed line = seats per departure.</p>
          <BarChart data={a.byHour} capacity={a.avgCap} format={(v) => v.toFixed(0)} />
        </div>
        <div className="card p-4">
          <h3 className="font-semibold">No-show rate by route</h3>
          <p className="text-xs text-slate-500">Share of confirmed bookings that never boarded</p>
          <BarChart data={a.noShowByRoute} format={(v) => `${v.toFixed(1)}%`} />
        </div>
      </div>

      <div className="card p-4">
        <h3 className="font-semibold">Rule-based findings</h3>
        <p className="text-xs text-slate-500">Computed directly from the data. In the final round Gemini explains these and answers follow-up questions.</p>
        <ul className="mt-3 space-y-2 text-sm">
          {a.findings.map((f) => <li key={f} className="rounded-lg bg-slate-50 px-3 py-2">• {f}</li>)}
        </ul>
      </div>

      <GeminiSlot title="Ask about transport operations" connector="Agent grounded on SmartRide trip data (BigQuery / Google Sheets connector)">
        <ul className="space-y-1">
          {['"Which route has the longest waiting times?"', '"What are our peak hours this month?"', '"Which shuttles have the highest no-show rates?"', '"Where would an extra bus help most?"'].map((q) => (
            <li key={q} className="rounded-lg bg-white/70 px-3 py-1.5 text-slate-700">{q}</li>
          ))}
        </ul>
        <p className="mt-2 text-xs">A weekly summary is emailed to the transport office automatically (Gmail).</p>
      </GeminiSlot>
    </div>
  )
}

function analyse(trips) {
  if (!trips.length) return {}
  const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0)
  const booked = sum(trips, (t) => t.booked)
  const noShows = sum(trips, (t) => t.noShows)
  const boarded = sum(trips, (t) => t.boarded)
  const cap = sum(trips, (t) => t.capacity)
  const over = trips.filter((t) => t.overflow > 0)
  const weekday = trips.filter((t) => t.dow >= 1 && t.dow <= 5)

  const hours = [...new Set(trips.map((t) => t.hour))].sort((x, y) => x - y)
  const byHour = hours.map((h) => {
    const rows = weekday.filter((t) => t.hour === h)
    return { label: `${String(h).padStart(2, '0')}:00`, value: sum(rows, (t) => t.demand) / Math.max(1, rows.length) }
  })
  const noShowByRoute = ROUTES.map((r) => {
    const rows = trips.filter((t) => t.routeId === r.id)
    return { label: r.name, value: (100 * sum(rows, (t) => t.noShows)) / Math.max(1, sum(rows, (t) => t.booked)) }
  })

  // Worst route+hour slot for unmet demand
  const slots = {}
  weekday.forEach((t) => {
    const k = `${t.routeId}|${t.hour}`
    slots[k] = slots[k] ?? { routeId: t.routeId, hour: t.hour, overflow: 0, n: 0, wait: 0 }
    slots[k].overflow += t.overflow; slots[k].n++; slots[k].wait += t.avgWaitMin
  })
  const ranked = Object.values(slots).sort((x, y) => y.overflow / y.n - x.overflow / x.n)
  const worst = ranked[0]
  const peak = [...byHour].sort((x, y) => y.value - x.value)[0]
  const worstNoShow = [...noShowByRoute].sort((x, y) => y.value - x.value)[0]
  const waitByRoute = ROUTES.map((r) => {
    const rows = trips.filter((t) => t.routeId === r.id)
    return { name: r.name, wait: sum(rows, (t) => t.avgWaitMin) / Math.max(1, rows.length) }
  }).sort((x, y) => y.wait - x.wait)

  const findings = [
    `Peak demand is at ${peak.label}, averaging ${peak.value.toFixed(0)} students per departure.`,
    `${routeName(worst.routeId)} at ${String(worst.hour).padStart(2, '0')}:00 leaves about ${(worst.overflow / worst.n).toFixed(0)} students behind per weekday departure, with an average wait of ${(worst.wait / worst.n).toFixed(0)} min. It's the strongest case for an extra bus.`,
    `${worstNoShow.label} has the highest no-show rate (${worstNoShow.value.toFixed(1)}%). Releasing those seats at the cutoff recovers ${noShows} seats over 4 weeks.`,
    `Longest average wait: ${waitByRoute[0].name} (${waitByRoute[0].wait.toFixed(0)} min).`,
  ]

  return {
    trips: trips.length,
    occupancy: Math.round((100 * boarded) / cap),
    noShowRate: ((100 * noShows) / booked).toFixed(1),
    noShows,
    overCapPct: Math.round((100 * over.length) / trips.length),
    overflow: sum(trips, (t) => t.overflow),
    avgCap: cap / trips.length,
    byHour, noShowByRoute, findings,
  }
}

/** Minimal single-series bar chart: one hue, thin bars, hover tooltips, baseline-anchored. */
function BarChart({ data, capacity, format = (v) => v }) {
  const max = Math.max(...data.map((d) => d.value), capacity ?? 0) * 1.1 || 1
  const [hover, setHover] = useState(null)
  return (
    <div className="mt-4">
      <div className="relative flex h-48 items-end gap-1 border-b border-slate-300">
        {capacity && (
          <div className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-slate-400" style={{ bottom: `${(capacity / max) * 100}%` }}>
            <span className="absolute -top-5 right-0 text-[10px] text-slate-500">{capacity.toFixed(0)} seats</span>
          </div>
        )}
        {data.map((d, i) => (
          <div key={d.label} className="relative flex h-full flex-1 items-end justify-center"
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <div className={`w-full max-w-10 rounded-t ${hover === i ? 'bg-brand-700' : 'bg-brand-500'}`} style={{ height: `${(d.value / max) * 100}%` }} />
            {hover === i && (
              <div className="absolute bottom-full z-10 mb-1 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs text-white">
                {d.label}: <b>{format(d.value)}</b>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1">
        {data.map((d) => <span key={d.label} className="flex-1 truncate text-center text-[10px] text-slate-500">{d.label}</span>)}
      </div>
    </div>
  )
}

// ── Demo & settings ─────────────────────────────────────────
function Demo({ busy, run }) {
  const settings = useSettings()
  const [n, setN] = useState(34)
  const [routeId, setRouteId] = useState('lrt')
  const steps = [
    ['Reset & seed buses', 'Clears queues and bookings, then schedules fresh buses (LRT-1 has 30 seats).', () => run(() => resetDemo(), 'Demo reset. Fresh buses scheduled.')],
    [`${n} students arrive`, `Simulated students check in at the waiting area for ${routeName(routeId)}, 20 s apart.`, () => run(() => simulateArrivals(routeId, Number(n)), `${n} students joined the queue.`)],
    ['They book in queue order', 'The first 30 fill the next bus. Everyone else keeps waiting in arrival order.', () => run(() => simAutoBook(routeId, { firstBusOnly: true }), (k) => `${k} bookings made in FIFO order.`)],
    ['You check in', 'Open the Student app on your phone, scan the Waiting-area QR and join. You land behind everyone who arrived earlier.', null],
    ['Cancellation → seat reallocated', 'Live operations → LRT-1 → "Sim: a passenger cancels", then "Sim: next in line books". The seat goes to the next person in line, never to someone who arrived later.', null],
    ['Boarding', 'Scan your boarding pass on the Scanner page, then "Sim: board (3 no-shows)" for everyone else.', null],
    ['Boarding cutoff', '"⏱ Boarding cutoff" expires the 3 unclaimed reservations, records the no-shows and releases the seats to the queue.', null],
    ['Insights', 'Analytics tab: demand peaks, no-show rates, and where an extra bus would help most.', null],
  ]
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
      <div className="card p-5">
        <h3 className="text-lg font-bold">Guided demo: 35 students, 30 seats</h3>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <label className="flex items-center gap-2">Route
            <select className="input w-auto py-1.5" value={routeId} onChange={(e) => setRouteId(e.target.value)}>
              {ROUTES.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2">Simulated students
            <input className="input w-20 py-1.5" type="number" min="1" max="200" value={n} onChange={(e) => setN(e.target.value)} />
          </label>
        </div>
        <ol className="mt-4 space-y-2">
          {steps.map(([title, text, action], i) => (
            <li key={title} className="flex gap-3 rounded-xl border border-slate-200 p-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">{i + 1}</span>
              <div className="flex-1">
                <p className="font-semibold">{title}</p>
                <p className="text-sm text-slate-600">{text}</p>
              </div>
              {action && <button className="btn-primary h-fit px-3 py-1.5" disabled={busy} onClick={action}>Run</button>}
            </li>
          ))}
        </ol>
      </div>

      <div className="space-y-4">
        <div className="card space-y-3 p-5">
          <h3 className="font-semibold">Settings</h3>
          <Toggle label="Demo mode: skip location check" checked={settings.bypassLocation}
            onChange={(v) => run(() => saveSettings({ bypassLocation: v }))} />
          <div className="text-sm">
            <p className="label">Waiting-area geofence</p>
            <p className="text-slate-600 tabular-nums">{settings.geofence.lat.toFixed(5)}, {settings.geofence.lng.toFixed(5)} · {settings.geofence.radiusM} m</p>
            <button className="btn-ghost mt-2 w-full" disabled={busy}
              onClick={() => run(async () => {
                const p = await getPosition()
                await saveSettings({ geofence: { lat: p.lat, lng: p.lng, radiusM: settings.geofence.radiusM } })
              }, 'Waiting area set to your current location.')}>📍 Set waiting area to my location</button>
          </div>
          <NumberSetting label="Geofence radius (m)" value={settings.geofence.radiusM} onSave={(v) => run(() => saveSettings({ geofence: { ...settings.geofence, radiusM: v } }), 'Saved')} />
          <NumberSetting label="Arrival QR refresh (seconds)" value={settings.qrRotateSec} onSave={(v) => run(() => saveSettings({ qrRotateSec: Math.max(5, v) }), 'Saved')} />
          <NumberSetting label="No-shows before suspension" value={settings.noShowLimit} onSave={(v) => run(() => saveSettings({ noShowLimit: v }), 'Saved')} />
          <NumberSetting label="Buses students can choose from" value={settings.bookingWindowBuses} onSave={(v) => run(() => saveSettings({ bookingWindowBuses: Math.max(1, v) }), 'Saved')} />
        </div>
        <div className="card space-y-2 p-5">
          <h3 className="font-semibold">Analytics data</h3>
          <button className="btn-ghost w-full" disabled={busy} onClick={() => run(generateHistory, (k) => `Generated ${k} simulated trips.`)}>Regenerate 4 weeks of trip history</button>
        </div>
      </div>
    </div>
  )
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <button type="button" onClick={() => onChange(!checked)} className={`relative h-6 w-11 rounded-full transition ${checked ? 'bg-brand-600' : 'bg-slate-300'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${checked ? 'left-5.5' : 'left-0.5'}`} />
      </button>
    </label>
  )
}

function NumberSetting({ label, value, onSave }) {
  const [v, setV] = useState('')
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="flex-1">{label}</span>
      <input className="input w-20 py-1.5" type="number" placeholder={String(value)} value={v} onChange={(e) => setV(e.target.value)} />
      <button className="btn-ghost px-3 py-1.5" disabled={v === ''} onClick={() => { onSave(Number(v)); setV('') }}>Save</button>
    </div>
  )
}
