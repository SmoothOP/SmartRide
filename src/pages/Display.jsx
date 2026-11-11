import { useEffect, useState } from 'react'
import { routeName } from '../lib/config'
import { useCollection, useNow, useSettings } from '../lib/hooks'
import { rotateArrivalCode } from '../lib/api'
import { waitingQueue, freeSeats, fmtIn, tsMs } from '../lib/rules'
import { Logo, QRImage } from '../components/ui'

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
  const next = buses.filter((b) => b.status !== 'departed').sort((a, b) => tsMs(a.departAt) - tsMs(b.departAt)).slice(0, 9)
  const url = code ? `${window.location.origin}/checkin?c=${code}` : ''

  return (
    <div className="min-h-screen bg-[#0c0c10] text-white">
      <div className="mx-auto grid max-w-6xl gap-8 px-6 py-8 lg:grid-cols-[auto_1fr]">
        <div className="flex flex-col items-center rounded-3xl bg-white p-8 text-slate-900">
          <Logo className="text-xl" />
          <h1 className="mt-4 text-2xl font-extrabold">Arrived? Scan to join the queue</h1>
          <p className="text-sm text-slate-500">Open the SmartRide app or your phone camera</p>
          <p className="mt-1 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">Shown on the screen at the APU shuttle stop</p>
          <div className="mt-5">{code ? <QRImage key={code} text={url} size={320} /> : <div className="h-80 w-80 animate-pulse rounded-xl bg-slate-100" />}</div>
          <div className="mt-5 w-full">
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full bg-[#2d87ff] transition-[width] duration-200 ease-linear" style={{ width: `${(left / period) * 100}%` }} />
            </div>
            <p className="mt-2 text-center text-xs text-slate-500">New code in {Math.ceil(left / 1000)} s · photos of this code stop working</p>
          </div>
          {err && <p className="mt-2 text-sm text-rose-600">{err}</p>}
        </div>

        <div>
          <div className="flex items-center">
            <h2 className="text-xl font-bold text-slate-200">Next departures from APU</h2>
            <a href="/" className="ml-auto text-xs text-slate-500 hover:text-slate-300">← SmartRide home</a>
          </div>
          <div className="mt-4 overflow-hidden rounded-3xl bg-[#1a1a1f]">
            {next.length === 0 && <p className="p-5 text-sm text-slate-400">No buses scheduled</p>}
            {next.map((b) => {
              const waiting = waitingQueue(queue, b.routeId).length
              const free = freeSeats(b)
              return (
                <div key={b.id} className="grid grid-cols-[72px_1fr_auto] items-center gap-4 border-b border-white/5 px-5 py-3 last:border-0">
                  <span className="text-2xl font-extrabold tabular-nums">{b.label}</span>
                  <div>
                    <p className="font-semibold">{routeName(b.routeId)}</p>
                    <p className="text-xs text-slate-400">{fmtIn(b.departAt, now)}{waiting ? ` · ${waiting} waiting` : ''}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-sm font-semibold ${free === 0 ? 'bg-rose-500/15 text-rose-300' : 'bg-emerald-500/15 text-emerald-300'}`}>
                    {free === 0 ? 'Full' : `${free} seats`}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
