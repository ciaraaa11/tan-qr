import { useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";

type AcademicSelectProps = {
  label: string;
  placeholder: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  disabled?: boolean;
};

export default function AcademicSelect({
  label,
  placeholder,
  value,
  options,
  onChange,
  disabled = false,
}: AcademicSelectProps) {
  const [visible, setVisible] = useState(false);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>

      <Pressable
        style={[styles.select, disabled && styles.disabled]}
        onPress={() => setVisible(true)}
        disabled={disabled}
      >
        <Text style={[styles.value, !value && styles.placeholder]}>
          {value || placeholder}
        </Text>

        <Ionicons name="chevron-down" size={20} color={COLORS.textSecondary} />
      </Pressable>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>{label}</Text>

            <FlatList
              data={options}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.option}
                  onPress={() => {
                    onChange(item);
                    setVisible(false);
                  }}
                >
                  <Text style={styles.optionText}>{item}</Text>
                  {value === item && (
                    <Ionicons
                      name="checkmark"
                      size={20}
                      color={COLORS.primary}
                    />
                  )}
                </Pressable>
              )}
            />

            <Pressable
              style={styles.closeButton}
              onPress={() => setVisible(false)}
            >
              <Text style={styles.closeText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  select: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 13,
    paddingHorizontal: 14,
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  disabled: {
    opacity: 0.5,
  },
  value: {
    flex: 1,
    fontSize: 14,
    color: COLORS.textPrimary,
  },
  placeholder: {
    color: COLORS.textSecondary,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(34, 34, 59, 0.5)",
    justifyContent: "center",
    padding: 24,
  },
  modal: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 18,
    maxHeight: "75%",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: COLORS.textPrimary,
    marginBottom: 12,
  },
  option: {
    paddingVertical: 15,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.background,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  optionText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.textPrimary,
  },
  closeButton: {
    marginTop: 14,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: COLORS.background,
    borderRadius: 12,
  },
  closeText: {
    color: COLORS.primary,
    fontWeight: "700",
  },
});
