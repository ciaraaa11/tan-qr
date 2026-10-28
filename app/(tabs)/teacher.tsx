import "@/lib/database";
import Ionicons from "@expo/vector-icons/Ionicons";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import {
  createElement,
  useCallback,
  useState,
  type ChangeEvent,
  type CSSProperties,
} from "react";
import { useFocusEffect, useRouter } from "expo-router";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";

import AppButton from "@/components/AppButton";
import AcademicSelect from "@/components/AcademicSelect";
import { PROGRAMS, YEAR_LEVELS, BLOCKS } from "@/constants/academic";
import { COLORS } from "@/constants/colors";
import { useAuth } from "@/lib/auth";
import {
  createEvent,
  deleteEvent,
  getEventsByTeacher,
  updateEvent,
  type CloudEvent,
  type LateMode,
} from "@/lib/events";
import { getProfile, type Role } from "@/lib/profile";
import { supabase } from "@/lib/supabase";
import {
  getAttendanceStatus,
  type AttendanceStatus,
} from "@/lib/attendanceStatus";

type StudentEntry = {
  id: string;
  full_name: string | null;
  email: string | null;
  program: string | null;
  year_level: string | null;
  block: string | null;
};

type ScanEntry = {
  student_id: string;
  scanned_at: string;
};

type StudentAttendanceEntry = {
  student: StudentEntry;
  scannedAt: string | null;
  status: AttendanceStatus;
};

type StatusFilter = "present" | "late" | "absent" | "pending";
const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "present", label: "Present" },
  { key: "late", label: "Late" },
  { key: "absent", label: "Absent" },
  { key: "pending", label: "Pending" },
];

function toLocalISO(date: Date) {
  return date.toISOString(); // Store the exact instant in UTC for Supabase.
}

function toDateTimeLocalValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDateTime(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const month = date.toLocaleString("en-US", { month: "short" });

  return `${month} ${pad(date.getDate())}, ${date.getFullYear()} at ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

const GRACE_PERIODS = [0, 5, 10, 15, 20, 30, 60];

// Keep exact cutoff as a local clock time. The attendance calculation
// will need to use the event date and the same local timezone.
function resolveExactCutoff(start: Date, end: Date, text: string): Date | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(text.trim());
  if (!match) return null;

  const cutoff = new Date(start);
  cutoff.setHours(Number(match[1]), Number(match[2]), 0, 0);

  // An event that runs across midnight may have its cutoff on the next day.
  if (cutoff.getTime() < start.getTime() && end.getDate() !== start.getDate()) {
    cutoff.setDate(cutoff.getDate() + 1);
  }

  return cutoff.getTime() >= start.getTime() &&
    cutoff.getTime() <= end.getTime()
    ? cutoff
    : null;
}

const QUICK_END_OPTIONS = [
  { label: "+30 min", ms: 30 * 60 * 1000 },
  { label: "+1 hour", ms: 60 * 60 * 1000 },
  { label: "+2 hours", ms: 2 * 60 * 60 * 1000 },
];

type EditTarget = "start" | "end";

export default function TeacherScreen() {
  const { user } = useAuth();
  const router = useRouter();

  const [role, setRole] = useState<Role | null>(null);
  const [roleLoading, setRoleLoading] = useState(true);

  const [title, setTitle] = useState("");
  const [eventId, setEventId] = useState("");
  const [attendancePurpose, setAttendancePurpose] = useState("");
  const [program, setProgram] = useState("");
  const [yearLevel, setYearLevel] = useState("");
  const [block, setBlock] = useState("");
  const [lateMode, setLateMode] = useState<LateMode>("minutes");
  const [lateMinutes, setLateMinutes] = useState(15);
  const [lateCutoffTime, setLateCutoffTime] = useState("08:15");
  const [startDate, setStartDate] = useState(() => new Date());
  const [endDate, setEndDate] = useState(
    () => new Date(Date.now() + 60 * 60 * 1000),
  );
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [editingPart, setEditingPart] = useState<"date" | "time">("date");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [existingEvents, setExistingEvents] = useState<CloudEvent[]>([]);
  const [existingLoading, setExistingLoading] = useState(true);

  const [editingEvent, setEditingEvent] = useState<CloudEvent | null>(null);
  const [attendanceEventId, setAttendanceEventId] = useState<string | null>(
    null,
  );
  const [attendanceRows, setAttendanceRows] = useState<
    StudentAttendanceEntry[]
  >([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceError, setAttendanceError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("present");

  useFocusEffect(
    useCallback(() => {
      let active = true;

      if (!user) {
        setRoleLoading(false);

        return () => {
          active = false;
        };
      }

      getProfile(user.id).then((profile) => {
        if (!active) return;

        setRole(profile?.role ?? "student");
        setRoleLoading(false);

        if (profile?.role === "teacher") {
          getEventsByTeacher(user.id).then((events) => {
            if (!active) return;

            setExistingEvents(events);
            setExistingLoading(false);
          });
        }
      });

      return () => {
        active = false;
      };
    }, [user]),
  );

  const isAndroid = Platform.OS === "android";

  const openPicker = (target: EditTarget) => {
    setMessage(null);
    setEditTarget(target);
    setEditingPart("date");
  };

  const onPickerChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (!editTarget) return;

    if (event.type === "dismissed" || !selected) {
      setEditTarget(null);
      setEditingPart("date");
      return;
    }

    const current = editTarget === "start" ? startDate : endDate;
    const next = new Date(current);

    if (editingPart === "date") {
      next.setFullYear(
        selected.getFullYear(),
        selected.getMonth(),
        selected.getDate(),
      );
    } else {
      next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
    }

    if (editTarget === "start") {
      setStartDate(next);
    } else {
      setEndDate(next);
    }

    if (isAndroid && editingPart === "date") {
      setEditingPart("time");
    } else {
      setEditTarget(null);
      setEditingPart("date");
    }
  };

  const handleQuickEnd = (ms: number) => {
    setMessage(null);
    setEndDate(new Date(startDate.getTime() + ms));
  };

  const handleCreateEvent = () => {
    const event = {
      eventId: eventId.trim(),
      title: title.trim(),
      start: toLocalISO(startDate),
      end: toLocalISO(endDate),
      attendance_purpose: attendancePurpose.trim(),
      program,
      year_level: yearLevel,
      block,
      late_mode: lateMode,
      late_minutes: lateMode === "minutes" ? lateMinutes : null,
      late_cutoff_time: lateMode === "exact" ? lateCutoffTime.trim() : null,
    };

    if (!event.eventId || !event.title) {
      setMessage("Event title and code are required.");
      return;
    }

    if (!event.attendance_purpose || !program || !yearLevel || !block) {
      setMessage(
        "Attendance purpose, program, year level and block are required.",
      );
      return;
    }

    if (endDate.getTime() <= startDate.getTime()) {
      setMessage("End time must be after start time.");
      return;
    }

    if (
      lateMode === "exact" &&
      !resolveExactCutoff(startDate, endDate, lateCutoffTime)
    ) {
      setMessage(
        "Enter a valid Late After time (HH:MM) within the event schedule.",
      );
      return;
    }

    createEvent(event).then(({ error }) => {
      if (error) {
        setMessage("Could not save the event. Please try again.");
        return;
      }

      setMessage(
        "Event saved! Tap the event in Your Events to view its QR code.",
      );
      setSelectedEventId(null);

      if (user) {
        getEventsByTeacher(user.id).then((events) => {
          setExistingEvents(events);
          setExistingLoading(false);
        });
      }
    });
  };

  const handleShowExisting = (ev: CloudEvent) => {
    setSelectedEventId((current) => (current === ev.id ? null : ev.id));
    setMessage(null);
  };

  const refreshEvents = () => {
    if (!user) return;

    getEventsByTeacher(user.id).then((events) => {
      setExistingEvents(events);
      setExistingLoading(false);
    });
  };

  const loadEventAttendance = async (ev: CloudEvent) => {
    if (!user || ev.created_by !== user.id) {
      setAttendanceError("This event is not assigned to your account.");
      return;
    }
    setAttendanceLoading(true);
    setAttendanceError(null);
    try {
      // Query only students assigned to this event, not every school account.
      if (!ev.program || !ev.year_level || !ev.block) {
        setAttendanceRows([]);
        setAttendanceError(
          "Set the target Program, Year Level and Block for this event first.",
        );
        return;
      }
      const [studentsResult, scansResult] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, email, program, year_level, block")
          .eq("role", "student")
          .eq("program", ev.program)
          .eq("year_level", ev.year_level)
          .eq("block", ev.block),
        supabase
          .from("attendance")
          .select("student_id, scanned_at")
          .eq("event_id", ev.id),
      ]);
      if (studentsResult.error) throw studentsResult.error;
      if (scansResult.error) throw scansResult.error;
      const students = (studentsResult.data ?? []) as StudentEntry[];
      const scans = (scansResult.data ?? []) as ScanEntry[];
      const scanMap = new Map(
        scans.map((scan) => [scan.student_id, scan.scanned_at]),
      );
      const now = new Date();
      setAttendanceRows(
        students.map((student) => {
          const scannedAt = scanMap.get(student.id) ?? null;
          return {
            student,
            scannedAt,
            status: getAttendanceStatus(scannedAt, ev, now),
          };
        }),
      );
    } catch (error) {
      setAttendanceRows([]);
      setAttendanceError(
        error instanceof Error ? error.message : "Unable to load attendance.",
      );
    } finally {
      setAttendanceLoading(false);
    }
  };

  const toggleEventAttendance = (ev: CloudEvent) => {
    if (attendanceEventId === ev.id) {
      setAttendanceEventId(null);
      setAttendanceRows([]);
      return;
    }
    setAttendanceEventId(ev.id);
    setStatusFilter("present");
    void loadEventAttendance(ev);
  };

  const handleEditEvent = (ev: CloudEvent) => {
    setMessage(`Editing "${ev.title}". Change the details below.`);

    setEditingEvent(ev);
    setTitle(ev.title);
    setEventId(ev.event_code);
    setAttendancePurpose(ev.attendance_purpose ?? "");
    setProgram(ev.program ?? "");
    setYearLevel(ev.year_level ?? "");
    setBlock(ev.block ?? "");
    setLateMode(ev.late_mode === "exact" ? "exact" : "minutes");
    setLateMinutes(ev.late_minutes ?? 15);
    setLateCutoffTime(ev.late_cutoff_time ?? "08:15");

    if (ev.start_time) setStartDate(new Date(ev.start_time));
    if (ev.end_time) setEndDate(new Date(ev.end_time));

    setSelectedEventId(null);
  };

  const handleCancelEdit = () => {
    setMessage(null);

    setEditingEvent(null);
    setTitle("");
    setEventId("");
    setAttendancePurpose("");
    setProgram("");
    setYearLevel("");
    setBlock("");
    setLateMode("minutes");
    setLateMinutes(15);
    setLateCutoffTime("08:15");
  };

  const handleUpdateEvent = () => {
    if (!editingEvent) return;

    const event = {
      eventId: eventId.trim(),
      title: title.trim(),
      start: toLocalISO(startDate),
      end: toLocalISO(endDate),
      attendance_purpose: attendancePurpose.trim(),
      program,
      year_level: yearLevel,
      block,
      late_mode: lateMode,
      late_minutes: lateMode === "minutes" ? lateMinutes : null,
      late_cutoff_time: lateMode === "exact" ? lateCutoffTime.trim() : null,
    };

    if (!event.eventId || !event.title) {
      setMessage("Event title and code are required.");
      return;
    }

    if (!event.attendance_purpose || !program || !yearLevel || !block) {
      setMessage(
        "Attendance purpose, program, year level and block are required.",
      );
      return;
    }

    if (endDate.getTime() <= startDate.getTime()) {
      setMessage("End time must be after start time.");
      return;
    }

    if (
      lateMode === "exact" &&
      !resolveExactCutoff(startDate, endDate, lateCutoffTime)
    ) {
      setMessage(
        "Enter a valid Late After time (HH:MM) within the event schedule.",
      );
      return;
    }

    updateEvent(editingEvent.id, {
      event_code: event.eventId,
      title: event.title,
      start_time: event.start,
      end_time: event.end,
      attendance_purpose: event.attendance_purpose,
      program: event.program,
      year_level: event.year_level,
      block: event.block,
      late_mode: event.late_mode,
      late_minutes: event.late_minutes,
      late_cutoff_time: event.late_cutoff_time,
    }).then(({ error }) => {
      if (error) {
        setMessage("Could not update the event. Please try again.");
        return;
      }

      setMessage(
        "Event updated! Tap the event in Your Events to view its QR code.",
      );
      setEditingEvent(null);
      setSelectedEventId(null);
      refreshEvents();
    });
  };

  const handleDeleteEvent = (ev: CloudEvent) => {
    Alert.alert(
      "Delete Event",
      `Delete "${ev.title}"? This also removes all its attendance records.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            deleteEvent(ev.id).then(({ error }) => {
              if (error) {
                setMessage("Could not delete the event. Please try again.");
                return;
              }

              setMessage("Event deleted.");

              if (editingEvent?.id === ev.id) setEditingEvent(null);
              if (selectedEventId === ev.id) setSelectedEventId(null);

              refreshEvents();
            });
          },
        },
      ],
    );
  };

  if (roleLoading) {
    return (
      <View style={[styles.container, styles.content]}>
        <Text style={styles.subtitle}>Checking your account...</Text>
      </View>
    );
  }

  if (role !== "teacher") {
    return (
      <View style={[styles.container, styles.content]}>
        <Ionicons
          name="lock-closed-outline"
          size={40}
          color={COLORS.textSecondary}
        />

        <Text style={styles.title}>Teachers Only</Text>

        <Text style={styles.subtitle}>
          Only teacher accounts can create events.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Pressable
        style={styles.manageStudentsButton}
        onPress={() => router.push("/teacher/students")}
        accessibilityRole="button"
        accessibilityLabel="Manage student academic information"
      >
        <Ionicons
          name="people-outline"
          size={20}
          color={COLORS.textOnPrimary}
        />
        <Text style={styles.manageStudentsText}>Manage Students</Text>
        <Ionicons
          name="chevron-forward"
          size={18}
          color={COLORS.textOnPrimary}
        />
      </Pressable>

      <Text style={styles.title}>Create Event QR</Text>

      <Text style={styles.subtitle}>
        Fill in the event details, then scan the generated QR with the Scan tab.
      </Text>

      <Text style={styles.label}>Event Title</Text>

      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholder="e.g. Founders Day Assembly"
        placeholderTextColor={COLORS.textSecondary}
      />

      <Text style={styles.label}>Event Code</Text>

      <TextInput
        style={styles.input}
        value={eventId}
        onChangeText={setEventId}
        placeholder="e.g. EVT-2026-0002"
        placeholderTextColor={COLORS.textSecondary}
        autoCapitalize="characters"
      />

      <Text style={styles.label}>Attendance Purpose</Text>
      <TextInput
        style={styles.input}
        value={attendancePurpose}
        onChangeText={setAttendancePurpose}
        placeholder="e.g. Class Attendance, Seminar, Meeting"
        placeholderTextColor={COLORS.textSecondary}
      />

      <Text style={styles.label}>Starts</Text>

      {Platform.OS === "web" ? (
        <WebDateTimeInput value={startDate} onChange={setStartDate} />
      ) : (
        <PickerField
          value={formatDateTime(startDate)}
          icon="sunny-outline"
          onPress={() => openPicker("start")}
        />
      )}

      <Text style={styles.label}>Ends</Text>

      {Platform.OS === "web" ? (
        <WebDateTimeInput value={endDate} onChange={setEndDate} />
      ) : (
        <PickerField
          value={formatDateTime(endDate)}
          icon="moon-outline"
          onPress={() => openPicker("end")}
        />
      )}

      <View style={styles.chipRow}>
        {QUICK_END_OPTIONS.map((option) => (
          <Pressable
            key={option.label}
            style={styles.chip}
            onPress={() => handleQuickEnd(option.ms)}
          >
            <Text style={styles.chipText}>{option.label}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.hint}>
        Tap a chip to set the end time from start.
      </Text>

      <Text style={styles.sectionTitle}>Target Students</Text>
      <Text style={styles.hint}>
        Select the program, year level, and block this attendance is for.
      </Text>
      <AcademicSelect
        label="Program *"
        value={program}
        placeholder="Select program"
        options={PROGRAMS}
        onChange={setProgram}
      />
      <AcademicSelect
        label="Year Level *"
        value={yearLevel}
        placeholder="Select year level"
        options={YEAR_LEVELS}
        onChange={(value) => {
          setYearLevel(value);
          setBlock("");
        }}
      />
      <AcademicSelect
        label="Block *"
        value={block}
        placeholder={yearLevel ? "Select block" : "Select year level first"}
        disabled={!yearLevel}
        options={
          yearLevel
            ? BLOCKS.filter((item) =>
                item.startsWith(String(YEAR_LEVELS.indexOf(yearLevel) + 1)),
              )
            : []
        }
        onChange={setBlock}
      />

      <Text style={[styles.sectionTitle, styles.lateSectionTitle]}>
        Attendance Settings
      </Text>
      <Text style={styles.hint}>
        Choose when a student scan should be marked Late.
      </Text>

      <View style={styles.lateModeRow}>
        <Pressable
          style={[
            styles.lateModeButton,
            lateMode === "minutes" && styles.lateModeSelected,
          ]}
          onPress={() => setLateMode("minutes")}
          accessibilityRole="button"
          accessibilityState={{ selected: lateMode === "minutes" }}
        >
          <Text
            style={[
              styles.lateModeText,
              lateMode === "minutes" && styles.lateModeSelectedText,
            ]}
          >
            Minutes after start
          </Text>
        </Pressable>
        <Pressable
          style={[
            styles.lateModeButton,
            lateMode === "exact" && styles.lateModeSelected,
          ]}
          onPress={() => setLateMode("exact")}
          accessibilityRole="button"
          accessibilityState={{ selected: lateMode === "exact" }}
        >
          <Text
            style={[
              styles.lateModeText,
              lateMode === "exact" && styles.lateModeSelectedText,
            ]}
          >
            Exact cutoff time
          </Text>
        </Pressable>
      </View>

      {lateMode === "minutes" ? (
        <>
          <Text style={styles.label}>Grace Period</Text>
          <View style={styles.graceRow}>
            {GRACE_PERIODS.map((minutes) => (
              <Pressable
                key={minutes}
                style={[
                  styles.graceChip,
                  lateMinutes === minutes && styles.graceChipSelected,
                ]}
                onPress={() => setLateMinutes(minutes)}
                accessibilityRole="button"
                accessibilityState={{ selected: lateMinutes === minutes }}
              >
                <Text
                  style={[
                    styles.graceChipText,
                    lateMinutes === minutes && styles.graceChipSelectedText,
                  ]}
                >
                  {minutes} min
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.hint}>
            Late after{" "}
            {formatDateTime(
              new Date(startDate.getTime() + lateMinutes * 60000),
            )}
            .
          </Text>
        </>
      ) : (
        <>
          <Text style={styles.label}>Late After (HH:MM, 24-hour)</Text>
          <TextInput
            style={styles.input}
            value={lateCutoffTime}
            onChangeText={setLateCutoffTime}
            placeholder="e.g. 08:15"
            placeholderTextColor={COLORS.textSecondary}
            keyboardType="numbers-and-punctuation"
            maxLength={5}
            autoCapitalize="none"
          />
          <Text style={styles.hint}>
            Use the event's local time. The cutoff must be between Starts and
            Ends.
          </Text>
        </>
      )}

      {message && <Text style={styles.message}>{message}</Text>}

      {editingEvent ? (
        <View style={styles.editControls}>
          <AppButton
            theme="primary"
            title="Update Event"
            icon="checkmark-circle-outline"
            onPress={handleUpdateEvent}
          />

          <Pressable style={styles.cancelEditButton} onPress={handleCancelEdit}>
            <Text style={styles.cancelEditText}>Cancel Editing</Text>
          </Pressable>
        </View>
      ) : (
        <AppButton
          theme="primary"
          title="Create Event"
          icon="add-circle-outline"
          onPress={handleCreateEvent}
        />
      )}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Your Events</Text>

        {existingEvents.length > 0 && (
          <Text style={styles.sectionCount}>{existingEvents.length}</Text>
        )}
      </View>

      <Text style={styles.sectionHint}>
        Tap an event to show or hide its QR code.
      </Text>

      {existingLoading ? (
        <Text style={styles.subtitle}>Loading events...</Text>
      ) : existingEvents.length === 0 ? (
        <Text style={styles.subtitle}>No events created yet.</Text>
      ) : (
        <View>
          {existingEvents.map((ev) => (
            <View key={ev.id}>
              <View style={styles.existingCard}>
                <Pressable
                  style={styles.existingMain}
                  onPress={() => handleShowExisting(ev)}
                  accessibilityRole="button"
                  accessibilityLabel={`${ev.title}. ${selectedEventId === ev.id ? "Hide" : "Show"} QR code`}
                >
                  <Ionicons
                    name={
                      selectedEventId === ev.id ? "qr-code" : "qr-code-outline"
                    }
                    size={20}
                    color={COLORS.primary}
                  />

                  <View style={styles.existingInfo}>
                    <Text style={styles.existingTitle}>{ev.title}</Text>
                    <Text style={styles.existingCode}>
                      Target:{" "}
                      {[ev.program, ev.year_level, ev.block]
                        .filter(Boolean)
                        .join(" • ") || "Not assigned"}
                    </Text>
                    <Text style={styles.existingCode}>
                      Starts:{" "}
                      {ev.start_time
                        ? formatDateTime(new Date(ev.start_time))
                        : "Not set"}
                    </Text>
                    <Text style={styles.existingCode}>
                      Ends:{" "}
                      {ev.end_time
                        ? formatDateTime(new Date(ev.end_time))
                        : "Not set"}
                    </Text>
                  </View>
                </Pressable>

                <View style={styles.existingActions}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.actionButton,
                      pressed && styles.actionButtonPressed,
                    ]}
                    onPress={() => handleEditEvent(ev)}
                    accessibilityLabel={`Edit ${ev.title}`}
                  >
                    <Ionicons
                      name="pencil-outline"
                      size={18}
                      color={COLORS.primary}
                    />
                  </Pressable>

                  <Pressable
                    style={({ pressed }) => [
                      styles.actionButton,
                      styles.dangerButton,
                      pressed && styles.actionButtonPressed,
                    ]}
                    onPress={() => handleDeleteEvent(ev)}
                    accessibilityLabel={`Delete ${ev.title}`}
                  >
                    <Ionicons
                      name="trash-outline"
                      size={18}
                      color={COLORS.danger}
                    />
                  </Pressable>
                </View>
              </View>

              <Pressable
                style={styles.attendanceToggle}
                onPress={() => toggleEventAttendance(ev)}
                accessibilityRole="button"
                accessibilityLabel={`${attendanceEventId === ev.id ? "Hide" : "View"} attendance for ${ev.title}`}
              >
                <Ionicons
                  name="people-outline"
                  size={18}
                  color={COLORS.primary}
                />
                <Text style={styles.attendanceToggleText}>
                  {attendanceEventId === ev.id
                    ? "Hide Attendance"
                    : "View Attendance"}
                </Text>
                <Ionicons
                  name={
                    attendanceEventId === ev.id ? "chevron-up" : "chevron-down"
                  }
                  size={18}
                  color={COLORS.primary}
                />
              </Pressable>

              {attendanceEventId === ev.id && (
                <View style={styles.attendancePanel}>
                  <View style={styles.attendanceHeading}>
                    <Text style={styles.sectionTitle}>
                      Attendance — {ev.title}
                    </Text>
                    <Pressable
                      onPress={() => void loadEventAttendance(ev)}
                      accessibilityRole="button"
                      accessibilityLabel="Refresh attendance"
                    >
                      <Ionicons
                        name="refresh-outline"
                        size={21}
                        color={COLORS.primary}
                      />
                    </Pressable>
                  </View>
                  {attendanceLoading ? (
                    <Text style={styles.sectionHint}>
                      Loading attendance...
                    </Text>
                  ) : attendanceError ? (
                    <Text style={styles.attendanceNotice}>
                      {attendanceError}
                    </Text>
                  ) : (
                    <>
                      <View style={styles.statusGrid}>
                        {STATUS_FILTERS.map((filter) => {
                          const count = attendanceRows.filter(
                            (row) => row.status === filter.key,
                          ).length;
                          const selected = statusFilter === filter.key;
                          return (
                            <Pressable
                              key={filter.key}
                              onPress={() => setStatusFilter(filter.key)}
                              style={[
                                styles.statusButton,
                                selected && styles.statusButtonActive,
                              ]}
                              accessibilityRole="button"
                              accessibilityState={{ selected }}
                            >
                              <Text
                                style={[
                                  styles.statusCount,
                                  selected && styles.statusTextActive,
                                ]}
                              >
                                {count}
                              </Text>
                              <Text
                                style={[
                                  styles.statusLabel,
                                  selected && styles.statusTextActive,
                                ]}
                              >
                                {filter.label}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                      <Text style={styles.attendanceListTitle}>
                        {
                          STATUS_FILTERS.find(
                            (filter) => filter.key === statusFilter,
                          )?.label
                        }{" "}
                        Students
                      </Text>
                      {attendanceRows.filter(
                        (row) => row.status === statusFilter,
                      ).length === 0 ? (
                        <Text style={styles.sectionHint}>
                          No students in this category.
                        </Text>
                      ) : (
                        attendanceRows
                          .filter((row) => row.status === statusFilter)
                          .map((row) => (
                            <View
                              key={row.student.id}
                              style={styles.studentLine}
                            >
                              <View style={styles.studentLineInfo}>
                                <Text style={styles.studentLineName}>
                                  {row.student.full_name || "Unnamed student"}
                                </Text>
                                <Text style={styles.sectionHint}>
                                  {row.student.email || "No email"}
                                </Text>
                              </View>
                              <Text style={styles.studentLineTime}>
                                {row.scannedAt
                                  ? formatDateTime(new Date(row.scannedAt))
                                  : "No scan"}
                              </Text>
                            </View>
                          ))
                      )}
                      <Text style={styles.attendanceNote}>
                        Absent is finalized after the event ends. Pending
                        includes students with no scan before the end, or scans
                        whose Late cutoff is not configured.
                      </Text>
                    </>
                  )}
                </View>
              )}

              {selectedEventId === ev.id && (
                <View style={styles.resultCard}>
                  <Text style={styles.resultTitle}>{ev.title}</Text>
                  <Text style={styles.qrDetail}>
                    Target Students:{" "}
                    {[ev.program, ev.year_level, ev.block]
                      .filter(Boolean)
                      .join(" • ") || "Not assigned"}
                  </Text>
                  <Text style={styles.qrDetail}>
                    Starts:{" "}
                    {ev.start_time
                      ? formatDateTime(new Date(ev.start_time))
                      : "Not set"}
                  </Text>
                  <Text style={styles.qrDetail}>
                    Ends:{" "}
                    {ev.end_time
                      ? formatDateTime(new Date(ev.end_time))
                      : "Not set"}
                  </Text>
                  <View style={styles.qrBox}>
                    <QRCode
                      value={JSON.stringify({
                        v: 1,
                        event: ev.event_code,
                        title: ev.title,
                        start: ev.start_time ?? "",
                        end: ev.end_time ?? "",
                      })}
                      size={200}
                    />
                  </View>
                </View>
              )}
            </View>
          ))}
        </View>
      )}

      {editTarget && (
        <View style={styles.pickerContainer}>
          <DateTimePicker
            key={`${editTarget}-${editingPart}`}
            value={editTarget === "start" ? startDate : endDate}
            mode={isAndroid ? editingPart : "datetime"}
            display={isAndroid ? "default" : "spinner"}
            onChange={onPickerChange}
          />
        </View>
      )}
    </ScrollView>
  );
}

const webDateTimeStyle: CSSProperties = {
  width: "100%",
  backgroundColor: COLORS.card,
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: COLORS.border,
  borderRadius: 14,
  padding: "12px 14px",
  fontSize: 15,
  color: COLORS.textPrimary,
  boxSizing: "border-box",
  marginBottom: 8,
};

function WebDateTimeInput({
  value,
  onChange,
}: {
  value: Date;
  onChange: (date: Date) => void;
}) {
  return createElement("input", {
    type: "datetime-local",
    value: toDateTimeLocalValue(value),
    onChange: (e: ChangeEvent<HTMLInputElement>) => {
      const text = e.target.value;
      if (!text) return;

      const next = new Date(text);

      if (!Number.isNaN(next.getTime())) {
        onChange(next);
      }
    },
    style: webDateTimeStyle,
  });
}

type PickerFieldProps = {
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
};

function PickerField({ value, icon, onPress }: PickerFieldProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.pickerField,
        pressed && styles.pickerFieldPressed,
      ]}
      onPress={onPress}
    >
      <Ionicons name={icon} size={20} color={COLORS.primary} />

      <Text style={styles.pickerValue}>{value}</Text>

      <Ionicons
        name="calendar-outline"
        size={18}
        color={COLORS.textSecondary}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  manageStudentsButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 22,
  },
  manageStudentsText: {
    color: COLORS.textOnPrimary,
    fontWeight: "700",
    fontSize: 14,
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 40,
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.textPrimary,
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: COLORS.textPrimary,
  },
  pickerField: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
  },
  pickerFieldPressed: {
    backgroundColor: COLORS.surface,
  },
  pickerValue: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
    color: COLORS.textPrimary,
    marginHorizontal: 10,
  },
  chipRow: {
    flexDirection: "row",
    marginTop: 8,
  },
  chip: {
    backgroundColor: COLORS.surface,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginRight: 8,
  },
  chipText: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.primary,
  },
  hint: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 6,
  },
  pickerContainer: {
    marginTop: 12,
    alignItems: "center",
  },
  editControls: {
    marginTop: 4,
  },
  cancelEditButton: {
    marginTop: 12,
    alignItems: "center",
    paddingVertical: 8,
  },
  cancelEditText: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 28,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  sectionCount: {
    marginLeft: 10,
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.textOnPrimary,
    backgroundColor: COLORS.primary,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  sectionHint: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  existingCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 10,
  },
  existingMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  existingActions: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 8,
  },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.surface,
    marginLeft: 8,
  },
  actionButtonPressed: {
    opacity: 0.6,
  },
  dangerButton: {
    backgroundColor: COLORS.danger + "14",
  },
  existingInfo: {
    flex: 1,
    marginLeft: 10,
  },
  existingTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.textPrimary,
  },
  existingCode: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  message: {
    fontSize: 14,
    color: COLORS.primary,
    textAlign: "center",
    marginTop: 12,
  },
  lateSectionTitle: { marginTop: 22 },
  lateModeRow: { flexDirection: "row", marginTop: 12, marginBottom: 8, gap: 8 },
  lateModeButton: {
    flex: 1,
    paddingHorizontal: 9,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    backgroundColor: COLORS.card,
    alignItems: "center",
    justifyContent: "center",
  },
  lateModeSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  lateModeText: {
    color: COLORS.textPrimary,
    fontWeight: "600",
    fontSize: 12,
    textAlign: "center",
  },
  lateModeSelectedText: { color: COLORS.textOnPrimary },
  graceRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 8, gap: 8 },
  graceChip: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  graceChipSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  graceChipText: { fontSize: 13, fontWeight: "600", color: COLORS.textPrimary },
  graceChipSelectedText: { color: COLORS.textOnPrimary },
  attendanceToggle: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 12,
    borderRadius: 12,
  },
  attendanceToggleText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: "700",
  },
  attendancePanel: {
    backgroundColor: COLORS.card,
    padding: 14,
    borderRadius: 14,
    marginTop: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  attendanceHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  attendanceNotice: { color: COLORS.danger, fontSize: 12, lineHeight: 19 },
  statusGrid: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  statusButton: {
    flexGrow: 1,
    flexBasis: "22%",
    backgroundColor: COLORS.background,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statusButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  statusCount: { fontSize: 21, fontWeight: "800", color: COLORS.textPrimary },
  statusLabel: { fontSize: 10, fontWeight: "700", color: COLORS.textSecondary },
  statusTextActive: { color: COLORS.textOnPrimary },
  attendanceListTitle: {
    marginTop: 16,
    marginBottom: 8,
    color: COLORS.textPrimary,
    fontWeight: "700",
    fontSize: 14,
  },
  studentLine: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  studentLineInfo: { flex: 1 },
  studentLineName: {
    color: COLORS.textPrimary,
    fontWeight: "700",
    fontSize: 13,
  },
  studentLineTime: {
    color: COLORS.textSecondary,
    fontSize: 11,
    maxWidth: 120,
    textAlign: "right",
  },
  attendanceNote: {
    color: COLORS.textSecondary,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 12,
  },
  resultCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 16,
    marginTop: 20,
    alignItems: "center",
    shadowColor: COLORS.shadow,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  resultTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.textPrimary,
    textAlign: "center",
    marginBottom: 12,
  },
  qrBox: {
    backgroundColor: "#FFFFFF",
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
    marginTop: 12,
  },
  qrDetail: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginBottom: 8,
  },
});
