import { Stack } from "expo-router";

export default function RootLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    >
      {/* Authentication */}
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />

      {/* Student and Teacher Tabs */}
      <Stack.Screen name="(tabs)" />

      {/* Teacher Manage Students */}
      <Stack.Screen name="teacher/students" />

      {/* Admin Dashboard */}
      <Stack.Screen name="admin" />
    </Stack>
  );
}
