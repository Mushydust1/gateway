// Supabase Edge Function: validate-flight
// Looks up a flight via FlightAware AeroAPI and returns flight details.
// Called from the app when a user adds a flight.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const FLIGHTAWARE_API_KEY = Deno.env.get("FLIGHTAWARE_API_KEY")!;
const AEROAPI_BASE = "https://aeroapi.flightaware.com/aeroapi";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { flight_number, flight_date } = await req.json();

    if (!flight_number || !flight_date) {
      return new Response(
        JSON.stringify({ error: "flight_number and flight_date are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // FlightAware expects ICAO or IATA flight ID (e.g., "UAL1234" or "UA1234")
    // and date as YYYY-MM-DD
    const url = `${AEROAPI_BASE}/flights/${flight_number}?start=${flight_date}T00:00:00Z&end=${flight_date}T23:59:59Z`;

    const response = await fetch(url, {
      headers: {
        "x-apikey": FLIGHTAWARE_API_KEY,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("FlightAware API error:", response.status, errorText);

      if (response.status === 404) {
        return new Response(
          JSON.stringify({ error: "Flight not found", found: false }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: "FlightAware API error" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const flights = data.flights || [];

    if (flights.length === 0) {
      return new Response(
        JSON.stringify({ found: false, error: "No flights found for this number and date" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Take the first matching flight
    const flight = flights[0];

    const result = {
      found: true,
      flight_number: flight_number.toUpperCase(),
      flight_date: flight_date,
      departure_airport: flight.origin?.code_iata || flight.origin?.code || "???",
      arrival_airport: flight.destination?.code_iata || flight.destination?.code || "???",
      scheduled_departure: flight.scheduled_out || flight.scheduled_off || null,
      scheduled_arrival: flight.scheduled_in || flight.scheduled_on || null,
      actual_departure: flight.actual_out || flight.actual_off || null,
      actual_arrival: flight.actual_in || flight.actual_on || null,
      status: mapFlightStatus(flight.status),
      delay_minutes: Math.max(0, Math.round((flight.departure_delay || 0) / 60)),
      gate: flight.gate_origin || null,
      flightaware_id: flight.fa_flight_id || null,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Edge function error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function mapFlightStatus(status: string): string {
  if (!status) return "scheduled";
  const s = status.toLowerCase();
  if (s.includes("scheduled") || s.includes("filed")) return "scheduled";
  if (s.includes("en route") || s.includes("airborne")) return "in_air";
  if (s.includes("landed") || s.includes("arrived")) return "landed";
  if (s.includes("cancelled") || s.includes("canceled")) return "cancelled";
  if (s.includes("delayed")) return "delayed";
  return "scheduled";
}
