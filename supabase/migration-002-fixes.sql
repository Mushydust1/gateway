-- Migration 002: Security fixes and constraints
-- ============================================================================

-- ============================================================================
-- FIX 1: Pseudonym spoofing — set pseudonym server-side via triggers
-- ============================================================================

-- Trigger for messages: set pseudonym from flight_members
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_set_message_pseudonym
  BEFORE INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.set_message_pseudonym();

-- Trigger for airport_messages: set pseudonym from profiles
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_set_airport_message_pseudonym
  BEFORE INSERT ON public.airport_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.set_airport_message_pseudonym();

-- ============================================================================
-- FIX 2: flight_members RLS — only co-passengers can see each other
-- ============================================================================

DROP POLICY "Flight members are readable" ON public.flight_members;

CREATE POLICY "Flight members visible to co-passengers" ON public.flight_members
  FOR SELECT USING (
    flight_id IN (SELECT flight_id FROM public.flight_members WHERE user_id = auth.uid())
  );

-- ============================================================================
-- FIX 3: Missing DB constraints
-- ============================================================================

-- Content length limits
ALTER TABLE public.messages
  ADD CONSTRAINT chk_messages_content_length CHECK (char_length(content) <= 2000);

ALTER TABLE public.airport_messages
  ADD CONSTRAINT chk_airport_messages_content_length CHECK (char_length(content) <= 2000);

-- Valid flight statuses
ALTER TABLE public.flights
  ADD CONSTRAINT chk_flights_status CHECK (
    status IN ('scheduled', 'on_time', 'delayed', 'in_air', 'landed', 'cancelled')
  );

-- Valid status tags for flight members
ALTER TABLE public.flight_members
  ADD CONSTRAINT chk_flight_members_status_tag CHECK (
    status_tag IN ('none', 'at_gate', 'on_plane', 'in_security', 'delayed', 'rebooking')
  );

-- DELETE policy so users can leave flights
CREATE POLICY "Users can leave flights"
  ON public.flight_members
  FOR DELETE USING (auth.uid() = user_id);

-- Composite index on flight_members(user_id, flight_id)
CREATE INDEX IF NOT EXISTS idx_flight_members_user_flight
  ON public.flight_members(user_id, flight_id);

-- Add flights table to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.flights;
