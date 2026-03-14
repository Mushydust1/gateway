---
title: "refactor: Address code review findings from regression fix commit"
type: refactor
date: 2026-03-14
---

# Address Code Review Findings (P1/P2/P3)

## Overview

Commit `647ab13` fixed RLS recursion, profile loading, and pseudonym handling regressions. A 7-agent review identified 11 findings. This plan addresses all of them in priority order, with the biggest architectural simplification first.

## Problem Statement

The prior code review (migration-002) introduced a co-passenger RLS restriction on `flight_members` — a table containing only UUIDs and pseudonyms (non-sensitive, designed-to-be-public data). This caused an infinite recursion bug, which was patched with a `SECURITY DEFINER` function in migration-003. The review found that the root cause is a YAGNI violation: the restriction shouldn't exist. Additionally, unused schema columns (`connecting_flight_id`, `is_connecting`) cause FK ambiguity requiring brittle workarounds in client code.

## Implementation Phases

### Phase 1: Schema Simplification (P1 #1 + P2 #7) — HIGH IMPACT

**Goal:** Remove unnecessary complexity at the database level, which cascades into client simplification.

#### 1a. Revert `flight_members` RLS to `USING (true)`

**File:** `supabase/migration-004-simplify.sql`

```sql
-- Drop the over-engineered co-passenger policy
DROP POLICY IF EXISTS "Flight members visible to co-passengers" ON public.flight_members;

-- Restore simple public-read policy (data is UUIDs + pseudonyms, not sensitive)
CREATE POLICY "Flight members are readable"
  ON public.flight_members FOR SELECT USING (true);

-- Drop the SECURITY DEFINER function that only existed to fix the recursion
DROP FUNCTION IF EXISTS public.get_my_flight_ids();
```

#### 1b. Drop unused columns

```sql
-- These columns are defined but never read or written in the app
ALTER TABLE public.flight_members DROP COLUMN IF EXISTS connecting_flight_id;
ALTER TABLE public.flight_members DROP COLUMN IF EXISTS is_connecting;
```

#### 1c. Simplify client join query

**File:** `app/(tabs)/index.tsx:42`

```typescript
// BEFORE (brittle FK hint needed because of two FKs to flights)
.select("*, flights!flight_members_flight_id_fkey(*)")

// AFTER (only one FK remains, no ambiguity)
.select("*, flights(*)")
```

**Acceptance Criteria:**
- [ ] Migration-004 runs without errors in Supabase SQL Editor
- [ ] `get_my_flight_ids()` function no longer exists
- [ ] `flight_members` has no `connecting_flight_id` or `is_connecting` columns
- [ ] Flight list loads correctly with simplified join
- [ ] Flight room shows member count and status tags correctly

---

### Phase 2: Crash Fix + Security Hardening (P1 #2, P1 #3)

#### 2a. Add session guard in `addFlight`

**File:** `app/(tabs)/index.tsx` — top of `addFlight()` function

```typescript
async function addFlight() {
  if (!session) return;  // ADD THIS
  // ... rest of function, change session!.user.id to session.user.id
}
```

#### 2b. Add `SET search_path` to SECURITY DEFINER trigger functions

**File:** `supabase/migration-004-simplify.sql` (same migration)

```sql
-- Harden the two remaining SECURITY DEFINER functions from migration-002
CREATE OR REPLACE FUNCTION public.set_message_pseudonym()
RETURNS trigger AS $$
BEGIN
  NEW.pseudonym := (
    SELECT pseudonym FROM public.flight_members
    WHERE user_id = NEW.user_id AND flight_id = NEW.flight_id
    LIMIT 1
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

CREATE OR REPLACE FUNCTION public.set_airport_message_pseudonym()
RETURNS trigger AS $$
BEGIN
  NEW.pseudonym := (
    SELECT pseudonym FROM public.profiles
    WHERE id = NEW.user_id
    LIMIT 1
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;
```

**Acceptance Criteria:**
- [ ] `addFlight` has `if (!session) return;` guard, no `!` assertions
- [ ] Both trigger functions have `SET search_path = public`
- [ ] Chat messages still get correct pseudonyms from triggers

---

### Phase 3: Robustness Fixes (P2 #4, P2 #5, P2 #6)

#### 3a. Add error handling to profile loading

**File:** `app/_layout.tsx` — `loadProfile` function

```typescript
async function loadProfile(userId: string) {
  const { data: existing, error: fetchError } = await supabase
    .from("profiles").select("*").eq("id", userId).maybeSingle();

  if (fetchError) {
    console.error("Failed to load profile:", fetchError.message);
    return;
  }
  if (existing) { setProfile(existing); return; }

  const { data: created, error: createError } = await supabase
    .from("profiles")
    .insert({ id: userId, pseudonym: generatePseudonym() })
    .select().single();

  if (createError) {
    // Race condition: another call created it. Re-fetch.
    const { data: retry } = await supabase
      .from("profiles").select("*").eq("id", userId).single();
    if (retry) setProfile(retry);
    return;
  }
  if (created) setProfile(created);
}
```

#### 3b. Await `onSend` and handle failures in ChatRoom

**File:** `components/ChatRoom.tsx` — `handleSend` function

```typescript
async function handleSend() {
  if (!newMessage.trim()) return;
  const content = newMessage.trim();
  setNewMessage(""); // optimistic clear
  try {
    await onSend(content);
  } catch {
    setNewMessage(content); // restore on failure
    Alert.alert("Send failed", "Your message could not be sent. Please try again.");
  }
}
```

#### 3c. Document the "temp" pseudonym pattern

**Files:** `app/(tabs)/airport.tsx:76`, `app/flight/[id].tsx:143`, `app/flight/[id].tsx:167`

Add a one-line comment at each insert site:
```typescript
pseudonym: "temp", // overwritten by DB trigger (set_message_pseudonym)
```

Also change `updateStatusTag` to use `"temp"` for consistency:
```typescript
// BEFORE
pseudonym: myMembership.pseudonym,
// AFTER
pseudonym: "temp", // overwritten by DB trigger (set_message_pseudonym)
```

**Acceptance Criteria:**
- [ ] Profile loads correctly on first login and subsequent logins
- [ ] Failed sends restore the message text and show an alert
- [ ] All pseudonym inserts use "temp" with explanatory comments

---

### Phase 4: Code Quality (P3 #8-11)

#### 4a. Remove `any` casts in `loadFlights`

**File:** `app/(tabs)/index.tsx:53,67,68`

Let TypeScript infer types from the Supabase client instead of annotating with `any`.

#### 4b. Remove duplicate `renderSystemMessage`

**File:** `app/flight/[id].tsx:186-195`

Delete the custom `renderSystemMessage` callback and remove the prop from the ChatRoom usage — the default in ChatRoom is identical.

#### 4c. Add airport code validation

**File:** `app/(tabs)/airport.tsx` — `joinAirport` function

```typescript
function joinAirport() {
  const code = airportCode.trim().toUpperCase();
  if (!/^[A-Z]{3,4}$/.test(code)) return;
  // ...
}
```

**Acceptance Criteria:**
- [ ] No `any` annotations in `loadFlights`
- [ ] `renderSystemMessage` prop not passed to ChatRoom from flight room
- [ ] Airport code rejects non-alpha input

---

## Execution Notes

- **Phase 1 requires running SQL in Supabase Dashboard** before the client changes will work
- **Phases 2-4 are client-only** and can be tested immediately in Expo Go
- **Regenerate `database.types.ts`** after migration-004 runs (columns removed)
- **Total estimated changes:** ~1 new migration file, ~6 app files modified, net reduction in code

## References

- Review commit: `647ab13`
- Prior migrations: `supabase/migration.sql`, `supabase/migration-002-fixes.sql`, `supabase/migration-003-fix-recursion.sql`
- Supabase SECURITY DEFINER docs: search_path hardening is a PostgreSQL best practice
