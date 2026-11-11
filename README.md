# SmartRide: fair, intelligent campus shuttles

**GDG APU Hackathon · Team Phish & Chips · Challenge: Smart Campus & Student Experience**

> SmartRide doesn't ask exhausted students to police the queue themselves. It makes the system do it, fairly, quietly and intelligently.

At peak times, APU shuttle queues are first-come-first-served in theory only. People cut in or join friends at the front. Students can't tell whether they'll fit on the next bus, and reserved seats go empty while others wait. SmartRide replaces the physical queue with a **verified virtual queue**. Your place is set by when you actually arrived, seats are allocated fairly, and seats nobody claims go to the next person waiting.

## What the prototype does

| Screen | Path | Purpose |
|---|---|---|
| Student app | `/student` | Sign in → choose destination → scan arrival QR → live queue position & estimated wait → book one of the next buses → one-time boarding QR → cancel / appeal |
| Waiting-area display | `/display` | Arrival QR that **rotates every 15 s** (a photo shared to a friend goes stale), plus live departures and seats |
| Boarding scanner | `/scanner` | Camera scanner for a tablet at the bus door or a staff phone. Validates passes, blocks reuse and wrong-bus passes, counts passengers |
| Transport admin | `/admin` | Live capacity, FIFO queue, boarding cutoff, departures, boarding records, no-shows & appeals, demand analytics, demo controls |

### The rules (deterministic, never AI)
- **Verified arrival:** check-in needs the current rotating QR code, plus a GPS geofence check at check-in only (no tracking; a toggle bypasses it for remote judging). The arrival time is the **server** timestamp.
- **FIFO queue:** each destination has its own queue, ordered by verified arrival time.
- **Fair booking window:** a student at waiting position *p* can book bus *k* (one of the next N buses with free seats) only if *p* ≤ free seats on bus *k* and every earlier bus in the window. Everyone ahead of you is always guaranteed a seat first; someone who arrived later can never overtake you. See `src/lib/rules.js`.
- **Atomic capacity:** bookings, cancellations and boarding are Firestore transactions, so two students can never take the last seat.
- **Boarding passes** are single-use, bound to one bus, and verified against live records.
- **No-shows:** at the boarding cutoff, unclaimed reservations expire, seats are released to the queue, and a no-show is recorded. 3 no-shows → 7-day booking suspension. Cancelling before the cutoff never counts, and appeals can remove a no-show.

### Gemini Enterprise layer (final round)
Marked in the app with **✦ Gemini Enterprise · final round**:
1. **Student assistant (Agent Studio):** "How many people are ahead of me?", "Book me on the next shuttle to the LRT." Grounded on live SmartRide data; actions go through the same backend rules.
2. **Timetable-aware suggestions (Google Calendar connector):** "My class ends at 4 PM. Which shuttle can I catch?"
3. **No-show appeal workflow agent:** categorises appeals, logs them, and routes them to the transport office (Gmail / Google Chat) with a suggested decision. A human approves.
4. **Admin analytics agent:** grounded on trip data (Firestore → BigQuery / Google Sheets) for peak hours, no-show rates and where extra buses help. Sends a weekly summary.

## Tech stack
React (Vite) · Tailwind CSS · Firebase Auth (anonymous) · Cloud Firestore (real-time) · `qrcode` · `html5-qrcode` · hosted on Vercel / Firebase Hosting.

## Run it locally
```bash
npm install
# paste your Firebase web config into src/lib/config.js
npm run dev
```
Firebase setup: create a project, enable **Firestore** (test mode) and **Authentication → Anonymous**.

## Demo script (35 students, 30 seats)
Admin → **Demo & settings**, then:
1. **Reset & seed buses.** LRT-1 has 30 seats.
2. **34 students arrive** (simulated, 20 s apart).
3. **They book in queue order.** LRT-1 fills; 4 keep waiting.
4. **You check in** on your phone by scanning `/display`. You're #5, behind everyone who arrived earlier.
5. **A passenger cancels** → **next in line books**. The seat goes to #1 in line, not to you.
6. **Boarding:** scan your pass on `/scanner`; simulate the rest with 3 no-shows.
7. **Boarding cutoff:** 3 reservations expire, the seats return to the queue, and the no-shows are recorded.
8. **Analytics:** 4 weeks of simulated history: peak hours, no-show rates, where to add a bus.

## Prototype limitations → production
- Data (buses, routes, students, history) is simulated.
- The queue-position check runs on the client before the atomic capacity transaction. In production it would move into a Cloud Function, with Firestore security rules locking direct writes.
- Sign-in would use APU single sign-on instead of anonymous auth.
- The admin dashboard is open for judging; production would require staff roles.
