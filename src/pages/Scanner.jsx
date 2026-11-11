import { useState } from 'react'
import { routeName } from '../lib/config'
import { useCollection } from '../lib/hooks'
import { boardByQR } from '../lib/api'
import { fmtTime, tsMs } from '../lib/rules'
import { TopBar, QRScanner, StatusBadge } from '../components/ui'

/** Runs on a tablet fixed at the bus door, or a staff member's phone. The driver doesn't have to do anything. */
export default function Scanner() {
  const [buses] = useCollection('buses')
  const [busId, setBusId] = useState('')
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [manual, setManual] = useState('')

  const active = buses.filter((b) => b.status !== 'departed').sort((a, b) => tsMs(a.departAt) - tsMs(b.departAt))
  const bus = buses.find((b) => b.id === busId)

  const scan = async (text) => {
    if (busy) return
    setBusy(true)
    try {
      const bk = await boardByQR(text, { busId: busId || undefined })
      setResult({ ok: true, title: 'Boarded ✓', name: bk.name, sub: `${bk.studentId} · ${routeName(bk.routeId)} ${bk.busLabel}` })
      try { navigator.vibrate?.(80) } catch { /* ignore */ }
    } catch (e) {
      setResult({ ok: false, title: 'Not accepted', sub: e.message })
      try { navigator.vibrate?.([60, 60, 60]) } catch { /* ignore */ }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen pb-10">
      <TopBar title="Boarding scanner" />
      <main className="mx-auto max-w-xl space-y-4 px-4 py-6">
        <div className="card p-4">
          <label className="label" htmlFor="bus">Scanning for bus</label>
          <select id="bus" className="input" value={busId} onChange={(e) => { setBusId(e.target.value); setResult(null) }}>
            <option value="">Any bus (accept every valid pass)</option>
            {active.map((b) => <option key={b.id} value={b.id}>{routeName(b.routeId)} · {fmtTime(b.departAt)}</option>)}
          </select>
          {bus && (
            <div className="mt-3 flex items-center gap-3 text-sm">
              <StatusBadge status={bus.status} />
              <span><b className="tabular-nums">{bus.boarded ?? 0}</b> boarded</span>
              <span className="text-muted">· {bus.booked ?? 0} booked · {bus.capacity} seats</span>
            </div>
          )}
        </div>

        <QRScanner onScan={scan} paused={busy} />

        {result && (
          <div className={`rounded-2xl p-5 text-center ${result.ok ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`}>
            <p className="text-2xl font-extrabold">{result.title}</p>
            {result.name && <p className="mt-1 text-xl font-semibold">{result.name}</p>}
            <p className="mt-1 text-sm opacity-90">{result.sub}</p>
          </div>
        )}

        <details className="card p-4 text-sm">
          <summary className="cursor-pointer font-medium text-fg2">Camera not working? Enter pass code manually</summary>
          <div className="mt-3 flex gap-2">
            <input className="input" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="SMARTRIDE:B:…" />
            <button className="btn-primary" disabled={!manual || busy} onClick={() => scan(manual)}>Check</button>
          </div>
        </details>
        <p className="text-center text-xs text-muted">Passes are single-use and tied to one bus. The scanner checks every pass against the live SmartRide records.</p>
      </main>
    </div>
  )
}
