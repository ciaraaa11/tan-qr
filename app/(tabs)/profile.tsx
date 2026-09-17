import { useCallback, useState } from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";

import AppButton from "@/components/AppButton";
import { COLORS } from "@/constants/colors";
import { useAuth, signOut } from "@/lib/auth";

export default function ProfileScreen() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<{
    full_name?: string;
    role?: "teacher" | "student";
  } | null>(null);
  const [draftName, setDraftName] = useState("");
  const [editing, setEditing] = useState(false);
  const router = useRouter();

  const loadProfile = useCallback(async () => {
    if (!user) {
      setProfile(null);
      setDraftName("");
      return;
    }

    setProfile({
      full_name: user.email?.split("@")[0] ?? "User",
      role: "student",
    });
    setDraftName(user.email?.split("@")[0] ?? "User");
  }, [user]);

  const handleSaveName = async () => {
    const trimmed = draftName.trim();
    if (!trimmed) {
      Alert.alert("Error", "Please enter a name.");
      return;
    }

    setProfile((current) => ({ ...(current ?? {}), full_name: trimmed }));
    setEditing(false);
  };

  const handleSignOut = async () => {
    setLoading(true);
    try {
      await signOut();
      router.replace("/login");
    } catch (err: any) {
      Alert.alert("Error", err?.message || "Failed to sign out.");
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      void loadProfile();
    }, [loadProfile]),
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>My Profile</Text>

      {user && (
        <View style={styles.infoCard}>
          <Text style={styles.label}>Email</Text>
          <Text style={styles.value}>{user.email}</Text>

          <Text style={styles.label}>User ID</Text>
          <Text style={styles.valueSmall}>{user.id}</Text>

          <Text style={styles.label}>Name</Text>

          {profile?.role === "teacher" ? (
            <View style={styles.roleBadge}>
              <Text style={styles.roleBadgeText}>Teacher</Text>
            </View>
          ) : (
            <View style={[styles.roleBadge, styles.roleBadgeStudent]}>
              <Text style={styles.roleBadgeText}>Student</Text>
            </View>
          )}

          {editing ? (
            <View style={styles.nameEditRow}>
              <TextInput
                value={draftName}
                onChangeText={setDraftName}
                style={styles.nameInput}
                placeholder="Your name"
              />
              <Pressable onPress={handleSaveName} style={styles.saveButton}>
                <Text style={styles.saveButtonText}>Save</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={() => setEditing(true)} style={styles.nameRow}>
              <Text style={styles.value}>
                {profile?.full_name || "Tap to add your name"}
              </Text>
              <Text style={styles.editHint}>Edit</Text>
            </Pressable>
          )}
        </View>
      )}

      <AppButton
        title="Sign Out"
        icon="log-out-outline"
        onPress={handleSignOut}
        disabled={loading}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
    color: COLORS.textPrimary,
    marginBottom: 16,
  },
  infoCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 24,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.textSecondary,
    marginBottom: 4,
    marginTop: 8,
  },
  value: {
    fontSize: 15,
    color: COLORS.textPrimary,
    fontWeight: "500",
  },
  valueSmall: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  roleBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#E3F2FD",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 8,
    marginBottom: 12,
  },
  roleBadgeStudent: {
    backgroundColor: "#E8F5E9",
  },
  roleBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.textPrimary,
  },
  nameRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
  nameEditRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  nameInput: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.textPrimary,
  },
  saveButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  saveButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
  editHint: {
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: "600",
  },
});
