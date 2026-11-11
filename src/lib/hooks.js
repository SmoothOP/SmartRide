import { useEffect, useState } from 'react'
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'
import { auth, db } from './firebase'
import { DEFAULT_SETTINGS } from './config'

/** Live collection. Pass `filter` as [field, value] for a single equality filter (no composite indexes needed). */
export function useCollection(name, filter) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const key = filter ? `${filter[0]}=${filter[1]}` : ''
  useEffect(() => {
    if (filter && (filter[1] == null)) { setRows([]); setLoading(false); return }
    const q = filter ? query(collection(db, name), where(filter[0], '==', filter[1])) : collection(db, name)
    return onSnapshot(
      q,
      { includeMetadataChanges: false },
      (snap) => { setRows(snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }))); setLoading(false) },
      (err) => { console.error(name, err); setLoading(false) },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, key])
  return [rows, loading]
}

export function useDocument(path, id) {
  const [data, setData] = useState(undefined)
  useEffect(() => {
    if (!id) { setData(null); return }
    return onSnapshot(doc(db, path, id), (s) => setData(s.exists() ? { id: s.id, ...s.data({ serverTimestamps: 'estimate' }) } : null),
      (err) => { console.error(path, err); setData(null) })
  }, [path, id])
  return data
}

export function useSettings() {
  const s = useDocument('settings', 'app')
  return { ...DEFAULT_SETTINGS, ...(s || {}) }
}

export function useAuthUser() {
  const [user, setUser] = useState(undefined)
  useEffect(() => onAuthStateChanged(auth, setUser), [])
  return user
}

/** Re-render every `ms` so countdowns stay live. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}
