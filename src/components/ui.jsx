import { useEffect, useRef, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import QRCode from 'qrcode'
import { isConfigured } from '../lib/firebase'

export function Logo({ className = '' }) {
  return (
    <Link to="/" className={`flex items-center gap-2 font-bold tracking-tight ${className}`}>
      <img src="/favicon.svg" alt="" className="h-7 w-7" />
      <span>Smart<span className="text-brand-600">Ride</span></span>
    </Link>
  )
}

export function TopBar({ title, children }) {
  const link = ({ isActive }) =>
    `whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-medium ${isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
        <Logo />
        {title && <span className="hidden text-sm text-slate-400 sm:inline">/ {title}</span>}
        <nav className="order-last flex w-full gap-1 overflow-x-auto sm:order-none sm:ml-auto sm:w-auto">
          <NavLink to="/student" className={link}>Student</NavLink>
          <NavLink to="/display" className={link}>Waiting area</NavLink>
          <NavLink to="/scanner" className={link}>Scanner</NavLink>
          <NavLink to="/admin" className={link}>Admin</NavLink>
        </nav>
        {children}
      </div>
      {!isConfigured && (
        <div className="bg-amber-100 px-4 py-2 text-center text-xs text-amber-900">
          Firebase isn't configured yet. Paste your config into <code>src/lib/config.js</code>.
        </div>
      )}
    </header>
  )
}

export function Badge({ tone = 'slate', children }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700', green: 'bg-emerald-100 text-emerald-800', amber: 'bg-amber-100 text-amber-800',
    red: 'bg-rose-100 text-rose-800', blue: 'bg-sky-100 text-sky-800', teal: 'bg-brand-100 text-brand-900',
    violet: 'bg-violet-100 text-violet-800',
  }
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${tones[tone]}`}>{children}</span>
}

export const STATUS = {
  waiting: ['Waiting', 'blue'], booked: ['Booked', 'teal'], confirmed: ['Confirmed', 'teal'], boarded: ['Boarded', 'green'],
  cancelled: ['Cancelled', 'slate'], no_show: ['No-show', 'red'], expired: ['Expired', 'red'], left: ['Left queue', 'slate'],
  scheduled: ['Open', 'teal'], cutoff: ['Last call', 'amber'], departed: ['Departed', 'slate'],
  pending: ['Pending', 'amber'], approved: ['Approved', 'green'], rejected: ['Rejected', 'red'],
}
export const StatusBadge = ({ status }) => {
  const [label, tone] = STATUS[status] ?? [status, 'slate']
  return <Badge tone={tone}>{label}</Badge>
}

export function QRImage({ text, size = 280, className = '' }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    if (!text) return
    QRCode.toDataURL(text, { width: size * 2, margin: 1, errorCorrectionLevel: 'M' }).then(setUrl)
  }, [text, size])
  return url ? <img src={url} width={size} height={size} alt="QR code" className={className} /> : <div style={{ width: size, height: size }} className="animate-pulse rounded-xl bg-slate-100" />
}

/** Camera QR scanner (works on phones over HTTPS). */
export function QRScanner({ onScan, paused = false }) {
  const id = useRef(`qr-${Math.random().toString(36).slice(2)}`).current
  const scannerRef = useRef(null)
  const lastRef = useRef({ text: '', at: 0 })
  const cbRef = useRef(onScan)
  cbRef.current = onScan
  const [error, setError] = useState('')

  useEffect(() => {
    let stopped = false
    let instance
    import('html5-qrcode').then(({ Html5Qrcode }) => {
      if (stopped) return
      instance = new Html5Qrcode(id, { verbose: false })
      scannerRef.current = instance
      instance
        .start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 240, height: 240 } }, (text) => {
          const now = Date.now()
          if (text === lastRef.current.text && now - lastRef.current.at < 3000) return
          lastRef.current = { text, at: now }
          cbRef.current?.(text)
        }, () => {})
        .catch(() => setError('Camera unavailable. Allow camera access, or use the manual entry below.'))
    })
    return () => {
      stopped = true
      const s = scannerRef.current
      if (s?.isScanning) s.stop().then(() => s.clear()).catch(() => {})
    }
  }, [id])

  useEffect(() => {
    const s = scannerRef.current
    if (!s?.isScanning) return
    try { paused ? s.pause(true) : s.resume() } catch { /* not ready */ }
  }, [paused])

  return (
    <div>
      <div id={id} className="overflow-hidden rounded-2xl bg-slate-900 [&_video]:rounded-2xl" style={{ minHeight: 240 }} />
      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
    </div>
  )
}

/** Clearly-labelled slot where Gemini Enterprise plugs in for the final round. */
export function GeminiSlot({ title, connector, children, compact = false }) {
  return (
    <div className="rounded-2xl border border-dashed border-violet-300 bg-gradient-to-br from-violet-50 to-sky-50 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-lg">✦</span>
        <h3 className="font-semibold text-slate-900">{title}</h3>
        <Badge tone="violet">Gemini Enterprise · final round</Badge>
      </div>
      {connector && <p className="mt-1 text-xs font-medium text-violet-700">{connector}</p>}
      {!compact && <div className="mt-2 text-sm text-slate-600">{children}</div>}
    </div>
  )
}

export function useToast() {
  const [toast, setToast] = useState(null)
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])
  const el = toast && (
    <div className={`fixed bottom-4 left-1/2 z-50 w-[92%] max-w-md -translate-x-1/2 rounded-xl px-4 py-3 text-sm font-medium shadow-lg ${toast.error ? 'bg-rose-600 text-white' : 'bg-slate-900 text-white'}`}>
      {toast.msg}
    </div>
  )
  return [el, (msg, error = false) => setToast({ msg, error })]
}

/** Run an async action with a busy flag and toast on error. */
export function useAction(notify) {
  const [busy, setBusy] = useState(false)
  const run = async (fn, okMsg) => {
    setBusy(true)
    try {
      const r = await fn()
      if (okMsg) notify(typeof okMsg === 'function' ? okMsg(r) : okMsg)
      return r
    } catch (e) {
      console.error(e)
      notify(e.message || 'Something went wrong', true)
    } finally {
      setBusy(false)
    }
  }
  return [busy, run]
}
