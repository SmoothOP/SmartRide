import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
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

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/student" element={<Student />} />
      <Route path="/checkin" element={<CheckinRedirect />} />
      <Route path="/display" element={<Display />} />
      <Route path="/scanner" element={<Scanner />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
