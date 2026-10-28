import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useFocusEffect, useRouter } from "expo-router";
import { AuthDecor } from "@/components/AuthDecor";
import { COLORS } from "@/constants/colors";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import {
  getAttendanceStatus,
  type AttendanceStatus,
  type LateSettings,
} from "@/lib/attendanceStatus";

type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  program: string | null;
  year_level: string | null;
  block: string | null;
};
type EventItem = LateSettings & {
  id: string;
  title: string;
  event_code: string | null;
  created_by: string | null;
  attendance_purpose: string | null;
  program: string | null;
  year_level: string | null;
  block: string | null;
};
type AttendanceItem = {
  id: string;
  event_id: string;
  student_id: string;
  scanned_at: string;
};
type Period = "all" | "today" | "week" | "month" | "custom";
type EventStatus = "all" | "upcoming" | "ongoing" | "completed";
type StudentRow = {
  student: Profile;
  scan: AttendanceItem | null;
  status: AttendanceStatus;
};
type Summary = {
  event: EventItem;
  creatorName: string;
  creatorRole: string;
  status: Exclude<EventStatus, "all">;
  students: StudentRow[];
  counts: Record<AttendanceStatus, number>;
  rate: number | null;
  eligible: boolean;
};

const STATUS_LABELS: AttendanceStatus[] = [
  "present",
  "late",
  "absent",
  "pending",
];
const initialCounts = (): Record<AttendanceStatus, number> => ({
  present: 0,
  late: 0,
  absent: 0,
  pending: 0,
});
function manilaDateKey(input: string | Date) {
  const date = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T12:00:00+08:00`);
  return !Number.isNaN(d.getTime()) && manilaDateKey(d) === value;
}
function formatTime(input: string | null) {
  if (!input) return "Not scheduled";
  const date = new Date(input);
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
function scheduleStatus(event: EventItem): Exclude<EventStatus, "all"> {
  const now = Date.now();
  const start = event.start_time ? new Date(event.start_time).getTime() : NaN;
  const end = event.end_time ? new Date(event.end_time).getTime() : NaN;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "upcoming";
  return now < start ? "upcoming" : now <= end ? "ongoing" : "completed";
}
function escapeCsv(value: string | number) {
  const valueText = String(value);
  const safe = /^[\s\uFEFF]*[=+@\-]/.test(valueText)
    ? `'${valueText}`
    : valueText;
  return `"${safe.replace(/"/g, '""')}"`;
}
function rateText(rate: number | null) {
  return rate === null ? "N/A" : `${rate.toFixed(1)}%`;
}

export default function AdminReportsScreen() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [attendance, setAttendance] = useState<AttendanceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState<Period>("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [status, setStatus] = useState<EventStatus>("all");
  const [eventId, setEventId] = useState("all");
  const [creatorId, setCreatorId] = useState("all");
  const [studentSearch, setStudentSearch] = useState("");
  const [eventSearch, setEventSearch] = useState("");
  const [openDropdown, setOpenDropdown] = useState<"event" | "creator" | null>(
    null,
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadReports = useCallback(
    async (refresh = false) => {
      if (!user?.id) {
        setLoading(false);
        return;
      }
      if (refresh) setRefreshing(true);
      else setLoading(true);
      setError("");
      try {
        const { data: account, error: roleError } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();
        if (roleError) throw roleError;
        if (account?.role !== "administrator") {
          router.replace("/(tabs)");
          return;
        }
        const [p, e, a] = await Promise.all([
          supabase
            .from("profiles")
            .select("id, full_name, email, role, program, year_level, block"),
          supabase
            .from("events")
            .select(
              "id, title, event_code, start_time, end_time, created_by, attendance_purpose, program, year_level, block, late_mode, late_minutes, late_cutoff_time",
            )
            .order("start_time", { ascending: false }),
          supabase
            .from("attendance")
            .select("id, event_id, student_id, scanned_at")
            .order("scanned_at", { ascending: true }),
        ]);
        if (p.error) throw p.error;
        if (e.error) throw e.error;
        if (a.error) throw a.error;
        setProfiles((p.data ?? []) as Profile[]);
        setEvents((e.data ?? []) as EventItem[]);
        setAttendance((a.data ?? []) as AttendanceItem[]);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load reports.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user?.id, router],
  );

  useFocusEffect(
    useCallback(() => {
      if (authLoading) return;
      if (!user) {
        router.replace("/login");
        setLoading(false);
        return;
      }
      void loadReports();
    }, [authLoading, user, router, loadReports]),
  );

  const profileMap = useMemo(
    () => new Map(profiles.map((p) => [p.id, p])),
    [profiles],
  );
  const creators = useMemo(() => {
    const ids = new Set(events.map((e) => e.created_by).filter(Boolean));
    return profiles
      .filter((p) => ids.has(p.id))
      .sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? ""));
  }, [profiles, events]);
  const dateRange = useMemo(() => {
    if (period === "all") return { start: "", end: "", valid: true };
    if (period === "custom")
      return {
        start: startDate,
        end: endDate,
        valid:
          (!startDate || validDate(startDate)) &&
          (!endDate || validDate(endDate)) &&
          (!startDate || !endDate || startDate <= endDate),
      };
    const now = new Date();
    const todayKey = manilaDateKey(now);
    const today = new Date(`${todayKey}T12:00:00+08:00`);
    const beginning = new Date(today);
    if (period === "week")
      beginning.setDate(beginning.getDate() - ((beginning.getDay() + 6) % 7));
    if (period === "month") beginning.setDate(1);
    return { start: manilaDateKey(beginning), end: todayKey, valid: true };
  }, [period, startDate, endDate]);

  const summaries = useMemo<Summary[]>(() => {
    if (!dateRange.valid) return [];
    const eventQuery = eventSearch.trim().toLowerCase();
    const studentQuery = studentSearch.trim().toLowerCase();
    const byEvent = new Map<string, Map<string, AttendanceItem>>();
    for (const a of attendance) {
      if (!byEvent.has(a.event_id)) byEvent.set(a.event_id, new Map());
      const students = byEvent.get(a.event_id)!;
      // Only first scan determines attendance status for a student/event.
      if (!students.has(a.student_id)) students.set(a.student_id, a);
    }
    return events
      .filter((event) => {
        if (eventId !== "all" && event.id !== eventId) return false;
        if (creatorId !== "all" && event.created_by !== creatorId) return false;
        if (status !== "all" && scheduleStatus(event) !== status) return false;
        const key = event.start_time ? manilaDateKey(event.start_time) : "";
        if (dateRange.start && key < dateRange.start) return false;
        if (dateRange.end && key > dateRange.end) return false;
        const creator = event.created_by
          ? profileMap.get(event.created_by)
          : undefined;
        return (
          !eventQuery ||
          `${event.title} ${event.event_code ?? ""} ${creator?.full_name ?? ""}`
            .toLowerCase()
            .includes(eventQuery)
        );
      })
      .map((event) => {
        const creator = event.created_by
          ? profileMap.get(event.created_by)
          : undefined;
        const eligible = Boolean(
          event.program && event.year_level && event.block,
        );
        const matchingStudents = eligible
          ? profiles.filter(
              (p) =>
                p.role === "student" &&
                p.program === event.program &&
                p.year_level === event.year_level &&
                p.block === event.block,
            )
          : [];
        const scans =
          byEvent.get(event.id) ?? new Map<string, AttendanceItem>();
        const rows = matchingStudents.map((student): StudentRow => {
          const scan = scans.get(student.id) ?? null;
          return {
            student,
            scan,
            status: getAttendanceStatus(scan?.scanned_at ?? null, event),
          };
        });
        const students = studentQuery
          ? rows.filter((r) =>
              `${r.student.full_name ?? ""} ${r.student.email ?? ""}`
                .toLowerCase()
                .includes(studentQuery),
            )
          : rows;
        const counts = initialCounts();
        for (const row of students) counts[row.status] += 1;
        const rate =
          eligible && students.length > 0
            ? ((counts.present + counts.late) / students.length) * 100
            : null;
        return {
          event,
          creatorName: creator?.full_name ?? "Unknown creator",
          creatorRole: creator?.role ?? "Unknown role",
          status: scheduleStatus(event),
          students,
          counts,
          rate,
          eligible,
        };
      })
      .filter((s) => !studentQuery || s.students.length > 0);
  }, [
    events,
    attendance,
    profiles,
    profileMap,
    eventId,
    creatorId,
    status,
    eventSearch,
    studentSearch,
    dateRange,
  ]);

  const totalTarget = summaries.reduce((n, s) => n + s.students.length, 0);
  const totalAttended = summaries.reduce(
    (n, s) => n + s.counts.present + s.counts.late,
    0,
  );
  const totalAbsent = summaries.reduce((n, s) => n + s.counts.absent, 0);
  const totalPending = summaries.reduce((n, s) => n + s.counts.pending, 0);
  const totalPresent = summaries.reduce((n, s) => n + s.counts.present, 0);
  const totalLate = summaries.reduce((n, s) => n + s.counts.late, 0);
  const unassigned = summaries.filter((s) => !s.eligible).length;
  const overallRate =
    totalTarget > 0 ? (totalAttended / totalTarget) * 100 : null;

  const resetFilters = () => {
    setPeriod("all");
    setStartDate("");
    setEndDate("");
    setStatus("all");
    setEventId("all");
    setCreatorId("all");
    setStudentSearch("");
    setEventSearch("");
    setExpandedId(null);
    setOpenDropdown(null);
  };
  const exportCsv = async () => {
    if (!dateRange.valid) {
      Alert.alert("Invalid dates", "Check the custom date range.");
      return;
    }
    if (!summaries.length) {
      Alert.alert("No events", "No events match the filters.");
      return;
    }
    const header = [
      "Event",
      "Event Code",
      "Teacher / Creator",
      "Creator Role",
      "Purpose",
      "Program",
      "Year Level",
      "Block",
      "Starts",
      "Ends",
      "Event Status",
      "Student Name",
      "Student Email",
      "Attendance Status",
      "Scanned At",
    ];
    const rows: (string | number)[][] = [];
    for (const s of summaries) {
      const base = [
        s.event.title,
        s.event.event_code ?? "",
        s.creatorName,
        s.creatorRole,
        s.event.attendance_purpose ?? "",
        s.event.program ?? "",
        s.event.year_level ?? "",
        s.event.block ?? "",
        formatTime(s.event.start_time),
        formatTime(s.event.end_time),
        s.status,
      ];
      for (const r of s.students)
        rows.push([
          ...base,
          r.student.full_name ?? "",
          r.student.email ?? "",
          r.status,
          r.scan ? formatTime(r.scan.scanned_at) : "",
        ]);
      if (s.students.length === 0)
        rows.push([
          ...base,
          "",
          "",
          s.eligible
            ? "no matching registered students"
            : "target not assigned",
          "",
        ]);
    }
    const csv = [header, ...rows]
      .map((r) => r.map(escapeCsv).join(","))
      .join("\r\n");
    try {
      if (!(await Sharing.isAvailableAsync()) || !FileSystem.cacheDirectory) {
        Alert.alert(
          "Export unavailable",
          "File sharing is unavailable on this device.",
        );
        return;
      }
      const fileUri = `${FileSystem.cacheDirectory}tanqr-report-${manilaDateKey(new Date())}.csv`;
      await FileSystem.writeAsStringAsync(fileUri, "\uFEFF" + csv, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      await Sharing.shareAsync(fileUri, {
        mimeType: "text/csv",
        dialogTitle: "Export TAN-QR Report",
        UTI: "public.comma-separated-values-text",
      });
    } catch {
      Alert.alert("Export failed", "Unable to share this report.");
    }
  };

  if (authLoading || loading)
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.muted}>Loading reports...</Text>
      </View>
    );

  return (
    <View style={styles.screen}>
      <AuthDecor />
      <ScrollView
        style={styles.layer}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="always"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void loadReports(true)}
            tintColor={COLORS.primary}
          />
        }
      >
        <Pressable style={styles.back} onPress={() => router.replace("/admin")}>
          <Ionicons name="arrow-back" size={18} color={COLORS.primary} />
          <Text style={styles.link}>Admin Dashboard</Text>
        </Pressable>
        <Text style={styles.eyebrow}>TAN-QR / ADMINISTRATION</Text>
        <Text style={styles.title}>System Reports</Text>
        <Text style={styles.description}>
          Event attendance and matching registered student statistics.
        </Text>
        {!!error && (
          <View style={styles.card}>
            <Text style={styles.error}>{error}</Text>
            <Pressable onPress={() => void loadReports()}>
              <Text style={styles.link}>Try Again</Text>
            </Pressable>
          </View>
        )}
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.sectionTitle}>Report Filters</Text>
            <Pressable onPress={resetFilters}>
              <Text style={styles.link}>Clear all</Text>
            </Pressable>
          </View>
          <Text style={styles.field}>Event date</Text>
          <View style={styles.chips}>
            {(
              [
                ["all", "All time"],
                ["today", "Today"],
                ["week", "This week"],
                ["month", "This month"],
                ["custom", "Custom"],
              ] as [Period, string][]
            ).map(([value, label]) => (
              <FilterChip
                key={value}
                label={label}
                selected={period === value}
                onPress={() => setPeriod(value)}
              />
            ))}
          </View>
          {period === "custom" && (
            <View style={styles.pair}>
              <View style={styles.half}>
                <Text style={styles.field}>From</Text>
                <TextInput
                  style={styles.input}
                  placeholder="YYYY-MM-DD"
                  value={startDate}
                  onChangeText={setStartDate}
                  placeholderTextColor={COLORS.textSecondary}
                />
              </View>
              <View style={styles.half}>
                <Text style={styles.field}>To</Text>
                <TextInput
                  style={styles.input}
                  placeholder="YYYY-MM-DD"
                  value={endDate}
                  onChangeText={setEndDate}
                  placeholderTextColor={COLORS.textSecondary}
                />
              </View>
            </View>
          )}
          {!dateRange.valid && (
            <Text style={styles.error}>
              Enter valid dates with From not later than To.
            </Text>
          )}
          <Text style={styles.field}>Event status</Text>
          <View style={styles.chips}>
            {(
              [
                ["all", "All"],
                ["upcoming", "Upcoming"],
                ["ongoing", "Ongoing"],
                ["completed", "Completed"],
              ] as [EventStatus, string][]
            ).map(([value, label]) => (
              <FilterChip
                key={value}
                label={label}
                selected={status === value}
                onPress={() => setStatus(value)}
              />
            ))}
          </View>
          <Text style={styles.field}>Event</Text>
          <Pressable
            style={styles.select}
            onPress={() =>
              setOpenDropdown(openDropdown === "event" ? null : "event")
            }
          >
            <Text style={styles.selectText}>
              {eventId === "all"
                ? "All events"
                : (events.find((e) => e.id === eventId)?.title ?? "All events")}
            </Text>
            <Ionicons
              name="chevron-down"
              size={18}
              color={COLORS.textSecondary}
            />
          </Pressable>
          {openDropdown === "event" && (
            <ScrollView nestedScrollEnabled style={styles.options}>
              {[{ id: "all", title: "All events" }, ...events].map((e) => (
                <Pressable
                  key={e.id}
                  style={styles.option}
                  onPress={() => {
                    setEventId(e.id);
                    setOpenDropdown(null);
                  }}
                >
                  <Text style={styles.optionText}>{e.title}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
          <Text style={styles.field}>Created by (Teacher / Administrator)</Text>
          <Pressable
            style={styles.select}
            onPress={() =>
              setOpenDropdown(openDropdown === "creator" ? null : "creator")
            }
          >
            <Text style={styles.selectText}>
              {creatorId === "all"
                ? "All creators"
                : (creators.find((c) => c.id === creatorId)?.full_name ??
                  "Selected creator")}
            </Text>
            <Ionicons
              name="chevron-down"
              size={18}
              color={COLORS.textSecondary}
            />
          </Pressable>
          {openDropdown === "creator" && (
            <ScrollView nestedScrollEnabled style={styles.options}>
              {[
                { id: "all", full_name: "All creators", role: "" },
                ...creators,
              ].map((c) => (
                <Pressable
                  key={c.id}
                  style={styles.option}
                  onPress={() => {
                    setCreatorId(c.id);
                    setOpenDropdown(null);
                  }}
                >
                  <Text style={styles.optionText}>
                    {c.full_name || "Unnamed"} {c.role ? `(${c.role})` : ""}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
          <Text style={styles.field}>Find an event or creator</Text>
          <TextInput
            style={styles.input}
            placeholder="Event title, code, creator..."
            placeholderTextColor={COLORS.textSecondary}
            value={eventSearch}
            onChangeText={setEventSearch}
            autoCapitalize="none"
          />
          <Text style={styles.field}>Find a student (optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="Student name or email"
            placeholderTextColor={COLORS.textSecondary}
            value={studentSearch}
            onChangeText={setStudentSearch}
            autoCapitalize="none"
          />
          <Text style={styles.hint}>
            Date filters apply to event start dates. Student search filters the
            displayed student cohort and statistics.
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Attendance Analysis</Text>
        <View style={styles.stats}>
          <Stat
            label="Matching students"
            value={String(totalTarget)}
            icon="people-outline"
          />
          <Stat
            label="Attended"
            value={String(totalAttended)}
            icon="checkmark-circle-outline"
          />
          <Stat
            label="Present / Late"
            value={`${totalPresent} / ${totalLate}`}
            icon="time-outline"
          />
          <Stat
            label="Absent / Pending"
            value={`${totalAbsent} / ${totalPending}`}
            icon="person-remove-outline"
          />
          <Stat
            label="Attendance rate"
            value={rateText(overallRate)}
            icon="stats-chart-outline"
          />
          <Stat
            label="Events"
            value={String(summaries.length)}
            icon="calendar-outline"
          />
        </View>
        {unassigned > 0 && (
          <Text style={styles.hint}>
            {unassigned} event(s) have no complete target Program/Year
            Level/Block. Their attendance rate is unavailable.
          </Text>
        )}
        <Text style={styles.hint}>
          Totals represent student-event opportunities, not unique users across
          multiple events. Attendance rate = (Present + Late) / matching
          registered students.
        </Text>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Compare Events</Text>
          <Text style={styles.hint}>Students who attended each event</Text>
          {summaries.length === 0 ? (
            <Text style={styles.muted}>No matching events.</Text>
          ) : (
            summaries.slice(0, 8).map((s) => {
              const max = Math.max(
                1,
                ...summaries.map((e) => e.counts.present + e.counts.late),
              );
              const count = s.counts.present + s.counts.late;
              return (
                <View key={s.event.id} style={styles.barRow}>
                  <View style={styles.headerRow}>
                    <Text numberOfLines={1} style={styles.barName}>
                      {s.event.title}
                    </Text>
                    <Text style={styles.bold}>{count}</Text>
                  </View>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        { width: `${(count / max) * 100}%` },
                      ]}
                    />
                  </View>
                </View>
              );
            })
          )}
        </View>

        <View style={styles.headerRow}>
          <Text style={styles.sectionTitle}>Event Reports</Text>
          <Text style={styles.muted}>{summaries.length} events</Text>
        </View>
        {summaries.map((s) => {
          const expanded = expandedId === s.event.id;
          return (
            <View key={s.event.id} style={styles.card}>
              <Pressable
                onPress={() => setExpandedId(expanded ? null : s.event.id)}
                style={styles.headerRow}
                accessibilityRole="button"
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.eventTitle}>{s.event.title}</Text>
                  <Text style={styles.muted}>
                    Code: {s.event.event_code ?? "N/A"}
                  </Text>
                </View>
                <Ionicons
                  name={expanded ? "chevron-up" : "chevron-down"}
                  color={COLORS.primary}
                  size={22}
                />
              </Pressable>
              <Text style={styles.detail}>
                Creator: {s.creatorName} ({s.creatorRole})
              </Text>
              <Text style={styles.detail}>
                Purpose: {s.event.attendance_purpose || "Not specified"}
              </Text>
              <Text style={styles.detail}>
                Target:{" "}
                {[s.event.program, s.event.year_level, s.event.block]
                  .filter(Boolean)
                  .join(" • ") || "Not assigned"}
              </Text>
              <Text style={styles.detail}>
                Starts: {formatTime(s.event.start_time)}
              </Text>
              <Text style={styles.detail}>
                Ends: {formatTime(s.event.end_time)}
              </Text>
              <Text style={styles.detail}>
                Schedule: {s.status.toUpperCase()}
              </Text>
              <View style={styles.chips}>
                {STATUS_LABELS.map((key) => (
                  <View key={key} style={styles.countChip}>
                    <Text style={styles.countText}>
                      {s.counts[key]} {key[0].toUpperCase() + key.slice(1)}
                    </Text>
                  </View>
                ))}
              </View>
              <Text style={[styles.bold, { marginTop: 10 }]}>
                Registered in target: {s.students.length} • Attendance rate:{" "}
                {rateText(s.rate)}
              </Text>
              {!s.eligible && (
                <Text style={styles.hint}>
                  Assign Program, Year Level, and Block in Event Management to
                  calculate enrollment-based statistics.
                </Text>
              )}
              {expanded && (
                <View style={styles.expanded}>
                  <Text style={styles.sectionTitle}>Target Students</Text>
                  {s.students.length === 0 ? (
                    <Text style={styles.muted}>
                      No matching registered students found.
                    </Text>
                  ) : (
                    s.students.map(
                      ({ student, scan, status: attendanceStatus }) => (
                        <View key={student.id} style={styles.studentRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.bold}>
                              {student.full_name || "Unnamed student"}
                            </Text>
                            <Text style={styles.muted}>
                              {student.email || "No email"}
                            </Text>
                            <Text style={styles.muted}>
                              {scan
                                ? `Scanned: ${formatTime(scan.scanned_at)}`
                                : "No scan"}
                            </Text>
                          </View>
                          <Text style={styles.statusText}>
                            {attendanceStatus.toUpperCase()}
                          </Text>
                        </View>
                      ),
                    )
                  )}
                </View>
              )}
            </View>
          );
        })}
        {summaries.length === 0 && (
          <View style={styles.card}>
            <Text style={styles.muted}>
              No matching events. Try clearing the filters.
            </Text>
          </View>
        )}
        <Pressable style={styles.export} onPress={() => void exportCsv()}>
          <Ionicons
            name="download-outline"
            size={20}
            color={COLORS.textOnPrimary}
          />
          <Text style={styles.exportText}>Export Filtered CSV</Text>
        </Pressable>
        <Text style={styles.hint}>
          CSV includes each matching registered student and attendance status,
          including Absent or Pending.
        </Text>
        <Text style={styles.footer}>TAN-QR · Administrator Reports</Text>
      </ScrollView>
    </View>
  );
}

function FilterChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}
function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
}) {
  return (
    <View style={styles.stat}>
      <Ionicons name={icon} size={21} color={COLORS.textSecondary} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  layer: { flex: 1 },
  content: { paddingHorizontal: 18, paddingTop: 48, paddingBottom: 44 },
  center: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  back: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 18,
    alignSelf: "flex-start",
  },
  link: { color: COLORS.primary, fontWeight: "800", fontSize: 12 },
  eyebrow: {
    color: COLORS.textSecondary,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  title: {
    fontSize: 28,
    color: COLORS.primary,
    fontWeight: "800",
    marginTop: 6,
  },
  description: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 6,
    marginBottom: 20,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 17,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: COLORS.primary,
    marginBottom: 8,
  },
  field: {
    fontSize: 12,
    color: COLORS.textPrimary,
    fontWeight: "700",
    marginTop: 12,
    marginBottom: 6,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  chip: {
    backgroundColor: COLORS.background,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 11,
  },
  chipSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  chipText: { fontSize: 11, color: COLORS.textSecondary, fontWeight: "700" },
  chipTextSelected: { color: COLORS.textOnPrimary },
  pair: { flexDirection: "row", gap: 9 },
  half: { flex: 1 },
  input: {
    minHeight: 46,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    color: COLORS.textPrimary,
    fontSize: 13,
  },
  select: {
    minHeight: 48,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    gap: 10,
  },
  selectText: { flex: 1, fontSize: 13, color: COLORS.textPrimary },
  options: {
    maxHeight: 180,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    marginTop: 6,
  },
  option: {
    padding: 12,
    borderBottomColor: COLORS.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  optionText: { fontSize: 13, color: COLORS.textPrimary },
  hint: {
    fontSize: 11,
    color: COLORS.textSecondary,
    lineHeight: 17,
    marginBottom: 14,
  },
  muted: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 18 },
  error: { color: COLORS.danger, fontSize: 12, marginBottom: 8 },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 12 },
  stat: {
    flexBasis: "45%",
    flexGrow: 1,
    minHeight: 105,
    backgroundColor: COLORS.card,
    padding: 15,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 8,
  },
  statValue: { color: COLORS.primary, fontSize: 24, fontWeight: "800" },
  barRow: { marginTop: 13 },
  barName: {
    flex: 1,
    color: COLORS.textPrimary,
    fontWeight: "700",
    fontSize: 12,
  },
  barTrack: {
    height: 9,
    backgroundColor: COLORS.background,
    borderRadius: 7,
    marginTop: 5,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    backgroundColor: COLORS.textSecondary,
    borderRadius: 7,
  },
  eventTitle: {
    color: COLORS.primary,
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 5,
  },
  detail: {
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: 19,
    marginBottom: 5,
  },
  countChip: {
    backgroundColor: COLORS.background,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  countText: { color: COLORS.textPrimary, fontWeight: "700", fontSize: 11 },
  bold: { color: COLORS.textPrimary, fontWeight: "700", fontSize: 12 },
  expanded: {
    borderTopColor: COLORS.border,
    borderTopWidth: 1,
    marginTop: 14,
    paddingTop: 13,
  },
  studentRow: {
    flexDirection: "row",
    paddingVertical: 12,
    gap: 10,
    borderBottomColor: COLORS.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  statusText: { color: COLORS.primary, fontSize: 10, fontWeight: "800" },
  export: {
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    padding: 15,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 9,
  },
  exportText: { color: COLORS.textOnPrimary, fontWeight: "800", fontSize: 14 },
  footer: {
    fontSize: 11,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginTop: 22,
  },
});
