import { useEffect, useState } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View, ActivityIndicator } from "react-native";
import { supabase } from "../lib/supabase";
import { useStore } from "../lib/store";
import { generatePseudonym } from "../lib/pseudonyms";
import { colors } from "../lib/theme";

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
    const pseudonym = generatePseudonym();
    const { data } = await supabase
      .from("profiles")
      .upsert({ id: userId, pseudonym }, { onConflict: "id", ignoreDuplicates: true })
      .select()
      .single();

    if (data) setProfile(data);
  }

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: colors.slate900,
        }}
      >
        <ActivityIndicator size="large" color={colors.blue500} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.slate900 },
        }}
      >
        <Stack.Screen name="auth" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="flight/[id]"
          options={{
            headerShown: true,
            headerStyle: { backgroundColor: colors.slate800 },
            headerTintColor: colors.slate50,
            headerTitle: "Flight Room",
            presentation: "card",
          }}
        />
      </Stack>
    </>
  );
}
