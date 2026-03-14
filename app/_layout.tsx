import { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { supabase } from "../lib/supabase";
import { useStore } from "../lib/store";

export default function RootLayout() {
  const { session, setSession, setProfile } = useStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) loadProfile(session.user.id);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) loadProfile(session.user.id);
      else setProfile(null);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function loadProfile(userId: string) {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();
    if (data) setProfile(data);
  }

  if (loading) return null;

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "#0F172A" },
        }}
      >
        {session ? (
          <>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
              name="flight/[id]"
              options={{
                headerShown: true,
                headerStyle: { backgroundColor: "#1E293B" },
                headerTintColor: "#F8FAFC",
                headerTitle: "Flight Room",
                presentation: "card",
              }}
            />
          </>
        ) : (
          <Stack.Screen name="auth" />
        )}
      </Stack>
    </>
  );
}
