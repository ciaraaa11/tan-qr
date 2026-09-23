import { Redirect, Stack } from "expo-router";

import { useAuth } from "@/lib/auth";

export default function RootLayout() {
  const { session } = useAuth();

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="login" />
        <Stack.Screen name="register" />
        <Stack.Screen name="(tabs)" />
      </Stack>

      {session ? (
        <Redirect href="/(tabs)" />
      ) : (
        <Redirect href="/login" />
      )}
    </>
  );
}