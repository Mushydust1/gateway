-- Migration 003: Fix infinite recursion in flight_members RLS policy
-- ============================================================================
-- The policy "Flight members visible to co-passengers" references
-- flight_members in its own SELECT policy, causing infinite recursion.
-- Fix: use a SECURITY DEFINER function to bypass RLS for the subquery.
-- ============================================================================

-- Step 1: Create a function that returns the user's flight IDs without RLS
CREATE OR REPLACE FUNCTION public.get_my_flight_ids()
RETURNS SETOF uuid AS $$
  SELECT flight_id FROM public.flight_members WHERE user_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Step 2: Drop the recursive policy
DROP POLICY IF EXISTS "Flight members visible to co-passengers" ON public.flight_members;

-- Step 3: Create a non-recursive replacement
-- Users can see their own memberships OR memberships of co-passengers
CREATE POLICY "Flight members visible to co-passengers" ON public.flight_members
  FOR SELECT USING (
    user_id = auth.uid() OR flight_id IN (SELECT public.get_my_flight_ids())
  );
