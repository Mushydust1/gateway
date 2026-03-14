import { create } from "zustand";
import type { Session } from "@supabase/supabase-js";

interface Profile {
  id: string;
  pseudonym: string;
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
  delay_minutes: number;
  gate: string | null;
}

interface FlightMember {
  id: string;
  user_id: string;
  flight_id: string;
  pseudonym: string;
  status_tag: string;
  is_connecting: boolean;
  connecting_flight_id: string | null;
}

interface AppState {
  session: Session | null;
  profile: Profile | null;
  myFlights: Flight[];
  setSession: (session: Session | null) => void;
  setProfile: (profile: Profile | null) => void;
  setMyFlights: (flights: Flight[]) => void;
}

export const useStore = create<AppState>((set) => ({
  session: null,
  profile: null,
  myFlights: [],
  setSession: (session) => set({ session }),
  setProfile: (profile) => set({ profile }),
  setMyFlights: (flights) => set({ myFlights: flights }),
}));

export type { Flight, FlightMember, Profile };
