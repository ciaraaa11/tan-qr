import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  ScrollView,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { useAuth, signOut } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { COLORS } from "@/constants/colors";
import { AuthDecor } from "@/components/AuthDecor";
import AcademicSelect from "@/components/AcademicSelect";
import { PROGRAMS, YEAR_LEVELS, BLOCKS } from "@/constants/academic";

type UserRole = "student" | "teacher" | "administrator";

type UserProfile = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: UserRole;
  program: string | null;
  year_level: string | null;
  block: string | null;
};

const C = {
  primary: COLORS.primary,
  background: COLORS.background,
  card: COLORS.card,
  surface: COLORS.surface,
  border: COLORS.border,
  text: COLORS.textPrimary,
  secondary: COLORS.textSecondary,
  danger: COLORS.danger,
  teacherBadge: "#F2E9E4",
  adminBadge: "#E8E1E9",
};

type UserFilter = "all" | UserRole;
const FILTERS: { label: string; value: UserFilter }[] = [
  { label: "All", value: "all" },
  { label: "Students", value: "student" },
  { label: "Teachers", value: "teacher" },
  { label: "Admins", value: "administrator" },
];

const ROLES: UserRole[] = ["student", "teacher"];

export default function AdminUsersScreen() {
  const router = useRouter();
  const { role } = useLocalSearchParams<{ role?: string }>();
  const roleFilter: UserFilter =
    role === "student" || role === "teacher" || role === "administrator"
      ? role
      : "all";
  const filterTitle =
    roleFilter === "student"
      ? "Students"
      : roleFilter === "teacher"
        ? "Teachers"
        : roleFilter === "administrator"
          ? "Administrators"
          : "All Users";
  const { user, loading: authLoading } = useAuth();

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [search, setSearch] = useState("");
  const [pageLoading, setPageLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editingStudent, setEditingStudent] = useState<UserProfile | null>(
    null,
  );
  const [academicProgram, setAcademicProgram] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [academicBlock, setAcademicBlock] = useState("");
  const [savingAcademic, setSavingAcademic] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [creating, setCreating] = useState(false);

  const loadUsers = useCallback(async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, full_name, role, program, year_level, block")
      .order("full_name", { ascending: true });

    if (error) {
      console.error("Load users error:", error.message);
      throw error;
    }

    setUsers((data ?? []) as UserProfile[]);
  }, []);

  const initialize = useCallback(async () => {
    if (!user?.id) {
      router.replace("/login");
      setPageLoading(false);
      return;
    }

    setPageLoading(true);

    try {
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (error) throw error;

      if (profile?.role !== "administrator") {
        router.replace("/(tabs)");
        return;
      }

      await loadUsers();
    } catch (error) {
      console.error("Admin users initialization error:", error);
      Alert.alert(
        "Error",
        "Unable to load users. Check your connection and database permissions.",
      );
    } finally {
      setPageLoading(false);
    }
  }, [user?.id, router, loadUsers]);

  useFocusEffect(
    useCallback(() => {
      if (!authLoading) {
        void initialize();
      }
    }, [authLoading, initialize]),
  );

  const onRefresh = async () => {
    setRefreshing(true);

    try {
      await loadUsers();
    } catch {
      Alert.alert("Error", "Could not refresh the user list.");
    } finally {
      setRefreshing(false);
    }
  };

  const handleCreateTeacher = async () => {
    const name = fullName.trim();
    const teacherEmail = email.trim().toLowerCase();

    if (!name || !teacherEmail || !password) {
      Alert.alert("Missing Information", "Please complete all fields.");
      return;
    }

    if (password.length < 8) {
      Alert.alert(
        "Invalid Password",
        "The password must contain at least 8 characters.",
      );
      return;
    }

    setCreating(true);

    try {
      const { data, error } = await supabase.functions.invoke(
        "admin-create-teacher",
        {
          body: {
            full_name: name,
            email: teacherEmail,
            password,
          },
        },
      );

      if (error) {
        console.error("Create teacher function error:", error.message);
        throw new Error(
          "Could not create the teacher account. Confirm that the Edge Function is deployed, then check its logs.",
        );
      }

      if (data?.error) {
        throw new Error(String(data.error));
      }

      if (!data?.user?.id) {
        throw new Error(
          "The server did not confirm that the account was created.",
        );
      }

      setFullName("");
      setEmail("");
      setPassword("");
      setShowForm(false);

      await loadUsers();

      Alert.alert(
        "Teacher Created",
        `The account was created successfully.\n\nName: ${name}\nEmail: ${teacherEmail}\nRole: Teacher`,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "An unexpected error occurred.";

      Alert.alert("Could Not Create Teacher", message);
    } finally {
      setCreating(false);
    }
  };

  const updateUserRole = async (userId: string, role: UserRole) => {
    if (userId === user?.id) {
      Alert.alert("Not Allowed", "You cannot change your own role.");
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke(
        "admin-update-role",
        {
          body: {
            user_id: userId,
            role,
          },
        },
      );

      if (error) {
        throw new Error(error.message);
      }

      if (data?.error) {
        throw new Error(String(data.error));
      }

      if (!data?.user?.id) {
        throw new Error("The server did not confirm the role update.");
      }

      await loadUsers();

      Alert.alert("Success", `User role changed to ${role}.`);
    } catch (error) {
      console.error("Update role error:", error);

      Alert.alert(
        "Update Failed",
        error instanceof Error ? error.message : "Unable to update user role.",
      );
    }
  };

  const handleChangeRole = (item: UserProfile) => {
    if (item.role === "administrator") {
      Alert.alert(
        "Not Allowed",
        "Administrator accounts cannot be modified here.",
      );
      return;
    }

    Alert.alert(
      "Change User Role",
      `Choose a role for ${item.full_name || item.email || "this user"}.`,
      [
        { text: "Cancel", style: "cancel" },
        ...ROLES.filter((role) => role !== item.role).map((role) => ({
          text: role.charAt(0).toUpperCase() + role.slice(1),
          onPress: () => {
            void updateUserRole(item.id, role);
          },
        })),
      ],
    );
  };

  const openAcademicEditor = (student: UserProfile) => {
    if (student.role !== "student") return;
    setEditingStudent(student);
    setAcademicProgram(student.program ?? "");
    setAcademicYear(student.year_level ?? "");
    setAcademicBlock(student.block ?? "");
  };

  const saveAcademicInfo = async () => {
    if (!editingStudent || savingAcademic) return;
    if (!academicProgram || !academicYear || !academicBlock) {
      Alert.alert(
        "Missing information",
        "Select a program, year level and block.",
      );
      return;
    }
    if (
      !academicBlock.startsWith(String(YEAR_LEVELS.indexOf(academicYear) + 1))
    ) {
      Alert.alert(
        "Invalid block",
        "The block must match the selected year level.",
      );
      return;
    }
    setSavingAcademic(true);
    try {
      const { error } = await supabase.rpc("update_student_academics", {
        p_student_id: editingStudent.id,
        p_program: academicProgram,
        p_year_level: academicYear,
        p_block: academicBlock,
      });
      if (error) throw error;
      await loadUsers();
      setEditingStudent(null);
      Alert.alert("Saved", "Student academic information updated.");
    } catch (error) {
      Alert.alert(
        "Update failed",
        error instanceof Error
          ? error.message
          : "Could not update student information.",
      );
    } finally {
      setSavingAcademic(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          const result = await signOut();

          if (result.error) {
            Alert.alert("Error", "Unable to sign out.");
            return;
          }

          router.replace("/login");
        },
      },
    ]);
  };

  const roleUsers = users.filter(
    (item) => roleFilter === "all" || item.role === roleFilter,
  );
  const filteredUsers = roleUsers.filter((item) => {
    const query = search.trim().toLowerCase();

    return (
      !query ||
      (item.full_name ?? "").toLowerCase().includes(query) ||
      (item.email ?? "").toLowerCase().includes(query) ||
      item.role.toLowerCase().includes(query) ||
      (item.program ?? "").toLowerCase().includes(query) ||
      (item.year_level ?? "").toLowerCase().includes(query) ||
      (item.block ?? "").toLowerCase().includes(query)
    );
  });

  if (authLoading || pageLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={C.primary} />
        <Text style={styles.loadingText}>Loading users...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <AuthDecor />
      <FlatList
        data={filteredUsers}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor={C.primary}
          />
        }
        ListHeaderComponent={
          <View>
            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text style={styles.eyebrow}>ADMINISTRATION</Text>
                <Text style={styles.title}>{filterTitle}</Text>
                <Text style={styles.subtitle}>
                  Manage accounts by role, or browse everyone.
                </Text>
              </View>

              <Pressable
                onPress={handleSignOut}
                style={styles.iconButton}
                accessibilityRole="button"
                accessibilityLabel="Sign out"
              >
                <Ionicons name="log-out-outline" size={22} color={C.primary} />
              </Pressable>
            </View>

            <View style={styles.summaryCard}>
              <View style={styles.summaryIcon}>
                <Ionicons name="people-outline" size={26} color={C.primary} />
              </View>
              <View>
                <Text style={styles.summaryNumber}>{roleUsers.length}</Text>
                <Text style={styles.summaryLabel}>
                  {roleFilter === "all"
                    ? "Registered users"
                    : `Registered ${filterTitle.toLowerCase()}`}
                </Text>
              </View>
            </View>

            <View style={styles.filterTabs}>
              {FILTERS.map((filter) => (
                <Pressable
                  key={filter.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected: roleFilter === filter.value }}
                  onPress={() => {
                    setSearch("");
                    router.setParams({ role: filter.value });
                  }}
                  style={[
                    styles.filterTab,
                    roleFilter === filter.value && styles.filterTabActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.filterTabText,
                      roleFilter === filter.value && styles.filterTabTextActive,
                    ]}
                  >
                    {filter.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              style={styles.addButton}
              onPress={() => setShowForm((current) => !current)}
              accessibilityRole="button"
            >
              <Ionicons
                name={showForm ? "close-circle-outline" : "person-add-outline"}
                size={21}
                color={COLORS.textOnPrimary}
              />
              <Text style={styles.addButtonText}>
                {showForm ? "Cancel" : "Add Teacher"}
              </Text>
            </Pressable>

            {showForm && (
              <View style={styles.formCard}>
                <Text style={styles.formTitle}>Create Teacher Account</Text>
                <Text style={styles.formSubtitle}>
                  The new account will automatically receive the Teacher role.
                </Text>

                <Text style={styles.label}>Full Name</Text>
                <TextInput
                  style={styles.input}
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="Enter full name"
                  placeholderTextColor={C.secondary}
                  autoCapitalize="words"
                  editable={!creating}
                />

                <Text style={styles.label}>Email Address</Text>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="teacher@example.com"
                  placeholderTextColor={C.secondary}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!creating}
                />

                <Text style={styles.label}>Temporary Password</Text>
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="At least 8 characters"
                  placeholderTextColor={C.secondary}
                  secureTextEntry
                  autoCapitalize="none"
                  editable={!creating}
                />

                <Pressable
                  style={[
                    styles.submitButton,
                    creating && styles.disabledButton,
                  ]}
                  onPress={() => void handleCreateTeacher()}
                  disabled={creating}
                  accessibilityRole="button"
                >
                  {creating ? (
                    <ActivityIndicator color={COLORS.textOnPrimary} />
                  ) : (
                    <>
                      <Ionicons
                        name="checkmark-circle-outline"
                        size={20}
                        color={COLORS.textOnPrimary}
                      />
                      <Text style={styles.submitText}>
                        Create Teacher Account
                      </Text>
                    </>
                  )}
                </Pressable>
              </View>
            )}

            <Text style={styles.sectionTitle}>
              {filterTitle} ({roleUsers.length})
            </Text>

            <View style={styles.searchBox}>
              <Ionicons name="search-outline" size={20} color={C.secondary} />
              <TextInput
                style={styles.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder="Search name, email, or role"
                placeholderTextColor={C.secondary}
                autoCapitalize="none"
              />
              {search.length > 0 && (
                <Pressable onPress={() => setSearch("")}>
                  <Ionicons name="close-circle" size={19} color={C.secondary} />
                </Pressable>
              )}
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.userCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {(item.full_name || item.email || "?").charAt(0).toUpperCase()}
              </Text>
            </View>

            <View style={styles.userInfo}>
              <Text style={styles.userName} numberOfLines={1}>
                {item.full_name || "Unnamed User"}
              </Text>
              <Text style={styles.userEmail} numberOfLines={1}>
                {item.email || "No email"}
              </Text>

              <View
                style={[
                  styles.roleBadge,
                  item.role === "administrator" && styles.adminBadge,
                  item.role === "teacher" && styles.teacherBadge,
                ]}
              >
                <Text style={styles.roleText}>
                  {item.role.charAt(0).toUpperCase() + item.role.slice(1)}
                </Text>
              </View>
              {item.role === "student" && (
                <View style={styles.studentAcademicArea}>
                  <Text style={styles.academicSummary} numberOfLines={2}>
                    {item.program && item.year_level && item.block
                      ? `${item.program} • ${item.year_level} • ${item.block}`
                      : "Academic information incomplete"}
                  </Text>
                  <Pressable
                    style={styles.academicEditButton}
                    onPress={() => openAcademicEditor(item)}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit academic information for ${item.full_name || "student"}`}
                  >
                    <Ionicons
                      name="school-outline"
                      size={15}
                      color={C.primary}
                    />
                    <Text style={styles.academicEditLabel}>
                      Edit Academic Info
                    </Text>
                  </Pressable>
                </View>
              )}
            </View>

            <Pressable
              style={styles.roleButton}
              onPress={() => handleChangeRole(item)}
              accessibilityRole="button"
              accessibilityLabel={`Change role for ${item.full_name || item.email || "user"}`}
            >
              <Ionicons
                name="ellipsis-horizontal"
                size={22}
                color={C.primary}
              />
            </Pressable>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={36} color={C.secondary} />
            <Text style={styles.emptyTitle}>No users found</Text>
            <Text style={styles.emptySubtitle}>
              No matching accounts. Try another search or filter.
            </Text>
          </View>
        }
      />
      <Modal
        visible={editingStudent !== null}
        animationType="slide"
        transparent
        onRequestClose={() => !savingAcademic && setEditingStudent(null)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.modalCard}>
            <View style={styles.academicModalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.formTitle}>Edit Student Academic Info</Text>
                <Text style={styles.formSubtitle}>
                  {editingStudent?.full_name ||
                    editingStudent?.email ||
                    "Student"}
                </Text>
              </View>
              <Pressable
                onPress={() => setEditingStudent(null)}
                disabled={savingAcademic}
                accessibilityLabel="Close editor"
              >
                <Ionicons name="close" size={24} color={C.primary} />
              </Pressable>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              <AcademicSelect
                label="Course / Program *"
                value={academicProgram}
                placeholder="Select program"
                options={PROGRAMS}
                onChange={setAcademicProgram}
              />
              <AcademicSelect
                label="Year Level *"
                value={academicYear}
                placeholder="Select year"
                options={YEAR_LEVELS}
                onChange={(value) => {
                  setAcademicYear(value);
                  setAcademicBlock("");
                }}
              />
              <AcademicSelect
                label="Block *"
                value={academicBlock}
                placeholder={
                  academicYear ? "Select block" : "Select year first"
                }
                disabled={!academicYear}
                options={
                  academicYear
                    ? BLOCKS.filter((value) =>
                        value.startsWith(
                          String(YEAR_LEVELS.indexOf(academicYear) + 1),
                        ),
                      )
                    : []
                }
                onChange={setAcademicBlock}
              />
              <Pressable
                style={[
                  styles.submitButton,
                  savingAcademic && styles.disabledButton,
                ]}
                onPress={() => void saveAcademicInfo()}
                disabled={savingAcademic}
              >
                {savingAcademic ? (
                  <ActivityIndicator color={COLORS.textOnPrimary} />
                ) : (
                  <Text style={styles.submitText}>
                    Save Academic Information
                  </Text>
                )}
              </Pressable>
              <Pressable
                style={styles.cancelAcademicButton}
                onPress={() => setEditingStudent(null)}
                disabled={savingAcademic}
              >
                <Text style={styles.cancelAcademicText}>Cancel</Text>
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.background,
  },
  listContent: {
    padding: 20,
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.background,
  },
  loadingText: {
    marginTop: 12,
    color: C.text,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  headerText: {
    flex: 1,
    paddingRight: 12,
  },
  eyebrow: {
    color: C.primary,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginBottom: 5,
  },
  title: {
    color: C.text,
    fontSize: 28,
    fontWeight: "800",
  },
  subtitle: {
    color: C.secondary,
    fontSize: 13,
    marginTop: 5,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 18,
    backgroundColor: C.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 14,
  },
  summaryIcon: {
    width: 52,
    height: 52,
    borderRadius: 17,
    backgroundColor: C.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryNumber: {
    color: C.text,
    fontSize: 25,
    fontWeight: "800",
  },
  summaryLabel: {
    color: C.secondary,
    fontSize: 12,
    marginTop: 2,
  },
  filterTabs: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  filterTab: {
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
  },
  filterTabActive: {
    backgroundColor: C.primary,
    borderColor: C.primary,
  },
  filterTabText: {
    color: C.secondary,
    fontSize: 12,
    fontWeight: "700",
  },
  filterTabTextActive: {
    color: COLORS.textOnPrimary,
  },
  addButton: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 9,
    backgroundColor: C.primary,
    paddingVertical: 15,
    borderRadius: 16,
    marginBottom: 16,
  },
  addButtonText: {
    color: COLORS.textOnPrimary,
    fontSize: 15,
    fontWeight: "700",
  },
  formCard: {
    backgroundColor: C.card,
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 24,
  },
  formTitle: {
    color: C.text,
    fontSize: 19,
    fontWeight: "800",
  },
  formSubtitle: {
    color: C.secondary,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
    marginBottom: 12,
  },
  label: {
    color: C.text,
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 7,
    marginTop: 12,
  },
  input: {
    minHeight: 49,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 13,
    backgroundColor: C.card,
    color: C.text,
    paddingHorizontal: 13,
    fontSize: 14,
  },
  submitButton: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    borderRadius: 14,
    backgroundColor: C.primary,
    marginTop: 22,
  },
  disabledButton: {
    opacity: 0.65,
  },
  submitText: {
    color: COLORS.textOnPrimary,
    fontSize: 14,
    fontWeight: "700",
  },
  sectionTitle: {
    color: C.text,
    fontSize: 19,
    fontWeight: "800",
    marginBottom: 12,
  },
  searchBox: {
    minHeight: 49,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 13,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 15,
    marginBottom: 14,
  },
  searchInput: {
    flex: 1,
    minHeight: 45,
    color: C.text,
    fontSize: 13,
  },
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    padding: 13,
    marginBottom: 10,
  },
  avatar: {
    width: 45,
    height: 45,
    borderRadius: 16,
    backgroundColor: C.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: C.primary,
    fontSize: 19,
    fontWeight: "800",
  },
  userInfo: {
    flex: 1,
    minWidth: 0,
    marginLeft: 12,
  },
  userName: {
    color: C.text,
    fontSize: 14,
    fontWeight: "700",
  },
  userEmail: {
    color: C.secondary,
    fontSize: 11,
    marginTop: 4,
  },
  roleBadge: {
    alignSelf: "flex-start",
    backgroundColor: C.background,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 4,
    marginTop: 7,
  },
  adminBadge: {
    backgroundColor: C.adminBadge,
  },
  teacherBadge: {
    backgroundColor: C.teacherBadge,
  },
  roleText: {
    color: C.text,
    fontSize: 10,
    fontWeight: "700",
  },
  roleButton: {
    width: 36,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 5,
  },
  studentAcademicArea: { marginTop: 8, gap: 7 },
  academicSummary: { color: C.secondary, fontSize: 11, lineHeight: 16 },
  academicEditButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.background,
  },
  academicEditLabel: { color: C.primary, fontWeight: "700", fontSize: 11 },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(34,34,59,0.5)",
  },
  modalCard: {
    backgroundColor: C.card,
    borderTopLeftRadius: 23,
    borderTopRightRadius: 23,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 25,
    maxHeight: "88%",
  },
  academicModalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  cancelAcademicButton: { alignItems: "center", paddingVertical: 16 },
  cancelAcademicText: { color: C.secondary, fontWeight: "700", fontSize: 13 },
  emptyState: {
    alignItems: "center",
    paddingVertical: 35,
  },
  emptyTitle: {
    color: C.text,
    fontSize: 16,
    fontWeight: "700",
    marginTop: 12,
  },
  emptySubtitle: {
    color: C.secondary,
    fontSize: 12,
    textAlign: "center",
    marginTop: 5,
  },
});
