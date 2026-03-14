# GateWay — Lean Technical Spec

**What it is**: Connecting flight coordination app. Passengers on feeder flights to the same connection can see each other, share status, and make better decisions.
**Ship by**: Before CWRU Thanksgiving break 2026
**Stack**: Expo (React Native) + Supabase + FlightAware API

---

## 1. Core User Flows

### Flow A: Join a Flight Room
1. Open app → Sign up with email (Supabase Auth, anonymous-friendly)
2. Tap "Add Flight" → Enter flight number (e.g., "UA 1234") + date
3. App validates flight exists via FlightAware API
4. User gets assigned a pseudonym (e.g., "Aisle_14B", "Window_Warrior", "Captain_Coffee")
5. User enters the flight's chat room

### Flow B: Check Connecting Flight Status
1. User has added two flights: CLE→IAD (leg 1) and IAD→FRA (leg 2)
2. App shows the IAD→FRA room with a banner: "This flight has passengers connecting from 3 feeder flights"
3. Each feeder flight shows: flight number, status (on time / delayed / landed), and count of GateWay users on that flight
4. User sees: "UA 512 from CLE — Delayed 45min — 8 GateWay users" and "AA 330 from ORD — On Time — 3 GateWay users"
5. User can tap into feeder flight rooms to read/chat

### Flow C: Live Chat During Disruption
1. Flight gets delayed → push notification to all room members: "UA 1234 now delayed 40 min"
2. Users open room, share status tags: "At Gate", "Stuck in Security", "On Plane", "Rebooking"
3. Chat is pseudonymous, real-time, flight-scoped
4. Users on the connecting long-haul flight see feeder flight delays and passenger counts update live

### Flow D: Airport Fallback
1. User's specific flight room is empty (no other GateWay users)
2. App shows airport-wide room (e.g., "CLE General") with all GateWay users currently at that airport
3. User can still see FlightAware data for their flight (gate, delays, aircraft tracking)

---

## 2. Data Model

### Tables

```sql
-- Users (extends Supabase auth.users)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  pseudonym text,
  created_at timestamptz not null default now()
);

-- Flights (cached from FlightAware, refreshed periodically)
create table public.flights (
  id uuid primary key default gen_random_uuid(),
  flight_number text not null,          -- "UA1234"
  flight_date date not null,
  departure_airport text not null,      -- "CLE"
  arrival_airport text not null,        -- "IAD"
  scheduled_departure timestamptz,
  scheduled_arrival timestamptz,
  actual_departure timestamptz,
  actual_arrival timestamptz,
  status text not null default 'scheduled',  -- scheduled, delayed, in_air, landed, cancelled
  delay_minutes int default 0,
  gate text,
  flightaware_id text,                  -- for API polling
  last_updated timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(flight_number, flight_date)
);

-- User-Flight membership (who is on which flight)
create table public.flight_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  flight_id uuid not null references public.flights(id) on delete cascade,
  pseudonym text not null,              -- per-flight pseudonym
  status_tag text default 'none',       -- none, at_gate, on_plane, in_security, delayed, rebooking
  is_connecting boolean default false,  -- is this a connecting leg?
  connecting_flight_id uuid references public.flights(id),  -- which flight are they connecting TO?
  joined_at timestamptz not null default now(),
  unique(user_id, flight_id)
);

-- Messages
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  flight_id uuid not null references public.flights(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  pseudonym text not null,
  content text not null,
  message_type text not null default 'chat',  -- chat, status_update, system
  created_at timestamptz not null default now()
);

-- Airport rooms (for fallback general chat)
create table public.airport_messages (
  id uuid primary key default gen_random_uuid(),
  airport_code text not null,           -- "CLE"
  user_id uuid not null references public.profiles(id) on delete cascade,
  pseudonym text not null,
  content text not null,
  created_at timestamptz not null default now()
);
```

### Row Level Security (key policies)

```sql
-- Users can only read messages for flights they're members of
create policy "read_flight_messages" on public.messages
  for select using (
    flight_id in (
      select flight_id from public.flight_members where user_id = auth.uid()
    )
  );

-- Users can only send messages to flights they're members of
create policy "send_flight_messages" on public.messages
  for insert with check (
    user_id = auth.uid() and
    flight_id in (
      select flight_id from public.flight_members where user_id = auth.uid()
    )
  );

-- Anyone can read flight info (public data)
create policy "read_flights" on public.flights
  for select using (true);

-- Users can read member counts for any flight (needed for feeder flight display)
-- but pseudonyms are only visible to members of that flight
create policy "read_flight_members" on public.flight_members
  for select using (true);
```

### Indexes

```sql
create index idx_messages_flight_id on public.messages(flight_id, created_at desc);
create index idx_flight_members_flight on public.flight_members(flight_id);
create index idx_flight_members_user on public.flight_members(user_id);
create index idx_flights_arrival on public.flights(arrival_airport, flight_date);
create index idx_flights_number_date on public.flights(flight_number, flight_date);
create index idx_airport_messages on public.airport_messages(airport_code, created_at desc);
```

---

## 3. Tech Stack Details

### Expo (React Native)
- **Expo SDK 52+** (latest stable)
- **Expo Router** for file-based navigation
- **expo-camera** (reserved for Wave 2 boarding pass scanning)
- **expo-notifications** for push notifications

### Supabase
- **Auth**: Email/password signup (keep it simple, no OAuth for MVP)
- **Realtime**: Subscribe to `messages` and `flight_members` tables for live updates
- **Edge Functions**: For FlightAware API polling (runs on a cron, updates `flights` table)
- **Database**: Postgres with RLS

### FlightAware AeroAPI
- **Purpose**: Flight status, delays, gate info, arrival/departure times
- **Polling strategy**: Edge Function runs every 5 minutes for flights with active GateWay users. No polling for flights with 0 members.
- **Cost**: Pay-per-query. Free tier exists for development. Budget ~$50/month for Thanksgiving launch.
- **Fallback**: If API is down, app still works for chat — just no live flight data overlay.

### Key Libraries
- `@supabase/supabase-js` — client SDK
- `react-native-gifted-chat` or custom chat UI — message display
- `zustand` — lightweight local state (current flight, user profile)
- `date-fns` — time formatting ("delayed 45 min", "landed 10 min ago")

---

## 4. Screens

```
Tab 1: My Flights
├── Add Flight (modal: flight number + date input, validates via API)
├── Flight Card (shows status, delay, gate, member count)
│   └── Flight Room
│       ├── Chat messages (real-time)
│       ├── Member list with status tags
│       ├── Connecting flights banner (if hub flight)
│       │   └── Feeder flight cards (status + GateWay user count)
│       └── Flight info bar (gate, departure time, delay)
│
Tab 2: Airport
├── Auto-detected or manually selected airport
├── Airport general chat room
│
Tab 3: Profile
├── Pseudonym display
├── My flights history
├── Sign out
```

**Total screens**: ~6-7 unique screens. That's a month of work.

---

## 5. Build Order

### Wave 1: Foundation (Week 1)
**Goal**: User can sign up, add a flight, and see it on screen.

- [ ] Initialize Expo project with Router and TypeScript
- [ ] Set up Supabase project (database, auth, RLS policies)
- [ ] Run SQL migrations (all tables above)
- [ ] Build auth flow (sign up / sign in screens)
- [ ] Build "Add Flight" modal — flight number + date input
- [ ] Create Supabase Edge Function to validate flight via FlightAware API and insert into `flights` table
- [ ] Build "My Flights" tab showing flight cards with status
- [ ] Pseudonym generator (pool of ~200 flight-themed names, randomly assigned per flight)

**Checkpoint**: User can sign up, add "UA 1234 Nov 26", see it appear with real flight data.

### Wave 2: Chat + Realtime (Week 2-3)
**Goal**: Users in the same flight room can chat in real time and see each other's status.

- [ ] Build Flight Room screen with message list
- [ ] Implement Supabase Realtime subscription for messages
- [ ] Send messages with pseudonym
- [ ] Status tag selector (at gate / on plane / in security / delayed / rebooking)
- [ ] Status tag updates broadcast to room in real-time
- [ ] Member count display ("12 travelers in this room")
- [ ] System messages for events ("Window_Warrior updated status to At Gate")
- [ ] Flight info bar at top of room (gate, time, delay — pulled from `flights` table)
- [ ] Supabase Edge Function cron: poll FlightAware every 5 min for active flights, update `flights` table
- [ ] Push notification when flight status changes (delayed, gate change, cancelled)

**Checkpoint**: Two users on the same flight can chat, see each other's status tags, and get push notifications for delays.

### Wave 3: Connections + Polish (Week 3-4)
**Goal**: The core value prop — see how feeder flights affect your connection.

- [ ] When adding a flight, detect if arrival airport matches departure airport of another user flight → mark as connecting
- [ ] Connecting flights banner on hub flight room: "Passengers connecting from 3 flights"
- [ ] Feeder flight cards: flight number, status, delay, GateWay user count
- [ ] Tap feeder flight card to view that room (read-only if not on that flight, or join chat if you are)
- [ ] Airport general chat room (Tab 2)
- [ ] Auto-detect airport (optional — can be manual selection from a list for MVP)
- [ ] Profile screen with flight history
- [ ] Polish: loading states, error handling, empty states ("You're the first one here!")
- [ ] App Store assets: icon, screenshots, description
- [ ] TestFlight distribution for CWRU beta testers

**Checkpoint**: A user on IAD→FRA can see that the CLE→IAD feeder flight is delayed with 8 GateWay users, and read their chat. App is on TestFlight.

---

## 6. What's Explicitly NOT in MVP

- Hold-O-Meter algorithm (gate-hold probability calculation)
- Boarding pass barcode scanning
- Evidence locker / photo uploads
- Mass complaint filing
- Ride-share matching
- In-flight games or trivia
- Lounge/food meetup features
- Moderation tools (trust CWRU students for beta, add later)
- Analytics dashboard
- Monetization

---

## 7. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| FlightAware API cost overrun | Medium | Medium | Only poll for flights with active users. Set budget alert at $50. |
| No one else on your flight has the app | High (early) | High | Airport fallback room. FlightAware data still useful solo. Seed with CWRU friend group. |
| Trolls joining random flight rooms | Low (at CWRU scale) | Medium | Manual entry is "good enough" verification. Add barcode scanning in v2. |
| App Store rejection | Low | High | Nothing controversial in the app. Submit 2 weeks before Thanksgiving. |
| Supabase Realtime limits | Low | Medium | Free tier supports 200 concurrent connections. Enough for launch. |
| Chat becomes toxic | Low (CWRU beta) | Medium | No moderation in MVP. If needed, add report button in v2. |
