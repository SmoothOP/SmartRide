import { Link } from 'react-router-dom'
import { Logo } from '../components/ui'

const screens = [
  { to: '/student', icon: '📱', title: 'Student app', text: 'Check in at the waiting area, see your live queue position, book a bus and get your boarding pass.' },
  { to: '/display', icon: '🖥️', title: 'Waiting-area display', text: 'The arrival QR shown at the shuttle stop. It changes every 15 seconds so it can\'t be shared.' },
  { to: '/scanner', icon: '📷', title: 'Boarding scanner', text: 'Runs on a tablet at the bus door or a staff phone. Scans boarding passes and counts passengers.' },
  { to: '/admin', icon: '📊', title: 'Transport admin', text: 'Live capacity, queues, boarding records, no-shows, demand analytics and demo controls.' },
]

const steps = [
  ['Arrive & scan', 'Scan the live QR at the waiting area. Your arrival time is recorded by the server.'],
  ['Fair virtual queue', 'Your place is set by verified arrival time. No cutting in, no arguments.'],
  ['Pick your bus', 'Choose your destination and one of the next buses with free seats.'],
  ['Board with your pass', 'Show your one-time boarding QR at the door. It can\'t be reused.'],
  ['No-shows release seats', 'At the boarding cutoff, unclaimed seats go straight to the next people waiting.'],
]

export default function Landing() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center px-4 py-5">
        <Logo className="text-lg" />
        <span className="ml-auto text-xs text-slate-500">GDG APU Hackathon · Team Phish &amp; Chips</span>
      </header>

      <section className="mx-auto max-w-6xl px-4 pb-10 pt-6 sm:pt-12">
        <p className="mb-3 inline-block rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold text-brand-900">Smart Campus &amp; Student Experience</p>
        <h1 className="max-w-3xl text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
          Fair, intelligent campus shuttles.
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-slate-600">
          SmartRide doesn't ask exhausted students to police the queue themselves. It makes the system do it, fairly, quietly and intelligently.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link to="/student" className="btn-primary px-5 py-3 text-base">Open the student app</Link>
          <Link to="/admin" className="btn-ghost px-5 py-3 text-base">Admin dashboard</Link>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-4 sm:grid-cols-2 lg:grid-cols-4">
        {screens.map((s) => (
          <Link key={s.to} to={s.to} className="card group p-5 transition hover:-translate-y-0.5 hover:shadow-md">
            <div className="text-3xl">{s.icon}</div>
            <h2 className="mt-3 font-semibold group-hover:text-brand-700">{s.title} →</h2>
            <p className="mt-1 text-sm text-slate-600">{s.text}</p>
          </Link>
        ))}
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="text-xl font-bold">How it works</h2>
        <ol className="mt-4 grid gap-3 sm:grid-cols-5">
          {steps.map(([t, d], i) => (
            <li key={t} className="card p-4">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">{i + 1}</span>
              <h3 className="mt-2 text-sm font-semibold">{t}</h3>
              <p className="mt-1 text-xs text-slate-600">{d}</p>
            </li>
          ))}
        </ol>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="card p-5">
            <h3 className="font-semibold">Deterministic core</h3>
            <p className="mt-1 text-sm text-slate-600">QR validation, arrival timestamps, FIFO ordering, capacity, booking, boarding and no-show rules are plain, auditable code. AI never decides who gets a seat.</p>
          </div>
          <div className="rounded-2xl border border-dashed border-violet-300 bg-violet-50 p-5">
            <h3 className="font-semibold">✦ Gemini Enterprise layer (final round)</h3>
            <p className="mt-1 text-sm text-slate-600">A grounded student assistant, timetable-aware shuttle suggestions via Google Calendar, a workflow agent that triages no-show appeals, and admin analytics grounded on trip data.</p>
          </div>
        </div>
        <p className="mt-8 text-xs text-slate-400">Prototype with simulated buses, routes and students. Not affiliated with APU's transport department.</p>
      </section>
    </div>
  )
}
