import { useEffect, useState } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View, ActivityIndicator } from "react-native";
import { supabase } from "../lib/supabase";
import { useStore } from "../lib/store";
import { generatePseudonym } from "../lib/pseudonyms";

export default function RootLayout() {
  const { session, setSession, setProfile } = useStore();
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const segments = useSegments();

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

  // Handle auth-based navigation
  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === "auth";

    if (!session && !inAuthGroup) {
      router.replace("/auth");
    } else if (session && inAuthGroup) {
      router.replace("/");
    }
  }, [session, segments, loading]);

  async function loadProfile(userId: string) {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (data) {
      setProfile(data);
    } else {
      // Profile doesn't exist yet — create one
      const pseudonym = generatePseudonym();
      const { data: newProfile } = await supabase
        .from("profiles")
        .insert({ id: userId, pseudonym })
        .select()
        .single();
      if (newProfile) setProfile(newProfile);
    }
  }

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "#0F172A",
        }}
      >
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "#0F172A" },
        }}
      >
        <Stack.Screen name="auth" />
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
      </Stack>
    </>
  );
}
