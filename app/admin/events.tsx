import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";

import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { COLORS as THEME } from "@/constants/colors";
import { AuthDecor } from "@/components/AuthDecor";
import QRCode from "react-native-qrcode-svg";
import AcademicSelect from "@/components/AcademicSelect";
import { PROGRAMS, YEAR_LEVELS, BLOCKS } from "@/constants/academic";

type EventRecord = {
  id: string;
  event_code: string;
  title: string;
  start_time: string;
  end_time: string;
  created_by: string | null;
  created_at: string;
  attendance_purpose: string | null;
  program: string | null;
  year_level: string | null;
  block: string | null;
  late_mode: "minutes" | "exact" | null;
  late_minutes: number | null;
  late_cutoff_time: string | null;
};

type EventForm = {
  title: string;
  event_code: string;
  start_time: string;
  end_time: string;
  attendance_purpose: string;
  program: string;
  year_level: string;
  block: string;
  late_mode: "minutes" | "exact";
  late_minutes: string;
  late_cutoff_time: string;
};

const LATE_MINUTE_OPTIONS = [0, 5, 10, 15, 20, 30, 60];

const EMPTY_FORM: EventForm = {
  title: "",
  event_code: "",
  start_time: "",
  end_time: "",
  attendance_purpose: "",
  program: "",
  year_level: "",
  block: "",
  late_mode: "minutes",
  late_minutes: "15",
  late_cutoff_time: "",
};

// Derived from the shared TAN-QR palette; existing field names are retained.
const COLORS = {
  primary: THEME.primary,
  primaryLight: THEME.surface,
  background: THEME.background,
  white: THEME.card,
  text: THEME.textPrimary,
  muted: THEME.textSecondary,
  border: THEME.border,
  danger: THEME.danger,
  dangerLight: THEME.background,
  success: THEME.success,
};

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Converts a local date/time into the ISO timestamp Supabase expects.
function toTimestamp(value: string): string | null {
  const normalized = value.trim().replace(" ", "T");
  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

// Displays a timestamp in local time for editing.
function toLocalInput(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const pad = (number: number) => String(number).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function AdminEventsScreen() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [events, setEvents] = useState<EventRecord[]>([]);
  const [search, setSearch] = useState("");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [modalVisible, setModalVisible] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventRecord | null>(null);
  const [form, setForm] = useState<EventForm>(EMPTY_FORM);

  const updateField = (field: keyof EventForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const loadEvents = useCallback(
    async (isRefresh = false) => {
      if (!user?.id) {
        if (!authLoading) {
          router.replace("/login");
        }
        setPageLoading(false);
        return;
      }

      if (isRefresh) {
        setRefreshing(true);
      } else {
        setPageLoading(true);
      }

      try {
        // Confirm that the current user is an administrator.
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();

        if (profileError) {
          throw profileError;
        }

        if (profile?.role !== "administrator") {
          Alert.alert(
            "Access denied",
            "Only administrators can manage events.",
            [{ text: "OK", onPress: () => router.replace("/(tabs)") }],
          );
          setEvents([]);
          return;
        }

        const { data, error } = await supabase
          .from("events")
          .select(
            "id, event_code, title, start_time, end_time, created_by, created_at, attendance_purpose, program, year_level, block, late_mode, late_minutes, late_cutoff_time",
          )
          .order("start_time", { ascending: true });

        if (error) {
          throw error;
        }

        setEvents((data ?? []) as EventRecord[]);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to load events.";

        Alert.alert("Error", message);
      } finally {
        setPageLoading(false);
        setRefreshing(false);
      }
    },
    [user?.id, authLoading, router],
  );

  useFocusEffect(
    useCallback(() => {
      if (!authLoading) {
        void loadEvents();
      }
    }, [authLoading, loadEvents]),
  );

  const openCreateModal = () => {
    setEditingEvent(null);
    setForm(EMPTY_FORM);
    setModalVisible(true);
  };

  const openEditModal = (event: EventRecord) => {
    setEditingEvent(event);
    setForm({
      title: event.title,
      event_code: event.event_code,
      start_time: toLocalInput(event.start_time),
      end_time: toLocalInput(event.end_time),
      attendance_purpose: event.attendance_purpose ?? "",
      program: event.program ?? "",
      year_level: event.year_level ?? "",
      block: event.block ?? "",
      late_mode: event.late_mode === "exact" ? "exact" : "minutes",
      late_minutes: String(event.late_minutes ?? 15),
      late_cutoff_time: event.late_cutoff_time ?? "",
    });
    setModalVisible(true);
  };

  const saveEvent = async () => {
    if (!user?.id) {
      Alert.alert("Session required", "Please sign in again.");
      return;
    }

    const title = form.title.trim();
    const eventCode = form.event_code.trim();

    if (
      !title ||
      !eventCode ||
      !form.start_time.trim() ||
      !form.end_time.trim() ||
      !form.attendance_purpose.trim() ||
      !form.program ||
      !form.year_level ||
      !form.block
    ) {
      Alert.alert("Missing information", "Please complete all event fields.");
      return;
    }

    const startTime = toTimestamp(form.start_time);
    const endTime = toTimestamp(form.end_time);

    if (!startTime || !endTime) {
      Alert.alert(
        "Invalid date or time",
        "Enter valid dates and times using the format YYYY-MM-DD HH:mm.",
      );
      return;
    }

    if (new Date(endTime).getTime() <= new Date(startTime).getTime()) {
      Alert.alert(
        "Invalid schedule",
        "The event end time must be later than its start time.",
      );
      return;
    }

    const lateMinutes = Number(form.late_minutes);
    if (
      form.late_mode === "minutes" &&
      (!LATE_MINUTE_OPTIONS.includes(lateMinutes) ||
        !Number.isInteger(lateMinutes))
    ) {
      Alert.alert(
        "Invalid late setting",
        "Please select a valid grace period.",
      );
      return;
    }

    const exactCutoff = form.late_cutoff_time.trim();
    if (
      form.late_mode === "exact" &&
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(exactCutoff)
    ) {
      Alert.alert(
        "Invalid cutoff",
        "Enter a valid time in HH:mm format, e.g. 08:15.",
      );
      return;
    }

    setSaving(true);

    try {
      // Recheck the administrator role before writing.
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        throw profileError;
      }

      if (profile?.role !== "administrator") {
        Alert.alert("Access denied", "Administrator access is required.");
        return;
      }

      const eventData = {
        title,
        event_code: eventCode,
        start_time: startTime,
        end_time: endTime,
        attendance_purpose: form.attendance_purpose.trim(),
        program: form.program,
        year_level: form.year_level,
        block: form.block,
        late_mode: form.late_mode,
        late_minutes: form.late_mode === "minutes" ? lateMinutes : null,
        late_cutoff_time: form.late_mode === "exact" ? exactCutoff : null,
      };

      if (editingEvent) {
        const { error } = await supabase
          .from("events")
          .update(eventData)
          .eq("id", editingEvent.id);

        if (error) {
          throw error;
        }

        Alert.alert("Success", "Event updated successfully.");
      } else {
        const { error } = await supabase.from("events").insert({
          ...eventData,
          created_by: user.id,
        });

        if (error) {
          throw error;
        }

        Alert.alert("Success", "Event created successfully.");
      }

      setModalVisible(false);
      setEditingEvent(null);
      setForm(EMPTY_FORM);
      await loadEvents(true);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to save the event.";

      Alert.alert("Save failed", message);
    } finally {
      setSaving(false);
    }
  };

  const deleteEvent = (event: EventRecord) => {
    Alert.alert(
      "Delete event",
      `Are you sure you want to delete "${event.title}"? This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              if (!user?.id) {
                Alert.alert("Session required", "Please sign in again.");
                return;
              }

              const { data: profile, error: profileError } = await supabase
                .from("profiles")
                .select("role")
                .eq("id", user.id)
                .maybeSingle();

              if (profileError) {
                throw profileError;
              }

              if (profile?.role !== "administrator") {
                Alert.alert(
                  "Access denied",
                  "Administrator access is required.",
                );
                return;
              }

              const { error } = await supabase
                .from("events")
                .delete()
                .eq("id", event.id);

              if (error) {
                throw error;
              }

              setSelectedEventId((selected) =>
                selected === event.id ? null : selected,
              );
              setEvents((current) =>
                current.filter((item) => item.id !== event.id),
              );

              Alert.alert("Success", "Event deleted successfully.");
            } catch (error) {
              const message =
                error instanceof Error
                  ? error.message
                  : "Unable to delete the event.";

              Alert.alert("Delete failed", message);
            }
          },
        },
      ],
    );
  };

  const filteredEvents = events.filter((event) => {
    const query = search.trim().toLowerCase();

    return (
      event.title.toLowerCase().includes(query) ||
      event.event_code.toLowerCase().includes(query)
    );
  });

  const renderEvent = ({ item }: { item: EventRecord }) => (
    <View style={styles.eventCard}>
      <Pressable
        style={styles.eventHeader}
        onPress={() =>
          setSelectedEventId((current) =>
            current === item.id ? null : item.id,
          )
        }
        accessibilityRole="button"
        accessibilityLabel={`${item.title}. ${selectedEventId === item.id ? "Hide" : "Show"} QR code`}
      >
        <View style={styles.eventIcon}>
          <Ionicons name="qr-code-outline" size={23} color={COLORS.primary} />
        </View>
        <View style={styles.eventHeading}>
          <Text style={styles.eventTitle}>{item.title}</Text>
          <Text style={styles.eventCode}>
            Target:{" "}
            {[item.program, item.year_level, item.block]
              .filter(Boolean)
              .join(" • ") || "Not assigned (older event)"}
          </Text>
          <Text style={styles.eventCode}>
            Starts: {formatDate(item.start_time)}
          </Text>
          <Text style={styles.eventCode}>
            Ends: {formatDate(item.end_time)}
          </Text>
        </View>
        <Ionicons
          name={selectedEventId === item.id ? "chevron-up" : "chevron-down"}
          size={18}
          color={COLORS.primary}
        />
      </Pressable>
      <View style={styles.cardActions}>
        <Pressable
          style={styles.editButton}
          onPress={() => openEditModal(item)}
        >
          <Ionicons name="create-outline" size={18} color={COLORS.primary} />
          <Text style={styles.editButtonText}>Edit</Text>
        </Pressable>
        <Pressable
          style={styles.deleteButton}
          onPress={() => deleteEvent(item)}
        >
          <Ionicons name="trash-outline" size={18} color={COLORS.danger} />
          <Text style={styles.deleteButtonText}>Delete</Text>
        </Pressable>
      </View>
      {selectedEventId === item.id && (
        <View style={styles.qrDetails}>
          <Text style={styles.eventTitle}>{item.title}</Text>
          <Text style={styles.eventCode}>
            Purpose: {item.attendance_purpose || "Not specified"}
          </Text>
          <Text style={styles.eventCode}>
            Target Students:{" "}
            {[item.program, item.year_level, item.block]
              .filter(Boolean)
              .join(" • ") || "Not assigned"}
          </Text>
          <Text style={styles.eventCode}>
            Starts: {formatDate(item.start_time)}
          </Text>
          <Text style={styles.eventCode}>
            Ends: {formatDate(item.end_time)}
          </Text>
          <Text style={styles.eventCode}>
            Late after:{" "}
            {item.late_mode === "exact"
              ? (item.late_cutoff_time ?? "Not set")
              : item.late_mode === "minutes"
                ? `${item.late_minutes ?? 15} minutes from start`
                : "Not configured"}
          </Text>
          <View style={styles.qrCodeBox}>
            <QRCode
              value={JSON.stringify({
                v: 1,
                event: item.event_code,
                title: item.title,
                start: item.start_time ?? "",
                end: item.end_time ?? "",
              })}
              size={195}
            />
          </View>
        </View>
      )}
    </View>
  );

  if (authLoading || pageLoading) {
    return (
      <SafeAreaView style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading events...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <AuthDecor />
      <View style={styles.topBar}>
        <Pressable
          style={styles.backButton}
          onPress={() => router.replace("/admin")}
        >
          <Ionicons name="arrow-back" size={23} color={COLORS.text} />
        </Pressable>

        <View style={styles.topBarTitleContainer}>
          <Text style={styles.topBarTitle}>Event Management</Text>
          <Text style={styles.topBarSubtitle}>Manage attendance events</Text>
        </View>

        <View style={styles.adminBadge}>
          <Ionicons name="shield-checkmark" size={19} color={COLORS.primary} />
        </View>
      </View>

      <View style={styles.content}>
        <View style={styles.summaryCard}>
          <View style={styles.summaryIcon}>
            <Ionicons name="calendar" size={24} color={COLORS.primary} />
          </View>
          <View style={styles.summaryText}>
            <Text style={styles.summaryLabel}>TOTAL EVENTS</Text>
            <Text style={styles.summaryNumber}>{events.length}</Text>
          </View>
          <Pressable
            style={styles.refreshButton}
            onPress={() => void loadEvents(true)}
            disabled={refreshing}
          >
            <Ionicons name="refresh-outline" size={21} color={COLORS.primary} />
          </Pressable>
        </View>

        <View style={styles.searchContainer}>
          <Ionicons name="search-outline" size={20} color={COLORS.muted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search event title or code..."
            placeholderTextColor={COLORS.muted}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={20} color={COLORS.muted} />
            </Pressable>
          )}
        </View>

        <View style={styles.listHeading}>
          <Text style={styles.sectionTitle}>All Events</Text>
          <Text style={styles.eventCount}>
            {filteredEvents.length}{" "}
            {filteredEvents.length === 1 ? "event" : "events"}
          </Text>
        </View>

        <FlatList
          data={filteredEvents}
          keyExtractor={(item) => item.id}
          renderItem={renderEvent}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void loadEvents(true)}
              tintColor={COLORS.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Ionicons
                  name="calendar-clear-outline"
                  size={35}
                  color={COLORS.primary}
                />
              </View>
              <Text style={styles.emptyTitle}>No events found</Text>
              <Text style={styles.emptyDescription}>
                {search
                  ? "Try another event title or code."
                  : "Create an event to get started."}
              </Text>
            </View>
          }
        />
      </View>

      <Pressable style={styles.fab} onPress={openCreateModal}>
        <Ionicons name="add" size={25} color={COLORS.white} />
        <Text style={styles.fabText}>Create Event</Text>
      </Pressable>

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => {
          if (!saving) {
            setModalVisible(false);
          }
        }}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>
                  {editingEvent ? "Edit Event" : "Create Event"}
                </Text>
                <Text style={styles.modalSubtitle}>
                  Enter the event details below.
                </Text>
              </View>

              <Pressable
                style={styles.closeButton}
                disabled={saving}
                onPress={() => setModalVisible(false)}
              >
                <Ionicons name="close" size={23} color={COLORS.text} />
              </Pressable>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.inputLabel}>Event Title</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Annual School Assembly"
                placeholderTextColor={COLORS.muted}
                value={form.title}
                onChangeText={(value) => updateField("title", value)}
                editable={!saving}
                maxLength={150}
              />

              <Text style={styles.inputLabel}>Event Code</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. ASSEMBLY2026"
                placeholderTextColor={COLORS.muted}
                value={form.event_code}
                onChangeText={(value) => updateField("event_code", value)}
                autoCapitalize="characters"
                editable={!saving}
                maxLength={100}
              />

              <Text style={styles.inputLabel}>Attendance Purpose</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Class Attendance / Seminar"
                placeholderTextColor={COLORS.muted}
                value={form.attendance_purpose}
                onChangeText={(value) =>
                  updateField("attendance_purpose", value)
                }
                editable={!saving}
              />
              <AcademicSelect
                label="Program *"
                placeholder="Select program"
                value={form.program}
                options={[...PROGRAMS]}
                onChange={(value) => updateField("program", value)}
                disabled={saving}
              />
              <AcademicSelect
                label="Year Level *"
                placeholder="Select year level"
                value={form.year_level}
                options={[...YEAR_LEVELS]}
                onChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    year_level: value,
                    block: "",
                  }))
                }
                disabled={saving}
              />
              <AcademicSelect
                label="Block *"
                placeholder={
                  form.year_level ? "Select block" : "Select year level first"
                }
                value={form.block}
                options={BLOCKS.filter((value) =>
                  value.startsWith(
                    String(
                      YEAR_LEVELS.indexOf(
                        form.year_level as (typeof YEAR_LEVELS)[number],
                      ) + 1,
                    ),
                  ),
                )}
                onChange={(value) => updateField("block", value)}
                disabled={saving || !form.year_level}
              />

              <Text style={styles.inputLabel}>Start Date and Time</Text>
              <TextInput
                style={styles.input}
                placeholder="YYYY-MM-DD HH:mm"
                placeholderTextColor={COLORS.muted}
                value={form.start_time}
                onChangeText={(value) => updateField("start_time", value)}
                editable={!saving}
                autoCapitalize="none"
              />

              <Text style={styles.inputLabel}>End Date and Time</Text>
              <TextInput
                style={styles.input}
                placeholder="YYYY-MM-DD HH:mm"
                placeholderTextColor={COLORS.muted}
                value={form.end_time}
                onChangeText={(value) => updateField("end_time", value)}
                editable={!saving}
                autoCapitalize="none"
              />

              <Text style={styles.helperText}>
                Use your local time in the format YYYY-MM-DD HH:mm. Example:
                2026-10-20 09:00.
              </Text>

              <Text style={styles.lateHeading}>Late Attendance Settings</Text>
              <Text style={styles.helperText}>
                Set when a student scan will be marked Late.
              </Text>
              <View style={styles.lateOptions}>
                <Pressable
                  style={styles.lateRadioRow}
                  onPress={() => updateField("late_mode", "minutes")}
                  disabled={saving}
                >
                  <Ionicons
                    name={
                      form.late_mode === "minutes"
                        ? "radio-button-on"
                        : "radio-button-off"
                    }
                    size={22}
                    color={COLORS.primary}
                  />
                  <Text style={styles.lateRadioText}>
                    Minutes after event starts
                  </Text>
                </Pressable>
                <Pressable
                  style={styles.lateRadioRow}
                  onPress={() => updateField("late_mode", "exact")}
                  disabled={saving}
                >
                  <Ionicons
                    name={
                      form.late_mode === "exact"
                        ? "radio-button-on"
                        : "radio-button-off"
                    }
                    size={22}
                    color={COLORS.primary}
                  />
                  <Text style={styles.lateRadioText}>Specific cutoff time</Text>
                </Pressable>
              </View>
              {form.late_mode === "minutes" ? (
                <AcademicSelect
                  label="Grace Period *"
                  placeholder="Select minutes"
                  value={form.late_minutes}
                  options={LATE_MINUTE_OPTIONS.map(String)}
                  onChange={(value) => updateField("late_minutes", value)}
                  disabled={saving}
                />
              ) : (
                <>
                  <Text style={styles.inputLabel}>Late After (HH:mm) *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. 08:15"
                    placeholderTextColor={COLORS.muted}
                    value={form.late_cutoff_time}
                    onChangeText={(value) =>
                      updateField("late_cutoff_time", value)
                    }
                    editable={!saving}
                    keyboardType="numbers-and-punctuation"
                    maxLength={5}
                  />
                  <Text style={styles.helperText}>
                    Use 24-hour local time. Example: 08:15 for 8:15 AM.
                  </Text>
                </>
              )}

              <Pressable
                style={[styles.saveButton, saving && styles.disabledButton]}
                onPress={() => void saveEvent()}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color={COLORS.white} />
                ) : (
                  <>
                    <Ionicons
                      name={
                        editingEvent
                          ? "checkmark-circle-outline"
                          : "add-circle-outline"
                      }
                      size={20}
                      color={COLORS.white}
                    />
                    <Text style={styles.saveButtonText}>
                      {editingEvent ? "Save Changes" : "Create Event"}
                    </Text>
                  </>
                )}
              </Pressable>

              <Pressable
                style={styles.cancelButton}
                disabled={saving}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingScreen: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    color: COLORS.muted,
    marginTop: 12,
    fontSize: 14,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 15,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  topBarTitleContainer: {
    flex: 1,
  },
  topBarTitle: {
    color: COLORS.text,
    fontSize: 19,
    fontWeight: "800",
  },
  topBarSubtitle: {
    color: COLORS.muted,
    fontSize: 12,
    marginTop: 3,
  },
  adminBadge: {
    height: 40,
    width: 40,
    borderRadius: 13,
    backgroundColor: COLORS.primaryLight,
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 18,
  },
  summaryCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.white,
    borderRadius: 18,
    padding: 17,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 16,
  },
  summaryIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: COLORS.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 13,
  },
  summaryText: {
    flex: 1,
  },
  summaryLabel: {
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  summaryNumber: {
    color: COLORS.text,
    fontSize: 25,
    fontWeight: "800",
    marginTop: 3,
  },
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: COLORS.primaryLight,
    justifyContent: "center",
    alignItems: "center",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingHorizontal: 13,
    height: 49,
    marginBottom: 22,
  },
  searchInput: {
    flex: 1,
    color: COLORS.text,
    marginLeft: 9,
    fontSize: 13,
    paddingVertical: 8,
  },
  listHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: "800",
  },
  eventCount: {
    color: COLORS.muted,
    fontSize: 12,
  },
  listContent: {
    paddingBottom: 110,
    flexGrow: 1,
  },
  qrDetails: {
    marginTop: 14,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    alignItems: "center",
    gap: 6,
  },
  qrCodeBox: {
    padding: 14,
    backgroundColor: COLORS.white,
    marginTop: 10,
    borderRadius: 12,
  },
  eventCard: {
    backgroundColor: COLORS.white,
    borderRadius: 17,
    padding: 16,
    marginBottom: 13,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  eventHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 18,
  },
  eventIcon: {
    width: 45,
    height: 45,
    borderRadius: 14,
    backgroundColor: COLORS.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  eventHeading: {
    flex: 1,
  },
  eventTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "800",
  },
  eventCode: {
    color: COLORS.muted,
    fontSize: 12,
    marginTop: 5,
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 13,
  },
  dateTextContainer: {
    flex: 1,
    marginLeft: 10,
  },
  dateLabel: {
    color: COLORS.muted,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  dateValue: {
    color: COLORS.text,
    fontSize: 12,
    lineHeight: 18,
  },
  cardActions: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 13,
    marginTop: 2,
    gap: 10,
  },
  editButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 11,
    borderRadius: 11,
    backgroundColor: COLORS.primaryLight,
    gap: 7,
  },
  editButtonText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: "700",
  },
  deleteButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 11,
    borderRadius: 11,
    backgroundColor: COLORS.dangerLight,
    gap: 7,
  },
  deleteButtonText: {
    color: COLORS.danger,
    fontSize: 13,
    fontWeight: "700",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 25,
    paddingVertical: 55,
  },
  emptyIcon: {
    width: 75,
    height: 75,
    borderRadius: 24,
    backgroundColor: COLORS.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: "800",
  },
  emptyDescription: {
    color: COLORS.muted,
    fontSize: 13,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20,
  },
  fab: {
    position: "absolute",
    bottom: Platform.OS === "ios" ? 28 : 20,
    right: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
    paddingHorizontal: 19,
    paddingVertical: 15,
    borderRadius: 16,
    gap: 8,
    elevation: 5,
    shadowColor: COLORS.text,
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  fabText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: "800",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(34, 34, 59, 0.48)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    paddingHorizontal: 22,
    paddingTop: 23,
    paddingBottom: Platform.OS === "ios" ? 30 : 22,
    maxHeight: "92%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 22,
  },
  modalTitle: {
    color: COLORS.text,
    fontSize: 21,
    fontWeight: "800",
  },
  modalSubtitle: {
    color: COLORS.muted,
    fontSize: 12,
    marginTop: 5,
  },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: COLORS.background,
    justifyContent: "center",
    alignItems: "center",
  },
  inputLabel: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 8,
    marginTop: 5,
  },
  input: {
    height: 49,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
    borderRadius: 12,
    paddingHorizontal: 13,
    color: COLORS.text,
    fontSize: 13,
    marginBottom: 15,
  },
  helperText: {
    color: COLORS.muted,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 0,
    marginBottom: 18,
  },
  lateHeading: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "800",
    marginTop: 8,
    marginBottom: 8,
  },
  lateOptions: {
    marginBottom: 16,
  },
  lateRadioRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 10,
  },
  lateRadioText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "600",
  },
  saveButton: {
    height: 50,
    backgroundColor: COLORS.primary,
    borderRadius: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  disabledButton: {
    opacity: 0.65,
  },
  saveButtonText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: "800",
  },
  cancelButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    marginTop: 5,
  },
  cancelButtonText: {
    color: COLORS.muted,
    fontSize: 13,
    fontWeight: "700",
  },
});
