import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useAuth } from "@/lib/auth";
import { COLORS } from "@/constants/colors";
import { supabase } from "@/lib/supabase";
import { getProfile, type Role } from "@/lib/profile";
import {
  getAttendanceStatus,
  type AttendanceStatus,
  type LateSettings,
} from "@/lib/attendanceStatus";

type HistoryTab = "mine" | "students";
type StatusFilter = AttendanceStatus;

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  program: string | null;
  year_level: string | null;
  block: string | null;
};

type EventRow = LateSettings & {
  id: string;
  title: string;
  event_code: string;
  attendance_purpose: string | null;
  program: string | null;
  year_level: string | null;
  block: string | null;
  created_by: string | null;
};

type ScanRow = {
  event_id: string;
  student_id: string;
  scanned_at: string;
};

type PersonalRecord = {
  id: string;
  event: EventRow;
  creator: string;
  scannedAt: string | null;
  status: AttendanceStatus;
};

type StudentRecord = {
  student: ProfileRow;
  scannedAt: string | null;
  status: AttendanceStatus;
};

type TeacherEvent = {
  event: EventRow;
  students: StudentRecord[];
};

const STATUSES: StatusFilter[] = ["present", "late", "absent", "pending"];

function labelStatus(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatDate(value: string | null) {
  if (!value) return "Not set";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Invalid date";

  return date.toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function earliestScans(scans: ScanRow[]) {
  const map = new Map<string, string>();

  for (const scan of scans) {
    const key = `${scan.event_id}:${scan.student_id}`;
    const previous = map.get(key);

    if (
      !previous ||
      new Date(scan.scanned_at).getTime() < new Date(previous).getTime()
    ) {
      map.set(key, scan.scanned_at);
    }
  }

  return map;
}

export default function HistoryScreen() {
  const { user } = useAuth();

  const [role, setRole] = useState<Role | null>(null);
  const [tab, setTab] = useState<HistoryTab>("mine");

  const [personal, setPersonal] = useState<PersonalRecord[]>([]);
  const [teacherEvents, setTeacherEvents] = useState<TeacherEvent[]>([]);

  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<StatusFilter>("present");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) {
      setRole(null);
      setPersonal([]);
      setTeacherEvents([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const account = await getProfile(user.id);
      const currentRole = account?.role ?? "student";

      setRole(currentRole);

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id, full_name, email, role, program, year_level, block")
        .eq("id", user.id)
        .single();

      if (profileError) throw profileError;

      const profile = profileData as ProfileRow;

      // MY ATTENDANCE / STUDENT PERSONAL HISTORY
      const { data: myScans, error: scanError } = await supabase
        .from("attendance")
        .select("event_id, student_id, scanned_at")
        .eq("student_id", user.id);

      if (scanError) throw scanError;

      const scans = (myScans ?? []) as ScanRow[];
      const scanMap = earliestScans(scans);

      let personalEvents: EventRow[] = [];

      if (currentRole === "student") {
        if (!profile.program || !profile.year_level || !profile.block) {
          setError(
            "Your academic information is incomplete. Ask the Admin or Teacher to update your Program, Year Level, and Block.",
          );
          setPersonal([]);
          setTeacherEvents([]);
          return;
        }

        const { data, error: eventError } = await supabase
          .from("events")
          .select(
            "id, title, event_code, attendance_purpose, program, year_level, block, start_time, end_time, created_by, late_mode, late_minutes, late_cutoff_time",
          )
          .eq("program", profile.program)
          .eq("year_level", profile.year_level)
          .eq("block", profile.block)
          .order("start_time", { ascending: false });

        if (eventError) throw eventError;

        personalEvents = (data ?? []) as EventRow[];
      } else if (currentRole === "teacher") {
        // Teacher's personal attendance is separate from
        // attendance of students in their own events.
        const ids = [...new Set(scans.map((s) => s.event_id))];

        if (ids.length) {
          const { data, error: eventError } = await supabase
            .from("events")
            .select(
              "id, title, event_code, attendance_purpose, program, year_level, block, start_time, end_time, created_by, late_mode, late_minutes, late_cutoff_time",
            )
            .in("id", ids)
            .order("start_time", { ascending: false });

          if (eventError) throw eventError;

          personalEvents = (data ?? []) as EventRow[];
        }
      }

      // Get creator names when permitted by Supabase RLS.
      const creatorIds = [
        ...new Set(
          personalEvents
            .map((event) => event.created_by)
            .filter((id): id is string => !!id),
        ),
      ];

      const creatorNames = new Map<string, string>();

      await Promise.all(
        personalEvents.map(async (event) => {
          const { data, error } = await supabase.rpc("get_event_creator", {
            p_event_id: event.id,
          });

          if (error) {
            console.error("Creator lookup error:", event.id, error.message);
            return;
          }

          const creator = data?.[0];

          if (creator) {
            const roleLabel =
              creator.role === "administrator"
                ? "Administrator"
                : creator.role === "teacher"
                  ? "Teacher"
                  : "Creator";

            if (event.created_by) {
              creatorNames.set(
                event.created_by,
                `${creator.full_name} (${roleLabel})`,
              );
            }
          }
        }),
      );

      setPersonal(
        personalEvents.map((event) => {
          const scannedAt = scanMap.get(`${event.id}:${user.id}`) ?? null;

          return {
            id: event.id,
            event,
            scannedAt,
            creator: event.created_by
              ? (creatorNames.get(event.created_by) ?? "Event creator")
              : "Not assigned",
            status: getAttendanceStatus(scannedAt, event),
          };
        }),
      );

      // STUDENT ATTENDANCE: ONLY EVENTS CREATED BY TEACHER
      if (currentRole === "teacher") {
        const { data: ownEventsData, error: ownEventsError } = await supabase
          .from("events")
          .select(
            "id, title, event_code, attendance_purpose, program, year_level, block, start_time, end_time, created_by, late_mode, late_minutes, late_cutoff_time",
          )
          .eq("created_by", user.id)
          .order("start_time", { ascending: false });

        if (ownEventsError) throw ownEventsError;

        const ownEvents = (ownEventsData ?? []) as EventRow[];
        const ownEventIds = ownEvents.map((event) => event.id);

        let allStudents: ProfileRow[] = [];
        let attendanceScans: ScanRow[] = [];

        if (ownEventIds.length) {
          const [studentsResult, attendanceResult] = await Promise.all([
            supabase
              .from("profiles")
              .select("id, full_name, email, role, program, year_level, block")
              .eq("role", "student"),

            supabase
              .from("attendance")
              .select("event_id, student_id, scanned_at")
              .in("event_id", ownEventIds),
          ]);

          if (studentsResult.error) {
            throw studentsResult.error;
          }

          if (attendanceResult.error) {
            throw attendanceResult.error;
          }

          allStudents = (studentsResult.data ?? []) as ProfileRow[];
          attendanceScans = (attendanceResult.data ?? []) as ScanRow[];
        }

        const attendanceMap = earliestScans(attendanceScans);

        const results: TeacherEvent[] = ownEvents.map((event) => {
          // Only registered students matching the academic target.
          const matchingStudents = allStudents.filter(
            (student) =>
              !!event.program &&
              !!event.year_level &&
              !!event.block &&
              student.program === event.program &&
              student.year_level === event.year_level &&
              student.block === event.block,
          );

          return {
            event,
            students: matchingStudents.map((student) => {
              const scannedAt =
                attendanceMap.get(`${event.id}:${student.id}`) ?? null;

              return {
                student,
                scannedAt,
                status: getAttendanceStatus(scannedAt, event),
              };
            }),
          };
        });

        setTeacherEvents(results);
      } else {
        setTeacherEvents([]);
      }
    } catch (err) {
      console.error("History error:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load attendance history.",
      );
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const renderPersonal = ({ item }: { item: PersonalRecord }) => (
    <View style={styles.card}>
      <View style={styles.cardHeading}>
        <Text style={styles.eventTitle}>{item.event.title}</Text>

        <View style={styles.badge}>
          <Text style={styles.badgeText}>{labelStatus(item.status)}</Text>
        </View>
      </View>

      <Text style={styles.meta}>
        Purpose: {item.event.attendance_purpose || "Not specified"}
      </Text>

      <Text style={styles.meta}>Created by: {item.creator}</Text>

      <Text style={styles.meta}>
        Start: {formatDate(item.event.start_time)}
      </Text>

      <Text style={styles.meta}>End: {formatDate(item.event.end_time)}</Text>

      <Text style={styles.meta}>
        {item.scannedAt
          ? `Scanned: ${formatDate(item.scannedAt)}`
          : "No scan recorded"}
      </Text>
    </View>
  );

  const renderTeacherEvent = ({ item }: { item: TeacherEvent }) => {
    const expanded = expandedEvent === item.event.id;

    const visibleStudents = item.students.filter(
      (row) => row.status === selectedStatus,
    );

    return (
      <View style={styles.card}>
        <Pressable
          style={styles.cardHeading}
          onPress={() => {
            setExpandedEvent(expanded ? null : item.event.id);
            setSelectedStatus("present");
          }}
        >
          <View style={styles.flex}>
            <Text style={styles.eventTitle}>{item.event.title}</Text>

            <Text style={styles.meta}>Code: {item.event.event_code}</Text>

            <Text style={styles.meta}>{formatDate(item.event.start_time)}</Text>
          </View>

          <Text style={styles.expandIcon}>{expanded ? "−" : "+"}</Text>
        </Pressable>

        <Text style={styles.meta}>
          Purpose: {item.event.attendance_purpose || "Not specified"}
        </Text>

        <Text style={styles.meta}>
          Target:{" "}
          {[item.event.program, item.event.year_level, item.event.block]
            .filter(Boolean)
            .join(" • ") || "Not assigned"}
        </Text>

        <Text style={styles.meta}>
          Registered target students: {item.students.length}
        </Text>

        {expanded && (
          <View style={styles.details}>
            <View style={styles.statusGrid}>
              {STATUSES.map((status) => {
                const count = item.students.filter(
                  (row) => row.status === status,
                ).length;

                const selected = selectedStatus === status;

                return (
                  <Pressable
                    key={status}
                    style={[
                      styles.statusButton,
                      selected && styles.statusActive,
                    ]}
                    onPress={() => setSelectedStatus(status)}
                  >
                    <Text
                      style={[
                        styles.statusNumber,
                        selected && styles.selectedText,
                      ]}
                    >
                      {count}
                    </Text>

                    <Text
                      style={[
                        styles.statusLabel,
                        selected && styles.selectedText,
                      ]}
                    >
                      {labelStatus(status)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.listTitle}>
              {labelStatus(selectedStatus)} Students
            </Text>

            {visibleStudents.length === 0 ? (
              <Text style={styles.meta}>No students in this category.</Text>
            ) : (
              visibleStudents.map((row) => (
                <View key={row.student.id} style={styles.studentRow}>
                  <View style={styles.flex}>
                    <Text style={styles.studentName}>
                      {row.student.full_name || "Unnamed student"}
                    </Text>

                    <Text style={styles.meta}>
                      {row.student.email || "No email"}
                    </Text>
                  </View>

                  <Text style={styles.scanTime}>
                    {row.scannedAt ? formatDate(row.scannedAt) : "No scan"}
                  </Text>
                </View>
              ))
            )}

            <Text style={styles.note}>
              Absent is finalized after the event ends. Pending means the event
              is not yet completed or the Late cutoff cannot be determined.
            </Text>
          </View>
        )}
      </View>
    );
  };

  const showTeacherTabs = role === "teacher";

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Attendance History</Text>

        <Pressable style={styles.refreshButton} onPress={() => void load()}>
          <Text style={styles.refreshText}>Refresh</Text>
        </Pressable>
      </View>

      {showTeacherTabs && (
        <View style={styles.tabs}>
          <Pressable
            style={[styles.tab, tab === "mine" && styles.activeTab]}
            onPress={() => setTab("mine")}
          >
            <Text
              style={[styles.tabText, tab === "mine" && styles.activeTabText]}
            >
              My Attendance
            </Text>
          </Pressable>

          <Pressable
            style={[styles.tab, tab === "students" && styles.activeTab]}
            onPress={() => setTab("students")}
          >
            <Text
              style={[
                styles.tabText,
                tab === "students" && styles.activeTabText,
              ]}
            >
              Student Attendance
            </Text>
          </Pressable>
        </View>
      )}

      {loading ? (
        <ActivityIndicator
          size="large"
          color={COLORS.primary}
          style={styles.loading}
        />
      ) : error ? (
        <Text style={styles.empty}>{error}</Text>
      ) : showTeacherTabs && tab === "students" ? (
        <FlatList
          data={teacherEvents}
          keyExtractor={(item) => item.event.id}
          renderItem={renderTeacherEvent}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>
              You have not created any events yet.
            </Text>
          }
        />
      ) : (
        <FlatList
          data={personal}
          keyExtractor={(item) => item.id}
          renderItem={renderPersonal}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {role === "teacher"
                ? "No personal attendance records yet. Activities you attend as a participant will appear here once recorded."
                : "No matching attendance events yet."}
            </Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingHorizontal: 18,
    paddingTop: 22,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  title: {
    flex: 1,
    fontSize: 21,
    fontWeight: "800",
    color: COLORS.textPrimary,
  },
  refreshButton: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 11,
  },
  refreshText: {
    color: COLORS.textPrimary,
    fontSize: 12,
    fontWeight: "700",
  },
  tabs: {
    flexDirection: "row",
    backgroundColor: COLORS.card,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 4,
    marginBottom: 18,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 10,
  },
  activeTab: {
    backgroundColor: COLORS.primary,
  },
  tabText: {
    color: COLORS.textSecondary,
    fontWeight: "700",
    fontSize: 12,
    textAlign: "center",
  },
  activeTabText: {
    color: COLORS.textOnPrimary,
  },
  loading: {
    marginTop: 40,
  },
  list: {
    paddingBottom: 40,
  },
  empty: {
    marginTop: 35,
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardHeading: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 9,
  },
  flex: {
    flex: 1,
  },
  eventTitle: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: "800",
    flexShrink: 1,
  },
  meta: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginTop: 5,
    lineHeight: 18,
  },
  badge: {
    backgroundColor: COLORS.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  badgeText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: "800",
  },
  expandIcon: {
    color: COLORS.primary,
    fontSize: 23,
    fontWeight: "700",
  },
  details: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    marginTop: 13,
    paddingTop: 16,
  },
  statusGrid: {
    flexDirection: "row",
    gap: 7,
    flexWrap: "wrap",
  },
  statusButton: {
    flex: 1,
    minWidth: "21%",
    alignItems: "center",
    backgroundColor: COLORS.background,
    paddingVertical: 13,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statusActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  statusNumber: {
    color: COLORS.textPrimary,
    fontSize: 20,
    fontWeight: "800",
  },
  statusLabel: {
    color: COLORS.textSecondary,
    fontSize: 10,
    fontWeight: "700",
  },
  selectedText: {
    color: COLORS.textOnPrimary,
  },
  listTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: COLORS.textPrimary,
    marginTop: 20,
    marginBottom: 8,
  },
  studentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  studentName: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  scanTime: {
    color: COLORS.textSecondary,
    fontSize: 11,
    maxWidth: 115,
    textAlign: "right",
  },
  note: {
    color: COLORS.textSecondary,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 17,
  },
});
