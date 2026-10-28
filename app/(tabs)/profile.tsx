import { useState, useCallback, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  Alert,
  TextInput,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";

import AppButton from "@/components/AppButton";
import { COLORS } from "@/constants/colors";
import { useAuth, signOut } from "@/lib/auth";
import { getProfile, updateProfile, type Profile } from "@/lib/profile";
import { supabase } from "@/lib/supabase";

type AcademicInfo = {
  program: string | null;
  year_level: string | null;
  block: string | null;
};

export default function ProfileScreen() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [academic, setAcademic] = useState<AcademicInfo | null>(null);
  const [draftName, setDraftName] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [authTimedOut, setAuthTimedOut] = useState(false);
  const [profileError, setProfileError] = useState("");

  // Avoid an endless spinner if authentication initialization hangs.
  useEffect(() => {
    if (!authLoading) {
      setAuthTimedOut(false);
      return;
    }
    const timeout = setTimeout(() => setAuthTimedOut(true), 12000);
    return () => clearTimeout(timeout);
  }, [authLoading]);

  // Fetch account and academic information; never wait forever on the network.
  const loadProfile = useCallback(async () => {
    if (!user) {
      setProfile(null);
      setAcademic(null);
      setDraftName("");
      setProfileError("");
      setLoading(false);
      setRefreshing(false);
      return;
    }

    setLoading(true);
    setProfileError("");
    try {
      const request = Promise.all([
        getProfile(user.id),
        supabase
          .from("profiles")
          .select("program, year_level, block")
          .eq("id", user.id)
          .maybeSingle(),
      ]);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const limit = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                "Profile request timed out. Check your internet connection and retry.",
              ),
            ),
          12000,
        );
      });
      let result: Awaited<typeof request>;
      try {
        result = await Promise.race([request, limit]);
      } finally {
        if (timer) clearTimeout(timer);
      }
      const [latestProfile, academicResult] = result;
      if (academicResult.error) throw academicResult.error;
      if (!latestProfile)
        throw new Error("Profile not found for this account.");

      setProfile(latestProfile);
      setAcademic((academicResult.data ?? null) as AcademicInfo | null);
      setDraftName(latestProfile.full_name ?? "");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to load your profile.";
      console.error("Profile loading error:", message);
      setProfile(null);
      setAcademic(null);
      setProfileError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      if (!authLoading) void loadProfile();
    }, [authLoading, loadProfile]),
  );

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    if (!authLoading) await loadProfile();
    else setRefreshing(false);
  };

  // Save the updated full name.
  const handleSaveName = async () => {
    if (!user) {
      Alert.alert("Error", "No signed-in user was found.");
      return;
    }

    const trimmedName = draftName.trim();

    if (!trimmedName) {
      Alert.alert("Invalid Name", "Please enter your name.");
      return;
    }

    if (trimmedName.length > 100) {
      Alert.alert("Invalid Name", "Your name must not exceed 100 characters.");
      return;
    }

    setSaving(true);

    try {
      const { error } = await updateProfile(user.id, {
        full_name: trimmedName,
      });

      if (error) {
        Alert.alert("Update Failed", error);
        return;
      }

      setProfile((previous) =>
        previous ? { ...previous, full_name: trimmedName } : previous,
      );

      setDraftName(trimmedName);
      setEditing(false);

      Alert.alert("Success", "Your name has been updated successfully.");
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to update your name.";

      Alert.alert("Error", message);
    } finally {
      setSaving(false);
    }
  };

  // Cancel editing and restore the saved name.
  const handleCancelEdit = () => {
    setDraftName(profile?.full_name ?? "");
    setEditing(false);
  };

  // Sign out and return to the login screen.
  const handleSignOut = async () => {
    if (loading || saving) return;

    setLoading(true);

    try {
      await signOut();
      router.replace("/login");
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to sign out.";

      Alert.alert("Sign Out Failed", message);
    } finally {
      setLoading(false);
    }
  };

  // Determine the displayed account role.
  const normalizedRole = profile?.role?.trim().toLowerCase();

  const roleLabel =
    normalizedRole === "administrator" || normalizedRole === "admin"
      ? "Administrator"
      : normalizedRole === "teacher"
        ? "Teacher"
        : normalizedRole === "student"
          ? "Student"
          : profile?.role || "Unknown Role";

  const roleBadgeStyle =
    normalizedRole === "administrator" || normalizedRole === "admin"
      ? styles.roleBadgeAdmin
      : normalizedRole === "teacher"
        ? styles.roleBadgeTeacher
        : styles.roleBadgeStudent;

  // Initial loading screen.
  if (
    (authLoading && !authTimedOut) ||
    (!authLoading && !!user && loading && !profile)
  ) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#246B67" />
        <Text style={styles.loadingText}>Loading profile...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#246B67"
          />
        }
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.title}>My Profile</Text>
            <Text style={styles.subtitle}>
              View and manage your account information.
            </Text>
          </View>

          <Pressable
            style={styles.refreshButton}
            onPress={handleRefresh}
            disabled={refreshing}
          >
            <Text style={styles.refreshButtonText}>
              {refreshing ? "Loading..." : "Refresh"}
            </Text>
          </Pressable>
        </View>

        {profile ? (
          <View style={styles.infoCard}>
            {/* Profile Avatar */}
            <View style={styles.profileIcon}>
              <Text style={styles.profileIconText}>
                {(profile.full_name || profile.email || "U")
                  .trim()
                  .charAt(0)
                  .toUpperCase()}
              </Text>
            </View>

            <Text style={styles.cardHeading}>Account Information</Text>

            {/* Account Role Badge */}
            <View style={[styles.roleBadge, roleBadgeStyle]}>
              <Text style={styles.roleBadgeText}>{roleLabel}</Text>
            </View>

            {/* Full Name */}
            <View style={styles.section}>
              <Text style={styles.label}>Full Name</Text>

              {editing ? (
                <>
                  <TextInput
                    style={styles.input}
                    value={draftName}
                    onChangeText={setDraftName}
                    placeholder="Enter your name"
                    placeholderTextColor={COLORS.textSecondary}
                    autoCapitalize="words"
                    autoCorrect={false}
                    editable={!saving}
                    maxLength={100}
                    returnKeyType="done"
                    onSubmitEditing={handleSaveName}
                  />

                  <View style={styles.editActions}>
                    <Pressable
                      style={[
                        styles.saveButton,
                        saving && styles.disabledButton,
                      ]}
                      onPress={handleSaveName}
                      disabled={saving}
                    >
                      {saving ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Text style={styles.saveButtonText}>Save Changes</Text>
                      )}
                    </Pressable>

                    <Pressable
                      style={styles.cancelButton}
                      onPress={handleCancelEdit}
                      disabled={saving}
                    >
                      <Text style={styles.cancelButtonText}>Cancel</Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                <View style={styles.nameRow}>
                  <Text style={styles.value}>
                    {profile.full_name || "No name added"}
                  </Text>

                  <Pressable
                    onPress={() => {
                      setDraftName(profile.full_name ?? "");
                      setEditing(true);
                    }}
                    style={styles.editButton}
                    accessibilityRole="button"
                    accessibilityLabel="Edit full name"
                  >
                    <Text style={styles.editButtonText}>Edit</Text>
                  </Pressable>
                </View>
              )}
            </View>

            {/* Email Address */}
            <View style={styles.section}>
              <Text style={styles.label}>Email Address</Text>
              <Text style={styles.value}>
                {profile.email || user?.email || "No email available"}
              </Text>
            </View>

            {/* Account Role */}
            <View style={styles.section}>
              <Text style={styles.label}>Account Role</Text>
              <Text style={styles.value}>{roleLabel}</Text>
            </View>

            {/* Student academic information, maintained by Admin / Teacher */}
            {normalizedRole === "student" && (
              <>
                <View style={styles.section}>
                  <Text style={styles.label}>Course / Program</Text>
                  <Text style={styles.value}>
                    {academic?.program || "Not assigned"}
                  </Text>
                </View>

                <View style={styles.academicRow}>
                  <View style={styles.academicColumn}>
                    <Text style={styles.label}>Year Level</Text>
                    <Text style={styles.value}>
                      {academic?.year_level || "Not assigned"}
                    </Text>
                  </View>
                  <View style={styles.academicColumn}>
                    <Text style={styles.label}>Block</Text>
                    <Text style={styles.value}>
                      {academic?.block || "Not assigned"}
                    </Text>
                  </View>
                </View>
              </>
            )}

            {/* User ID */}
            <View style={styles.section}>
              <Text style={styles.label}>User ID</Text>
              <Text selectable style={styles.valueSmall}>
                {profile.id}
              </Text>
            </View>

            <Text style={styles.refreshHint}>
              Pull down to refresh your profile and check for updated account
              information.
            </Text>
          </View>
        ) : (
          /* Profile Unavailable */
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>
              {user ? "Profile unavailable" : "You're not signed in"}
            </Text>

            <Text style={styles.emptyText}>
              {user
                ? profileError ||
                  "Your profile could not be loaded. Check your connection and try again."
                : authLoading
                  ? "Session check is taking longer than expected. Check your connection, then reopen the app."
                  : "Please sign in to view your account information."}
            </Text>

            {user && (
              <Pressable
                style={[styles.saveButton, refreshing && styles.disabledButton]}
                onPress={handleRefresh}
                disabled={refreshing}
              >
                <Text style={styles.saveButtonText}>
                  {refreshing ? "Loading..." : "Retry"}
                </Text>
              </Pressable>
            )}
          </View>
        )}

        {/* Show Sign In only to guests; Sign Out only to authenticated users. */}
        <View style={styles.signOutContainer}>
          {user ? (
            <AppButton
              title="Sign Out"
              icon="log-out-outline"
              onPress={handleSignOut}
              disabled={loading || saving}
            />
          ) : (
            <AppButton
              title="Sign In"
              icon="log-in-outline"
              onPress={() => router.push("/login")}
            />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 40,
    flexGrow: 1,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 12,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
    gap: 12,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: COLORS.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 6,
    maxWidth: 230,
    lineHeight: 19,
  },
  refreshButton: {
    backgroundColor: "#E3F1EE",
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 10,
  },
  refreshButtonText: {
    color: "#246B67",
    fontSize: 12,
    fontWeight: "700",
  },
  infoCard: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#E5ECE9",
  },
  profileIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#DDEFEA",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 14,
  },
  profileIconText: {
    color: "#246B67",
    fontSize: 25,
    fontWeight: "800",
  },
  cardHeading: {
    fontSize: 18,
    fontWeight: "800",
    color: COLORS.textPrimary,
    marginBottom: 14,
  },
  roleBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    marginBottom: 8,
  },
  roleBadgeAdmin: {
    backgroundColor: "#DDE8FF",
  },
  roleBadgeTeacher: {
    backgroundColor: "#FFF0C2",
  },
  roleBadgeStudent: {
    backgroundColor: "#DDF5E4",
  },
  roleBadgeText: {
    color: "#24413C",
    fontWeight: "800",
    fontSize: 12,
  },
  section: {
    marginTop: 20,
  },
  label: {
    fontSize: 11,
    fontWeight: "800",
    color: COLORS.textSecondary,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  value: {
    fontSize: 15,
    color: COLORS.textPrimary,
    fontWeight: "500",
    flexShrink: 1,
  },
  academicRow: {
    flexDirection: "row",
    gap: 18,
    marginTop: 20,
  },
  academicColumn: {
    flex: 1,
  },
  valueSmall: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  nameRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  editButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#EAF3F1",
    borderRadius: 9,
  },
  editButtonText: {
    color: "#246B67",
    fontSize: 12,
    fontWeight: "800",
  },
  input: {
    borderWidth: 1,
    borderColor: "#D7E3DF",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    color: COLORS.textPrimary,
    backgroundColor: "#FFFFFF",
  },
  editActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 12,
  },
  saveButton: {
    backgroundColor: "#246B67",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 42,
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
  disabledButton: {
    opacity: 0.6,
  },
  cancelButton: {
    backgroundColor: "#EDF1F0",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButtonText: {
    color: "#526563",
    fontSize: 12,
    fontWeight: "800",
  },
  refreshHint: {
    color: COLORS.textSecondary,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 22,
  },
  emptyCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 22,
    alignItems: "flex-start",
    marginBottom: 24,
  },
  emptyTitle: {
    color: COLORS.textPrimary,
    fontSize: 17,
    fontWeight: "800",
  },
  emptyText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
    marginBottom: 16,
  },
  signOutContainer: {
    marginTop: 4,
  },
});
