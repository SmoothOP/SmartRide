import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { signInAnonymously, signOut } from 'firebase/auth'
import { auth } from '../lib/firebase'
import { ROUTES, routeName } from '../lib/config'
import { useAuthUser, useCollection, useDocument, useNow, useSettings } from '../lib/hooks'
import {
  ensureStudent, checkIn, leaveQueue, bookSeat, cancelBooking, submitAppeal, boardingQRText, currentArrivalCode,
} from '../lib/api'
import {
  waitingQueue, positionOf, bookingWindow, canBook, estimate, upcomingBuses, freeSeats, isSuspended, fmtTime, tsMs,
} from '../lib/rules'
import { TopBar, Badge, StatusBadge, QRImage, QRScanner, GeminiSlot, useToast, useAction } from '../components/ui'

export default function Student() {
  const user = useAuthUser()
  const student = useDocument('students', user?.uid)
  const [toastEl, notify] = useToast()

  return (
    <div className="min-h-screen pb-16">
      <TopBar title="Student" />
      <main className="mx-auto max-w-xl px-4 py-6">
        {user === undefined || (user && student === undefined) ? (
          <p className="text-center text-slate-500">Loading…</p>
        ) : !user || !student ? (
          <SignIn user={user} notify={notify} />
        ) : (
          <StudentHome user={user} student={student} notify={notify} />
        )}
      </main>
      {toastEl}
    </div>
  )
}

function SignIn({ user, notify }) {
  const [name, setName] = useState('')
  const [tp, setTp] = useState('')
  const [busy, run] = useAction(notify)
  const submit = (e) => {
    e.preventDefault()
    run(async () => {
      const cred = user ?? (await signInAnonymously(auth)).user
      await ensureStudent(cred.uid, name.trim(), tp.trim().toUpperCase())
    })
  }
  return (
    <form onSubmit={submit} className="card space-y-4 p-6">
      <div>
        <h1 className="text-2xl font-bold">Welcome to SmartRide</h1>
        <p className="mt-1 text-sm text-slate-600">Sign in to join the shuttle queue. (Prototype: in production this would be APU single sign-on.)</p>
      </div>
      <div>
        <label className="label" htmlFor="n">Full name</label>
        <input id="n" className="input" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Aisyah Rahman" />
      </div>
      <div>
        <label className="label" htmlFor="tp">Student ID</label>
        <input id="tp" className="input" required value={tp} onChange={(e) => setTp(e.target.value)} placeholder="e.g. TP071234" />
      </div>
      <button className="btn-primary w-full" disabled={busy}>{busy ? 'Signing in…' : 'Continue'}</button>
    </form>
  )
}

function StudentHome({ user, student, notify }) {
  const uid = user.uid
  const entry = useDocument('queue', uid)
  const booking = useDocument('bookings', entry?.status === 'booked' ? entry.bookingId : null)
  const settings = useSettings()
  const suspended = isSuspended(student)
  const active = entry && ['waiting', 'booked'].includes(entry.status)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">Signed in as</p>
          <p className="font-semibold">{student.name} <span className="font-normal text-slate-500">· {student.studentId}</span></p>
        </div>
        <button className="text-xs text-slate-500 underline" onClick={() => signOut(auth)}>Switch user</button>
      </div>

      {suspended && (
        <div className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-800">
          <b>Booking suspended</b> until {new Date(tsMs(student.suspendedUntil)).toLocaleDateString()} after {student.noShows} no-shows. You can appeal below.
        </div>
      )}
      {!suspended && student.noShows > 0 && (
        <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
          You have {student.noShows} no-show{student.noShows > 1 ? 's' : ''} on record. After {settings.noShowLimit}, booking is suspended for {settings.suspendDays} days.
        </div>
      )}

      {entry === undefined ? null : entry?.status === 'booked' ? (
        booking ? <BoardingPass booking={booking} notify={notify} /> : <p className="text-center text-slate-500">Loading your pass…</p>
      ) : entry?.status === 'waiting' ? (
        <WaitingView entry={entry} uid={uid} settings={settings} notify={notify} />
      ) : (
        <>
          {entry?.status === 'boarded' && (
            <div className="card p-5 text-center">
              <div className="text-4xl">🚌</div>
              <h2 className="mt-2 text-xl font-bold">You're on board. Have a good trip!</h2>
              <p className="text-sm text-slate-600">Check in again next time you're at the waiting area.</p>
            </div>
          )}
          {entry?.status === 'expired' && <NoShowNotice uid={uid} student={student} notify={notify} />}
          {!suspended && <CheckInPanel uid={uid} settings={settings} notify={notify} />}
        </>
      )}

      {suspended && entry?.status !== 'expired' && <AppealForm uid={uid} student={student} notify={notify} />}

      <GeminiSlot title="Ask SmartRide" connector="Agent Studio agent · grounded on live SmartRide queue & bus data">
        <p>Ask in plain language and get answers from live data, e.g.:</p>
        <ul className="mt-2 space-y-1">
          {['"How many people are ahead of me?"', '"Book me on the next shuttle to the LRT."', '"Can I cancel my reservation?"'].map((q) => (
            <li key={q} className="rounded-lg bg-white/70 px-3 py-1.5 text-slate-700">{q}</li>
          ))}
        </ul>
        <p className="mt-2 text-xs">Bookings requested through Gemini go through the same backend rules. The AI can't override fairness or capacity.</p>
      </GeminiSlot>
      <GeminiSlot title="Shuttles that fit my timetable" connector="Google Calendar connector">
        <p>"My class finishes at 4 PM. Which shuttle can I catch?" Gemini reads your class schedule from Google Calendar, then recommends a bus using live seats and queue length.</p>
      </GeminiSlot>
      {!active && <p className="text-center text-xs text-slate-400">Location check: {settings.bypassLocation ? 'bypassed (demo mode)' : `within ${settings.geofence.radiusM} m of the waiting area`}</p>}
    </div>
  )
}

function extractCode(text) {
  try {
    const u = new URL(text)
    return u.searchParams.get('c')
  } catch {
    return /^[A-Z0-9]{6,12}$/.test(text) ? text : null
  }
}

function CheckInPanel({ uid, settings, notify }) {
  const [params, setParams] = useSearchParams()
  const [code, setCode] = useState(params.get('c'))
  const [routeId, setRouteId] = useState(ROUTES[0].id)
  const [scanning, setScanning] = useState(false)
  const [busy, run] = useAction(notify)

  const onScan = (text) => {
    const c = extractCode(text)
    if (!c) return notify('That isn\'t the SmartRide arrival QR.', true)
    setCode(c)
    setScanning(false)
  }
  const doCheckIn = () =>
    run(async () => {
      await checkIn({ uid, routeId, code })
      setParams({}, { replace: true })
    }, 'Checked in. Your place in the queue is saved.').then(() => setCode(null))

  return (
    <div className="card space-y-4 p-5">
      <div>
        <h2 className="text-lg font-bold">Check in at the waiting area</h2>
        <p className="text-sm text-slate-600">Your queue place is based on when you check in here, so scan as soon as you arrive.</p>
      </div>

      <div>
        <span className="label">1 · Where are you going?</span>
        <div className="grid gap-2 sm:grid-cols-3">
          {ROUTES.map((r) => (
            <button key={r.id} onClick={() => setRouteId(r.id)}
              className={`rounded-xl border px-3 py-2.5 text-left text-sm font-medium ${routeId === r.id ? 'border-brand-600 bg-brand-50 text-brand-900 ring-2 ring-brand-100' : 'border-slate-200 hover:bg-slate-50'}`}>
              {r.name}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className="label">2 · Scan the QR on the waiting-area screen</span>
        {code ? (
          <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
            <span>✓ Arrival QR scanned</span>
            <button className="text-xs underline" onClick={() => setCode(null)}>Rescan</button>
          </div>
        ) : scanning ? (
          <div className="space-y-2">
            <QRScanner onScan={onScan} />
            <button className="btn-ghost w-full" onClick={() => setScanning(false)}>Cancel</button>
          </div>
        ) : (
          <div className="grid gap-2">
            <button className="btn-ghost" onClick={() => setScanning(true)}>📷 Open camera</button>
            {settings.bypassLocation && (
              <button className="text-xs text-slate-500 underline" onClick={() => run(async () => {
                const c = await currentArrivalCode()
                if (!c) throw new Error('Open the Waiting-area display page first; it generates the QR.')
                setCode(c)
              })}>Demo: simulate scanning the live code</button>
            )}
          </div>
        )}
      </div>

      <button className="btn-primary w-full py-3" disabled={!code || busy} onClick={doCheckIn}>
        {busy ? 'Verifying…' : `Check in for ${routeName(routeId)}`}
      </button>
      {!settings.bypassLocation && <p className="text-xs text-slate-500">We check your location once, at check-in only, to confirm you're at the waiting area. No tracking.</p>}
    </div>
  )
}

function WaitingView({ entry, uid, settings, notify }) {
  const now = useNow(5000)
  const [routeQueue] = useCollection('queue', ['routeId', entry.routeId])
  const [buses] = useCollection('buses', ['routeId', entry.routeId])
  const [busy, run] = useAction(notify)

  const waiting = useMemo(() => waitingQueue(routeQueue, entry.routeId), [routeQueue, entry.routeId])
  const pos = positionOf(uid, waiting)
  const window = bookingWindow(buses, entry.routeId, settings.bookingWindowBuses)
  const est = estimate(pos, buses, entry.routeId, now)
  const upcoming = upcomingBuses(buses, entry.routeId)

  return (
    <div className="space-y-4">
      <div className="card overflow-hidden">
        <div className="bg-slate-900 p-5 text-white">
          <p className="text-sm text-slate-300">Your place in line · {routeName(entry.routeId)}</p>
          <div className="mt-1 flex items-end gap-3">
            <span className="text-6xl font-extrabold tabular-nums">#{pos || '–'}</span>
            <span className="pb-2 text-sm text-slate-300">{Math.max(0, pos - 1)} ahead of you · {waiting.length} waiting</span>
          </div>
          <p className="mt-2 text-sm text-slate-300">Checked in at {fmtTime(entry.arrivedAt)} (verified)</p>
        </div>
        <div className="grid grid-cols-2 divide-x divide-slate-200 text-center">
          <div className="p-3">
            <p className="text-xs text-slate-500">Estimated wait</p>
            <p className="text-lg font-bold">{est?.waitMin != null ? `~${est.waitMin} min` : 'Over capacity'}</p>
          </div>
          <div className="p-3">
            <p className="text-xs text-slate-500">Likely bus</p>
            <p className="text-lg font-bold">{est?.bus?.label ?? 'Next schedule'}</p>
          </div>
        </div>
      </div>

      <div className="card p-5">
        <h3 className="font-semibold">Choose your bus</h3>
        <p className="mb-3 text-xs text-slate-500">You can book one of the next {settings.bookingWindowBuses} buses with free seats once your place in line is covered by the free seats. Everyone ahead of you is always guaranteed a seat first.</p>
        <div className="space-y-2">
          {upcoming.length === 0 && <p className="text-sm text-slate-500">No buses scheduled for this route yet.</p>}
          {upcoming.map((bus) => {
            const w = window.find((x) => x.bus.id === bus.id)
            const ok = canBook(pos, w)
            const free = freeSeats(bus)
            const mins = Math.round((tsMs(bus.departAt) - now) / 60000)
            const pct = Math.min(100, ((bus.booked ?? 0) / bus.capacity) * 100)
            return (
              <div key={bus.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{bus.label}</span>
                  <StatusBadge status={bus.status} />
                  <span className="ml-auto text-sm text-slate-600">{fmtTime(bus.departAt)} · {mins > 0 ? `in ${mins} min` : 'now'}</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-full rounded-full ${free === 0 ? 'bg-rose-500' : 'bg-brand-500'}`} style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-sm text-slate-600">{free} of {bus.capacity} seats free</span>
                  <button className="btn-primary ml-auto px-3 py-1.5" disabled={!ok || busy}
                    onClick={() => run(() => bookSeat({ uid, busId: bus.id }), `Booked on ${bus.label}. Your boarding pass is ready.`)}>
                    Book
                  </button>
                </div>
                {!ok && free > 0 && w && <p className="mt-1 text-xs text-slate-500">Opens for you when {pos - w.cumFree} more {pos - w.cumFree === 1 ? 'person' : 'people'} ahead book or seats free up.</p>}
                {free === 0 && <p className="mt-1 text-xs text-slate-500">Full. If someone cancels or doesn't board, the seat goes to the next person in line.</p>}
              </div>
            )
          })}
        </div>
      </div>

      <button className="btn-danger w-full" disabled={busy} onClick={() => run(() => leaveQueue(uid), 'You left the queue.')}>Leave the queue</button>
    </div>
  )
}

function BoardingPass({ booking, notify }) {
  const now = useNow(1000)
  const bus = useDocument('buses', booking.busId)
  const [busy, run] = useAction(notify)
  const mins = Math.round((tsMs(booking.departAt) - now) / 60000)
  return (
    <div className="card overflow-hidden">
      <div className="bg-brand-700 p-5 text-white">
        <p className="text-sm text-brand-100">Boarding pass · {routeName(booking.routeId)}</p>
        <p className="text-3xl font-extrabold">{booking.busLabel}</p>
        <p className="text-sm text-brand-100">Departs {fmtTime(booking.departAt)} · {mins > 0 ? `in ${mins} min` : 'boarding now'}</p>
      </div>
      <div className="flex flex-col items-center p-5">
        <QRImage text={boardingQRText(booking)} size={240} />
        <p className="mt-3 font-semibold">{booking.name}</p>
        <p className="text-sm text-slate-500">{booking.studentId}</p>
        {bus?.status === 'cutoff' && <Badge tone="amber">Last call: board now</Badge>}
        <p className="mt-3 text-center text-xs text-slate-500">Show this at the bus door. It works once. If you don't board before the boarding cutoff, the seat is released and it counts as a no-show.</p>
        <button className="btn-danger mt-4 w-full" disabled={busy}
          onClick={() => run(() => cancelBooking(booking.id), 'Booking cancelled. You kept your place in the queue.')}>
          Cancel booking (no penalty)
        </button>
      </div>
    </div>
  )
}

function NoShowNotice({ uid, student, notify }) {
  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-800">
        <b>Your reservation expired.</b> You didn't board before the boarding cutoff, so your seat went to the next student waiting. This has been recorded as a no-show ({student.noShows} total).
      </div>
      <AppealForm uid={uid} student={student} notify={notify} />
    </div>
  )
}

function AppealForm({ uid, student, notify }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('emergency')
  const [details, setDetails] = useState('')
  const [busy, run] = useAction(notify)
  const [sent, setSent] = useState(false)
  useEffect(() => setSent(false), [student.noShows])
  if (sent) return <p className="rounded-xl bg-slate-100 p-3 text-sm text-slate-700">Appeal submitted. The transport office will review it.</p>
  if (!open) return <button className="btn-ghost w-full" onClick={() => setOpen(true)}>Appeal a no-show</button>
  return (
    <div className="card space-y-3 p-5">
      <h3 className="font-semibold">Appeal a no-show</h3>
      <div>
        <label className="label">Reason</label>
        <select className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
          <option value="emergency">Emergency</option>
          <option value="technical">App or phone problem</option>
          <option value="class">Class ran late</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div>
        <label className="label">What happened?</label>
        <textarea className="input" rows={3} value={details} onChange={(e) => setDetails(e.target.value)} />
      </div>
      <button className="btn-primary w-full" disabled={busy || !details.trim()}
        onClick={() => run(async () => {
          await submitAppeal({ uid, name: student.name, studentId: student.studentId, reason, details: details.trim() })
          setSent(true)
        })}>Submit appeal</button>
      <GeminiSlot compact title="Triaged by a Gemini workflow agent" connector="Workflow agent → Gmail / Google Chat to the transport office" />
    </div>
  )
}
