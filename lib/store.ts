import { create } from "zustand";
import type { Session } from "@supabase/supabase-js";

interface Profile {
  id: string;
  pseudonym: string | null;
}

interface Flight {
  id: string;
  flight_number: string;
  flight_date: string;
  departure_airport: string;
  arrival_airport: string;
  scheduled_departure: string | null;
  scheduled_arrival: string | null;
  actual_departure: string | null;
  actual_arrival: string | null;
  status: string;
  delay_minutes: number | null;
  gate: string | null;
}

interface FlightMember {
  id: string;
  user_id: string;
  flight_id: string;
  pseudonym: string;
  status_tag: string | null;
}

interface AppState {
  session: Session | null;
  profile: Profile | null;
  setSession: (session: Session | null) => void;
  setProfile: (profile: Profile | null) => void;
}

export const useStore = create<AppState>((set) => ({
  session: null,
  profile: null,
  setSession: (session) => set({ session }),
  setProfile: (profile) => set({ profile }),
}));

export type { Flight, FlightMember, Profile };
