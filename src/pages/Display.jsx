import { useEffect, useState } from 'react'
import { ROUTES } from '../lib/config'
import { useCollection, useNow, useSettings } from '../lib/hooks'
import { rotateArrivalCode } from '../lib/api'
import { upcomingBuses, waitingQueue, freeSeats, fmtTime, tsMs } from '../lib/rules'
import { Logo, QRImage, StatusBadge } from '../components/ui'

/** Shown on a screen/tablet at the shuttle waiting area. The QR rotates so a photo of it goes stale within seconds. */
export default function Display() {
  const settings = useSettings()
  const [code, setCode] = useState(null)
  const [issuedAt, setIssuedAt] = useState(Date.now())
  const [err, setErr] = useState('')
  const now = useNow(250)
  const [buses] = useCollection('buses')
  const [queue] = useCollection('queue')

  useEffect(() => {
    let alive = true
    let prev = null
    const tick = () => rotateArrivalCode(prev)
      .then((c) => { prev = c; if (alive) { setCode(c); setIssuedAt(Date.now()); setErr('') } })
      .catch((e) => alive && setErr(e.message))
    tick()
    const t = setInterval(tick, settings.qrRotateSec * 1000)
    return () => { alive = false; clearInterval(t) }
  }, [settings.qrRotateSec])

  const period = settings.qrRotateSec * 1000
  const left = Math.max(0, period - (now - issuedAt))
  const url = code ? `${window.location.origin}/checkin?c=${code}` : ''

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto grid max-w-6xl gap-8 px-6 py-8 lg:grid-cols-[auto_1fr]">
        <div className="flex flex-col items-center rounded-3xl bg-white p-8 text-slate-900">
          <Logo className="text-xl" />
          <h1 className="mt-4 text-2xl font-extrabold">Arrived? Scan to join the queue</h1>
          <p className="text-sm text-slate-500">Open the SmartRide app or your phone camera</p>
          <div className="mt-5">{code ? <QRImage key={code} text={url} size={320} /> : <div className="h-80 w-80 animate-pulse rounded-xl bg-slate-100" />}</div>
          <div className="mt-5 w-full">
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full bg-brand-600 transition-[width] duration-200 ease-linear" style={{ width: `${(left / period) * 100}%` }} />
            </div>
            <p className="mt-2 text-center text-xs text-slate-500">New code in {Math.ceil(left / 1000)} s · photos of this code stop working</p>
          </div>
          {err && <p className="mt-2 text-sm text-rose-600">{err}</p>}
        </div>

        <div>
          <h2 className="text-xl font-bold text-slate-200">Next departures</h2>
          <div className="mt-4 space-y-5">
            {ROUTES.map((r) => {
              const list = upcomingBuses(buses, r.id).slice(0, 3)
              const waiting = waitingQueue(queue, r.id).length
              return (
                <div key={r.id} className="rounded-2xl bg-slate-900 p-4">
                  <div className="flex items-center">
                    <h3 className="text-lg font-semibold">{r.name}</h3>
                    <span className="ml-auto text-sm text-slate-400">{waiting} waiting</span>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    {list.length === 0 && <p className="text-sm text-slate-500">No buses scheduled</p>}
                    {list.map((b) => {
                      const mins = Math.round((tsMs(b.departAt) - now) / 60000)
                      return (
                        <div key={b.id} className="rounded-xl bg-slate-800 p-3">
                          <div className="flex items-center gap-2">
                            <span className="font-bold">{b.label}</span>
                            <StatusBadge status={b.status} />
                          </div>
                          <p className="mt-1 text-2xl font-extrabold tabular-nums">{fmtTime(b.departAt)}</p>
                          <p className="text-xs text-slate-400">{mins > 0 ? `in ${mins} min` : 'boarding now'}</p>
                          <p className={`mt-2 text-sm font-semibold ${freeSeats(b) === 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                            {freeSeats(b) === 0 ? 'Full' : `${freeSeats(b)} seats free`}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
