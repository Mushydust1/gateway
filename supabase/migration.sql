-- GateWay Database Schema
-- Run this in your Supabase SQL Editor

-- ============================================================================
-- TABLE: profiles (extends auth.users)
-- ============================================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  pseudonym text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- ============================================================================
-- TABLE: flights (cached flight data)
-- ============================================================================
create table public.flights (
  id uuid primary key default gen_random_uuid(),
  flight_number text not null,
  flight_date date not null,
  departure_airport text not null default 'TBD',
  arrival_airport text not null default 'TBD',
  scheduled_departure timestamptz,
  scheduled_arrival timestamptz,
  actual_departure timestamptz,
  actual_arrival timestamptz,
  status text not null default 'scheduled',
  delay_minutes int default 0,
  gate text,
  flightaware_id text,
  last_updated timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(flight_number, flight_date)
);

alter table public.flights enable row level security;

-- Anyone can read flights (public data)
create policy "Flights are publicly readable"
  on public.flights for select
  using (true);

-- Authenticated users can create flights
create policy "Authenticated users can create flights"
  on public.flights for insert
  with check (auth.role() = 'authenticated');

create index idx_flights_number_date on public.flights(flight_number, flight_date);
create index idx_flights_arrival on public.flights(arrival_airport, flight_date);
create index idx_flights_status on public.flights(status);

-- ============================================================================
-- TABLE: flight_members (who is on which flight)
-- ============================================================================
create table public.flight_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  flight_id uuid not null references public.flights(id) on delete cascade,
  pseudonym text not null,
  status_tag text default 'none',
  is_connecting boolean default false,
  connecting_flight_id uuid references public.flights(id),
  joined_at timestamptz not null default now(),
  unique(user_id, flight_id)
);

alter table public.flight_members enable row level security;

-- Anyone can read member counts (needed for feeder flight display)
create policy "Flight members are readable"
  on public.flight_members for select
  using (true);

-- Users can join flights
create policy "Users can join flights"
  on public.flight_members for insert
  with check (auth.uid() = user_id);

-- Users can update their own membership (status tags)
create policy "Users can update own membership"
  on public.flight_members for update
  using (auth.uid() = user_id);

create index idx_flight_members_flight on public.flight_members(flight_id);
create index idx_flight_members_user on public.flight_members(user_id);

-- ============================================================================
-- TABLE: messages (flight chat)
-- ============================================================================
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  flight_id uuid not null references public.flights(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  pseudonym text not null,
  content text not null,
  message_type text not null default 'chat',
  created_at timestamptz not null default now()
);

alter table public.messages enable row level security;

-- Users can read messages for flights they're members of
create policy "Read messages for joined flights"
  on public.messages for select
  using (
    flight_id in (
      select flight_id from public.flight_members where user_id = auth.uid()
    )
  );

-- Users can send messages to flights they're members of
create policy "Send messages to joined flights"
  on public.messages for insert
  with check (
    auth.uid() = user_id and
    flight_id in (
      select flight_id from public.flight_members where user_id = auth.uid()
    )
  );

create index idx_messages_flight on public.messages(flight_id, created_at desc);

-- ============================================================================
-- TABLE: airport_messages (general airport chat)
-- ============================================================================
create table public.airport_messages (
  id uuid primary key default gen_random_uuid(),
  airport_code text not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  pseudonym text not null,
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.airport_messages enable row level security;

-- Anyone authenticated can read airport messages
create policy "Read airport messages"
  on public.airport_messages for select
  using (auth.role() = 'authenticated');

-- Authenticated users can send airport messages
create policy "Send airport messages"
  on public.airport_messages for insert
  with check (auth.uid() = user_id);

create index idx_airport_messages on public.airport_messages(airport_code, created_at desc);

-- ============================================================================
-- Enable Realtime for chat tables
-- ============================================================================
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.flight_members;
alter publication supabase_realtime add table public.airport_messages;
