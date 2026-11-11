import { useState } from 'react'

// Dark by default (matches APSpace). Stored per browser; storage can fail in some contexts.
export function getTheme() {
  try { return localStorage.getItem('smartride-theme') || 'dark' } catch { return 'dark' }
}
export function applyTheme(t) {
  document.documentElement.classList.toggle('dark', t === 'dark')
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'dark' ? '#0c0c10' : '#f5f5f8')
}
export function useTheme() {
  const [theme, setTheme] = useState(getTheme)
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    try { localStorage.setItem('smartride-theme', next) } catch { /* ignore */ }
    setTheme(next)
  }
  return [theme, toggle]
}
