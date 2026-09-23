import { Stack, router } from "expo-router";
import { useEffect } from "react";

import { useAuth } from "@/lib/auth";

export default function RootLayout() {
  const { session, loading } = useAuth();

  useEffect(() => {
    console.log("========== ROOT AUTH ==========");
    console.log("ROOT LOADING:", loading);
    console.log("ROOT SESSION:", !!session);
    console.log("ROOT USER:", session?.user?.email ?? "NONE");
    console.log("===============================");

    if (loading) {
      return;
    }

    if (session) {
      console.log("ROOT: SESSION EXISTS");
      console.log("ROOT: GOING TO TABS");

      router.replace("/(tabs)");
    } else {
      console.log("ROOT: NO SESSION");
      console.log("ROOT: GOING TO LOGIN");

      router.replace("/login");
    }
  }, [session, loading]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}