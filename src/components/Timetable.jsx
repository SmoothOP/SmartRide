import { useState } from 'react'
import { ROUTES, timesFrom, timesTo, runsOn, atTime } from '../lib/timetable'
import { useNow } from '../lib/hooks'

/** Full APU shuttle timetable. Past departures are dimmed and the next one is highlighted. */
export default function Timetable() {
  const [dir, setDir] = useState('from')
  const [open, setOpen] = useState('lrt')
  const now = useNow(30000)
  const today = new Date(now)

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {[['from', 'From APU'], ['to', 'To APU']].map(([id, label]) => (
          <button key={id} onClick={() => setDir(id)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${dir === id ? 'bg-fg text-canvas' : 'bg-subtle text-fg2'}`}>{label}</button>
        ))}
      </div>
      {ROUTES.map((r) => {
        const times = dir === 'from' ? timesFrom(r.id) : timesTo(r.id)
        if (!times.length) return null
        const runs = runsOn(r, today)
        const nextIdx = runs ? times.findIndex((t) => atTime(today, t) > now) : -1
        const isOpen = open === r.id
        return (
          <div key={r.id} className="card overflow-hidden">
            <button onClick={() => setOpen(isOpen ? null : r.id)} className="flex w-full items-center gap-2 px-4 py-3 text-left">
              <span className="text-sm font-bold uppercase tracking-wide">
                {dir === 'from' ? <>APU <span className="text-brand-500">▸</span> {r.name}</> : <>{r.name} <span className="text-brand-500">▸</span> APU</>}
              </span>
              {r.fridayOnly && <span className="text-xs text-muted">(Friday only)</span>}
              <span className="ml-auto text-xs text-muted">
                {nextIdx >= 0 ? `next ${times[nextIdx]}` : runs ? 'done for today' : 'not today'}
              </span>
            </button>
            {isOpen && (
              <div className="grid grid-cols-3 gap-x-2 gap-y-1 border-t border-brand-600/40 px-4 py-3 sm:grid-cols-4">
                {times.map((t, i) => (
                  <span key={t + i}
                    className={`rounded-lg py-1 text-center text-sm tabular-nums ${
                      i === nextIdx ? 'bg-brand-600 font-bold text-white' : nextIdx === -1 || i < nextIdx ? 'text-muted/60' : 'font-semibold text-fg'
                    }`}>
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        )
      })}
      <p className="text-center text-xs text-muted">Source: APSpace Bus Shuttle Services timetable</p>
    </div>
  )
}
