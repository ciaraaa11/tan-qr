import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";

import AcademicSelect from "@/components/AcademicSelect";
import { PROGRAMS, YEAR_LEVELS, BLOCKS } from "@/constants/academic";
import { COLORS } from "@/constants/colors";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

type Student = {
  id: string;
  full_name: string | null;
  email: string | null;
  program: string | null;
  year_level: string | null;
  block: string | null;
};

const yearDigit = (year: string) => String(YEAR_LEVELS.indexOf(year) + 1);

export default function TeacherStudentsScreen() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [program, setProgram] = useState("");
  const [year, setYear] = useState("");
  const [block, setBlock] = useState("");
  const [errorText, setErrorText] = useState("");

  const loadStudents = useCallback(
    async (refresh = false) => {
      if (!user?.id) {
        setLoading(false);
        return;
      }
      if (refresh) setRefreshing(true);
      else setLoading(true);
      setErrorText("");
      try {
        const { data: account, error: accountError } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();
        if (accountError) throw accountError;
        if (account?.role !== "teacher") {
          setErrorText(
            "Only teacher accounts can manage student academic information.",
          );
          setStudents([]);
          return;
        }

        // Fetch in pages instead of silently stopping after Supabase's default row limit.
        const all: Student[] = [];
        const pageSize = 500;
        for (let from = 0; ; from += pageSize) {
          const { data, error } = await supabase
            .from("profiles")
            .select("id,full_name,email,program,year_level,block")
            .eq("role", "student")
            .order("full_name", { ascending: true })
            .order("id", { ascending: true })
            .range(from, from + pageSize - 1);
          if (error) throw error;
          const page = (data ?? []) as Student[];
          all.push(...page);
          if (page.length < pageSize) break;
        }
        setStudents(all);
      } catch (error) {
        setErrorText(
          error instanceof Error ? error.message : "Unable to load students.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user?.id],
  );

  useFocusEffect(
    useCallback(() => {
      if (authLoading) return;
      if (!user) {
        router.replace("/login");
        return;
      }
      void loadStudents();
    }, [authLoading, user, loadStudents, router]),
  );

  const filteredStudents = useMemo(() => {
    const query = search.trim().toLowerCase();
    return students.filter(
      (student) =>
        !query ||
        [
          student.full_name,
          student.email,
          student.program,
          student.year_level,
          student.block,
        ].some((value) => (value ?? "").toLowerCase().includes(query)),
    );
  }, [students, search]);

  const incomplete = students.filter(
    (student) => !student.program || !student.year_level || !student.block,
  ).length;

  const openEditor = (student: Student) => {
    setEditing(student);
    setProgram(student.program ?? "");
    setYear(student.year_level ?? "");
    setBlock(student.block ?? "");
  };

  const save = async () => {
    if (!editing || saving) return;
    if (!program || !year || !block) {
      Alert.alert(
        "Incomplete information",
        "Select the Course, Year Level and Block.",
      );
      return;
    }
    if (!BLOCKS.includes(block) || !block.startsWith(yearDigit(year))) {
      Alert.alert(
        "Invalid block",
        "Choose a block matching the selected year level.",
      );
      return;
    }
    setSaving(true);
    try {
      // Security is enforced by the Step 26.1 SECURITY DEFINER RPC.
      // No direct profile UPDATE is issued by this screen.
      const { error } = await supabase.rpc("update_student_academics", {
        p_student_id: editing.id,
        p_program: program,
        p_year_level: year,
        p_block: block,
      });
      if (error) throw error;
      setEditing(null);
      await loadStudents(true);
      Alert.alert("Saved", "Student academic information has been updated.");
    } catch (error) {
      Alert.alert(
        "Save failed",
        error instanceof Error
          ? error.message
          : "Unable to update this student.",
      );
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.muted}>Loading students...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={styles.back}
        >
          <Ionicons name="arrow-back" size={22} color={COLORS.primary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Manage Students</Text>
          <Text style={styles.muted}>Update Course, Year Level and Block</Text>
        </View>
      </View>

      <View style={styles.summary}>
        <Text style={styles.summaryText}>
          {students.length} registered students
        </Text>
        <Text style={styles.muted}>
          {incomplete} incomplete academic profiles
        </Text>
      </View>

      <View style={styles.searchBox}>
        <Ionicons
          name="search-outline"
          size={20}
          color={COLORS.textSecondary}
        />
        <TextInput
          placeholder="Search name, email, program or block"
          placeholderTextColor={COLORS.textSecondary}
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
        />
        {!!search && (
          <Pressable
            onPress={() => setSearch("")}
            accessibilityLabel="Clear search"
          >
            <Ionicons
              name="close-circle"
              color={COLORS.textSecondary}
              size={20}
            />
          </Pressable>
        )}
      </View>

      {!!errorText && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{errorText}</Text>
          <Pressable onPress={() => void loadStudents(true)}>
            <Text style={styles.link}>Try again</Text>
          </Pressable>
        </View>
      )}

      <FlatList
        data={filteredStudents}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void loadStudents(true)}
            tintColor={COLORS.primary}
          />
        }
        ListEmptyComponent={
          <Text style={styles.empty}>No matching students found.</Text>
        }
        renderItem={({ item }) => {
          const missing = !item.program || !item.year_level || !item.block;
          return (
            <View style={styles.card}>
              <View style={styles.studentHeader}>
                <Ionicons
                  name="person-circle-outline"
                  size={37}
                  color={COLORS.primary}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>
                    {item.full_name || "Unnamed Student"}
                  </Text>
                  <Text style={styles.muted}>{item.email || "No email"}</Text>
                </View>
              </View>
              <Text style={styles.details}>
                Course: {item.program || "Not set"}
              </Text>
              <Text style={styles.details}>
                Year Level: {item.year_level || "Not set"}
              </Text>
              <Text style={styles.details}>
                Block: {item.block || "Not set"}
              </Text>
              {missing && (
                <Text style={styles.incomplete}>
                  Academic information incomplete
                </Text>
              )}
              <Pressable
                style={styles.editButton}
                onPress={() => openEditor(item)}
                accessibilityRole="button"
              >
                <Ionicons
                  name="create-outline"
                  size={18}
                  color={COLORS.textOnPrimary}
                />
                <Text style={styles.editText}>Edit Academic Info</Text>
              </Pressable>
            </View>
          );
        }}
      />

      <Modal
        visible={!!editing}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!saving) setEditing(null);
        }}
      >
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Edit Student Information</Text>
                <Text style={styles.muted}>
                  {editing?.full_name || editing?.email}
                </Text>
              </View>
              <Pressable
                disabled={saving}
                onPress={() => setEditing(null)}
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={24} color={COLORS.primary} />
              </Pressable>
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <AcademicSelect
                label="Course / Program *"
                value={program}
                placeholder="Select program"
                options={PROGRAMS}
                onChange={setProgram}
              />
              <AcademicSelect
                label="Year Level *"
                value={year}
                placeholder="Select year level"
                options={YEAR_LEVELS}
                onChange={(value) => {
                  setYear(value);
                  setBlock("");
                }}
              />
              <AcademicSelect
                label="Block *"
                value={block}
                placeholder={year ? "Select block" : "Select year level first"}
                disabled={!year}
                options={
                  year
                    ? BLOCKS.filter((value) =>
                        value.startsWith(yearDigit(year)),
                      )
                    : []
                }
                onChange={setBlock}
              />
              <Pressable
                disabled={saving}
                style={[styles.saveButton, saving && { opacity: 0.65 }]}
                onPress={() => void save()}
              >
                {saving ? (
                  <ActivityIndicator color={COLORS.textOnPrimary} />
                ) : (
                  <Text style={styles.saveText}>Save Changes</Text>
                )}
              </Pressable>
              <Pressable
                disabled={saving}
                style={styles.cancelButton}
                onPress={() => setEditing(null)}
              >
                <Text style={styles.muted}>Cancel</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: COLORS.background,
  },
  header: {
    backgroundColor: COLORS.card,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingTop: 45,
    paddingBottom: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
  },
  back: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: COLORS.background,
  },
  title: { fontSize: 20, fontWeight: "800", color: COLORS.primary },
  muted: { color: COLORS.textSecondary, fontSize: 12, marginTop: 3 },
  summary: {
    marginHorizontal: 18,
    marginTop: 17,
    marginBottom: 12,
    padding: 15,
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  summaryText: {
    color: COLORS.primary,
    fontWeight: "800",
    fontSize: 16,
    marginBottom: 3,
  },
  searchBox: {
    marginHorizontal: 18,
    marginBottom: 10,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  searchInput: { flex: 1, color: COLORS.textPrimary, height: 48, fontSize: 13 },
  list: { paddingHorizontal: 18, paddingBottom: 35, flexGrow: 1 },
  card: {
    padding: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    borderRadius: 15,
    marginBottom: 11,
  },
  studentHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginBottom: 11,
  },
  name: { color: COLORS.primary, fontSize: 15, fontWeight: "700" },
  details: { color: COLORS.textSecondary, fontSize: 12, marginTop: 5 },
  incomplete: {
    color: COLORS.danger,
    fontWeight: "700",
    fontSize: 12,
    marginTop: 10,
  },
  editButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: COLORS.primary,
    borderRadius: 11,
    paddingVertical: 12,
    marginTop: 14,
  },
  editText: { color: COLORS.textOnPrimary, fontWeight: "700", fontSize: 13 },
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(34,34,59,0.48)",
  },
  modalCard: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 21,
    maxHeight: "85%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 17,
    gap: 12,
  },
  modalTitle: { color: COLORS.primary, fontSize: 18, fontWeight: "800" },
  saveButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 50,
    marginTop: 18,
  },
  saveText: { fontWeight: "800", color: COLORS.textOnPrimary },
  cancelButton: { alignItems: "center", padding: 15, marginTop: 5 },
  empty: { textAlign: "center", color: COLORS.textSecondary, marginTop: 35 },
  errorBox: {
    backgroundColor: COLORS.card,
    borderColor: COLORS.border,
    borderWidth: 1,
    padding: 12,
    marginHorizontal: 18,
    marginBottom: 10,
    borderRadius: 10,
  },
  errorText: { color: COLORS.danger, fontSize: 12, marginBottom: 7 },
  link: { color: COLORS.primary, fontWeight: "800" },
});
