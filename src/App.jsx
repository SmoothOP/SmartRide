import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { signInAnonymously } from 'firebase/auth'
import { auth } from './lib/firebase'
import { useAuthUser } from './lib/hooks'
import Landing from './pages/Landing'
import Student from './pages/Student'
import Display from './pages/Display'
import Scanner from './pages/Scanner'
import Admin from './pages/Admin'

// /checkin?c=CODE is what the arrival QR encodes, so a phone's normal camera app works too.
function CheckinRedirect() {
  const { search } = useLocation()
  return <Navigate to={`/student${search}`} replace />
}

// Every visitor gets an anonymous session, so database rules can require sign-in.
function AuthGate({ children }) {
  const user = useAuthUser()
  const [err, setErr] = useState('')
  useEffect(() => {
    if (user === null) signInAnonymously(auth).catch((e) => setErr(e.message))
  }, [user])
  if (err) return <p className="p-8 text-center text-rose-600">Couldn't connect: {err}</p>
  if (!user) return <div className="flex min-h-screen items-center justify-center text-muted">Loading SmartRide…</div>
  return children
}

export default function App() {
  return (
    <AuthGate>
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/student" element={<Student />} />
      <Route path="/checkin" element={<CheckinRedirect />} />
      <Route path="/display" element={<Display />} />
      <Route path="/scanner" element={<Scanner />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </AuthGate>
  )
}
