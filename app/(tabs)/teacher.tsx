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
import { useFocusEffect } from "expo-router";
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
import { COLORS } from "@/constants/colors";
import { useAuth } from "@/lib/auth";
import {
  createEvent,
  deleteEvent,
  getEventsByTeacher,
  updateEvent,
  type CloudEvent,
} from "@/lib/events";
import { getProfile, type Role } from "@/lib/profile";
import { buildQRPayload } from "@/lib/qr";

function toLocalISO(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:00`
  );
}

function formatDateTime(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const month = date.toLocaleString("en-US", { month: "short" });

  return `${month} ${pad(date.getDate())}, ${date.getFullYear()} at ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function parseTypedDateTime(dateText: string, timeText: string) {
  const dateMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(dateText.trim());
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(timeText.trim());

  if (!dateMatch || !timeMatch) return null;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]) - 1;
  const day = Number(dateMatch[3]);
  const hours = Number(timeMatch[1]);
  const minutes = Number(timeMatch[2]);

  if (month < 0 || month > 11 || day < 1 || day > 31) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

  const date = new Date(year, month, day, hours, minutes, 0, 0);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

const QUICK_END_OPTIONS = [
  { label: "+30 min", ms: 30 * 60 * 1000 },
  { label: "+1 hour", ms: 60 * 60 * 1000 },
  { label: "+2 hours", ms: 2 * 60 * 60 * 1000 },
];

type EditTarget = "start" | "end";

export default function TeacherScreen() {
  const { user } = useAuth();

  const [role, setRole] = useState<Role | null>(null);
  const [roleLoading, setRoleLoading] = useState(true);

  const [title, setTitle] = useState("");
  const [eventId, setEventId] = useState("");
  const [startDate, setStartDate] = useState(() => new Date());
  const [endDate, setEndDate] = useState(
    () => new Date(Date.now() + 60 * 60 * 1000),
  );
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [editingPart, setEditingPart] = useState<"date" | "time">("date");
  const [payload, setPayload] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [existingEvents, setExistingEvents] = useState<CloudEvent[]>([]);
  const [existingLoading, setExistingLoading] = useState(true);

  const [startDateText, setStartDateText] = useState("");
  const [startTimeText, setStartTimeText] = useState("");
  const [endDateText, setEndDateText] = useState("");
  const [endTimeText, setEndTimeText] = useState("");
  const [editingEvent, setEditingEvent] = useState<CloudEvent | null>(null);

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

    next.setFullYear(
      selected.getFullYear(),
      selected.getMonth(),
      selected.getDate(),
    );

    next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);

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
    };

    if (!event.eventId || !event.title) {
      setMessage("Event title and code are required.");
      return;
    }

    if (endDate.getTime() <= startDate.getTime()) {
      setMessage("End time must be after start time.");
      return;
    }

    createEvent(event).then(({ error }) => {
      if (error) {
        setMessage("Could not save the event. Please try again.");
        return;
      }

      setMessage("Event saved! Scan the QR with the Scan tab to test it.");

      setPayload(buildQRPayload(event));

      if (user) {
        getEventsByTeacher(user.id).then((events) => {
          setExistingEvents(events);
          setExistingLoading(false);
        });
      }
    });
  };

  const handleShowExisting = (ev: CloudEvent) => {
    setMessage("Showing QR for an existing event:");

    setPayload(
      buildQRPayload({
        eventId: ev.event_code,
        title: ev.title,
        start: ev.start_time ?? "",
        end: ev.end_time ?? "",
      }),
    );
  };

  const refreshEvents = () => {
    if (!user) return;

    getEventsByTeacher(user.id).then((events) => {
      setExistingEvents(events);
      setExistingLoading(false);
    });
  };

  const applyTypedTime = () => {
    const start = parseTypedDateTime(startDateText, startTimeText);
    const end = parseTypedDateTime(endDateText, endTimeText);

    if (!start || !end) {
      setMessage("Use YYYY-MM-DD for date and HH:MM for time.");
      return;
    }

    if (end.getTime() <= start.getTime()) {
      setMessage("End time must be after start time.");
      return;
    }

    setStartDate(start);
    setEndDate(end);
    setMessage("Date and time set from the fields above.");
  };

  const handleEditEvent = (ev: CloudEvent) => {
    setMessage(`Editing "${ev.title}". Change the details below.`);

    setEditingEvent(ev);
    setTitle(ev.title);
    setEventId(ev.event_code);

    if (ev.start_time) setStartDate(new Date(ev.start_time));
    if (ev.end_time) setEndDate(new Date(ev.end_time));

    setPayload(null);
  };

  const handleCancelEdit = () => {
    setMessage(null);

    setEditingEvent(null);
    setTitle("");
    setEventId("");
  };

  const handleUpdateEvent = () => {
    if (!editingEvent) return;

    const event = {
      eventId: eventId.trim(),
      title: title.trim(),
      start: toLocalISO(startDate),
      end: toLocalISO(endDate),
    };

    if (!event.eventId || !event.title) {
      setMessage("Event title and code are required.");
      return;
    }

    if (endDate.getTime() <= startDate.getTime()) {
      setMessage("End time must be after start time.");
      return;
    }

    updateEvent(editingEvent.id, {
      event_code: event.eventId,
      title: event.title,
      start_time: event.start,
      end_time: event.end,
    }).then(({ error }) => {
      if (error) {
        setMessage("Could not update the event. Please try again.");
        return;
      }

      setMessage("Event updated! The QR below is the updated one.");

      setEditingEvent(null);
      setPayload(buildQRPayload(event));
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

              if (editingEvent?.id === ev.id) {
                setEditingEvent(null);
                setPayload(null);
              }

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

      <Text style={styles.label}>Or type the date & time manually</Text>

      <Text style={styles.fieldLabel}>Start Date (YYYY-MM-DD)</Text>

      <TextInput
        style={styles.input}
        value={startDateText}
        onChangeText={setStartDateText}
        placeholder="e.g. 2026-10-05"
        placeholderTextColor={COLORS.textSecondary}
        autoCapitalize="none"
      />

      <Text style={styles.fieldLabel}>Start Time (HH:MM)</Text>

      <TextInput
        style={styles.input}
        value={startTimeText}
        onChangeText={setStartTimeText}
        placeholder="e.g. 09:00"
        placeholderTextColor={COLORS.textSecondary}
        autoCapitalize="none"
        keyboardType="numbers-and-punctuation"
      />

      <Text style={styles.fieldLabel}>End Date (YYYY-MM-DD)</Text>

      <TextInput
        style={styles.input}
        value={endDateText}
        onChangeText={setEndDateText}
        placeholder="e.g. 2026-10-05"
        placeholderTextColor={COLORS.textSecondary}
        autoCapitalize="none"
      />

      <Text style={styles.fieldLabel}>End Time (HH:MM)</Text>

      <TextInput
        style={styles.input}
        value={endTimeText}
        onChangeText={setEndTimeText}
        placeholder="e.g. 11:00"
        placeholderTextColor={COLORS.textSecondary}
        autoCapitalize="none"
        keyboardType="numbers-and-punctuation"
      />

      <AppButton
        title="Apply Typed Date & Time"
        icon="checkmark-circle-outline"
        onPress={applyTypedTime}
      />

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

      {message && <Text style={styles.message}>{message}</Text>}

      {editingEvent ? (
        <View style={styles.editControls}>
          <AppButton
            theme="primary"
            title="Update Event"
            icon="checkmark-circle-outline"
            onPress={handleUpdateEvent}
          />

          <Pressable
            style={styles.cancelEditButton}
            onPress={handleCancelEdit}
          >
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
        Tap an existing event to show its QR code again.
      </Text>

      {existingLoading ? (
        <Text style={styles.subtitle}>Loading events...</Text>
      ) : existingEvents.length === 0 ? (
        <Text style={styles.subtitle}>No events created yet.</Text>
      ) : (
        <View>
          {existingEvents.map((ev) => (
            <View key={ev.id} style={styles.existingCard}>
              <Pressable
                style={styles.existingMain}
                onPress={() => handleShowExisting(ev)}
              >
                <Ionicons
                  name="qr-code-outline"
                  size={20}
                  color={COLORS.primary}
                />

                <View style={styles.existingInfo}>
                  <Text style={styles.existingTitle}>{ev.title}</Text>

                  <Text style={styles.existingCode}>
                    {ev.event_code}
                    {ev.start_time
                      ? `  •  ${formatDateTime(new Date(ev.start_time))}`
                      : ""}
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
                >
                  <Ionicons
                    name="trash-outline"
                    size={18}
                    color={COLORS.danger}
                  />
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      )}

      {editTarget && (
        <View style={styles.pickerContainer}>
          <DateTimePicker
            value={editTarget === "start" ? startDate : endDate}
            mode={isAndroid ? editingPart : "datetime"}
            display={isAndroid ? "default" : "spinner"}
            onChange={onPickerChange}
          />
        </View>
      )}

      {payload && (
        <View style={styles.resultCard}>
          <Text style={styles.resultTitle}>
            Scan this QR code with the Scan tab:
          </Text>

          <View style={styles.qrBox}>
            <QRCode value={payload} size={200} />
          </View>

          <Text style={styles.payloadText}>{payload}</Text>
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
    value: toLocalISO(value).slice(0, 16),
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
  fieldLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.textSecondary,
    marginBottom: 4,
    marginTop: 12,
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
  },
  payloadText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: "center",
    lineHeight: 16,
  },
});
