-- Migration 004: Simplify flight_members — remove YAGNI columns and over-engineered RLS
-- ============================================================================

-- ============================================================================
-- 1. Revert flight_members RLS to simple public-read
--    The co-passenger restriction (migration-002) protected non-sensitive data
--    (UUIDs + pseudonyms) and caused infinite recursion, which required a
--    SECURITY DEFINER function (migration-003) to fix. Reverting both.
-- ============================================================================

DROP POLICY IF EXISTS "Flight members visible to co-passengers" ON public.flight_members;

CREATE POLICY "Flight members are readable"
  ON public.flight_members FOR SELECT USING (true);

-- Drop the function that only existed to fix the recursion
DROP FUNCTION IF EXISTS public.get_my_flight_ids();

-- ============================================================================
-- 2. Drop unused columns that cause FK ambiguity
--    connecting_flight_id and is_connecting are never read or written by the app.
--    The second FK to flights forces a brittle explicit FK hint in client queries.
-- ============================================================================

ALTER TABLE public.flight_members DROP COLUMN IF EXISTS connecting_flight_id;
ALTER TABLE public.flight_members DROP COLUMN IF EXISTS is_connecting;

-- ============================================================================
-- 3. Harden existing SECURITY DEFINER trigger functions with SET search_path
--    (PostgreSQL best practice for any SECURITY DEFINER function)
-- ============================================================================

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
