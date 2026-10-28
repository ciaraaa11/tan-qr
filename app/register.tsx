import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Link, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AppButton from "@/components/AppButton";
import { AuthDecor } from "@/components/AuthDecor";
import Header from "@/components/Header";
import { COLORS } from "@/constants/colors";
import { signUp } from "@/lib/auth";
import AcademicSelect from "@/components/AcademicSelect";
import { PROGRAMS, YEAR_LEVELS, BLOCKS } from "@/constants/academic";

export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmPasswordRef = useRef<TextInput>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () =>
      setKeyboardVisible(true),
    );
    const hide = Keyboard.addListener("keyboardDidHide", () =>
      setKeyboardVisible(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const scrollToFormField = (field: "email" | "password" | "confirm") => {
    // Allow Android to finish resizing the viewport before scrolling.
    setTimeout(() => {
      if (field === "email") {
        scrollRef.current?.scrollTo({ y: 240, animated: true });
      } else {
        scrollRef.current?.scrollToEnd({ animated: true });
      }
    }, 150);
  };

  const [fullName, setFullName] = useState("");
  const [program, setProgram] = useState("");
  const [yearLevel, setYearLevel] = useState("");
  const [block, setBlock] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (loading) return;
    Keyboard.dismiss();
    setError(null);

    if (
      !email.trim() ||
      !fullName.trim() ||
      !password ||
      !confirmPassword ||
      !program ||
      !yearLevel ||
      !block
    ) {
      setError("All fields are required.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    try {
      const { data, error: authError } = await signUp(email.trim(), password, {
        full_name: fullName.trim(),
        program: program,
        year_level: yearLevel,
        block: block,
      });

      if (authError) {
        setError(authError.message);
      } else if (data.session) {
        router.replace("/(tabs)");
      } else {
        setSuccess(true);
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <AuthDecor />
      <View pointerEvents="none" style={styles.topAccent} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[
            styles.scroll,
            keyboardVisible && styles.scrollWithKeyboard,
            { paddingBottom: Math.max(32, insets.bottom + 20) },
          ]}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="none"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            <View style={styles.header}>
              <Header title="QR Attendance" />
              <View style={styles.intro}>
                <Text style={styles.eyebrow}>JOIN TAN-QR</Text>
                <Text style={styles.title}>Create an account</Text>
                <Text style={styles.subtitle}>
                  Register as a student to get started.
                </Text>
              </View>
            </View>

            {success ? (
              <View style={[styles.card, styles.successCard]}>
                <View style={styles.successIcon}>
                  <Ionicons
                    name="mail-open-outline"
                    size={29}
                    color={COLORS.primary}
                  />
                </View>
                <Text style={styles.successTitle}>Check your email!</Text>
                <Text style={styles.successText}>
                  We sent a confirmation link to {email}. Verify your account,
                  then come back and sign in.
                </Text>
                <Link href="/login" style={styles.successLink}>
                  Back to Sign In
                </Link>
              </View>
            ) : (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Student registration</Text>
                <Text style={styles.cardSubtitle}>
                  Fill in the details below to create your account.
                </Text>

                <Text style={styles.label}>Full name</Text>
                <View style={styles.inputWrap}>
                  <Ionicons
                    name="person-outline"
                    size={19}
                    color={COLORS.textSecondary}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Enter your full name"
                    placeholderTextColor={COLORS.textSecondary}
                    value={fullName}
                    onChangeText={setFullName}
                    returnKeyType="next"
                    onSubmitEditing={() => emailRef.current?.focus()}
                    editable={!loading}
                    textContentType="name"
                    autoCapitalize="words"
                    accessibilityLabel="Full name"
                  />
                </View>

                <AcademicSelect
                  label="Program *"
                  value={program}
                  placeholder="Select your program"
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
                  placeholder={
                    yearLevel ? "Select your block" : "Select year level first"
                  }
                  options={
                    yearLevel
                      ? BLOCKS.filter((item) =>
                          item.startsWith(
                            String(YEAR_LEVELS.indexOf(yearLevel) + 1),
                          ),
                        )
                      : []
                  }
                  disabled={!yearLevel}
                  onChange={setBlock}
                />

                <Text style={styles.label}>Email address</Text>
                <View style={styles.inputWrap}>
                  <Ionicons
                    name="mail-outline"
                    size={19}
                    color={COLORS.textSecondary}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="your.email@school.edu"
                    placeholderTextColor={COLORS.textSecondary}
                    ref={emailRef}
                    value={email}
                    onChangeText={setEmail}
                    returnKeyType="next"
                    onFocus={() => scrollToFormField("email")}
                    onSubmitEditing={() => passwordRef.current?.focus()}
                    editable={!loading}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    textContentType="emailAddress"
                    autoComplete="email"
                    accessibilityLabel="Email address"
                  />
                </View>

                <Text style={styles.label}>Password</Text>
                <View style={styles.inputWrap}>
                  <Ionicons
                    name="lock-closed-outline"
                    size={19}
                    color={COLORS.textSecondary}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="At least 6 characters"
                    placeholderTextColor={COLORS.textSecondary}
                    ref={passwordRef}
                    value={password}
                    onChangeText={setPassword}
                    returnKeyType="next"
                    onFocus={() => scrollToFormField("password")}
                    onSubmitEditing={() => confirmPasswordRef.current?.focus()}
                    secureTextEntry={!showPassword}
                    editable={!loading}
                    autoCapitalize="none"
                    textContentType="newPassword"
                    autoComplete="new-password"
                    accessibilityLabel="Password"
                  />
                  <Pressable
                    onPress={() => setShowPassword((previous) => !previous)}
                    accessibilityRole="button"
                    accessibilityLabel={
                      showPassword ? "Hide password" : "Show password"
                    }
                    hitSlop={10}
                    style={styles.eyeButton}
                  >
                    <Ionicons
                      name={showPassword ? "eye-off-outline" : "eye-outline"}
                      size={21}
                      color={COLORS.textSecondary}
                    />
                  </Pressable>
                </View>

                <Text style={styles.label}>Confirm password</Text>
                <View style={styles.inputWrap}>
                  <Ionicons
                    name="shield-checkmark-outline"
                    size={19}
                    color={COLORS.textSecondary}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Re-enter your password"
                    placeholderTextColor={COLORS.textSecondary}
                    ref={confirmPasswordRef}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    returnKeyType="done"
                    onFocus={() => scrollToFormField("confirm")}
                    onSubmitEditing={Keyboard.dismiss}
                    secureTextEntry={!showConfirmPassword}
                    editable={!loading}
                    autoCapitalize="none"
                    textContentType="newPassword"
                    accessibilityLabel="Confirm password"
                  />
                  <Pressable
                    onPress={() =>
                      setShowConfirmPassword((previous) => !previous)
                    }
                    accessibilityRole="button"
                    accessibilityLabel={
                      showConfirmPassword
                        ? "Hide confirm password"
                        : "Show confirm password"
                    }
                    hitSlop={10}
                    style={styles.eyeButton}
                  >
                    <Ionicons
                      name={
                        showConfirmPassword ? "eye-off-outline" : "eye-outline"
                      }
                      size={21}
                      color={COLORS.textSecondary}
                    />
                  </Pressable>
                </View>

                {error ? (
                  <View style={styles.errorBox}>
                    <Ionicons
                      name="alert-circle-outline"
                      size={17}
                      color={COLORS.danger}
                    />
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                ) : null}

                <View style={styles.buttonWrap}>
                  {loading ? (
                    <ActivityIndicator
                      size="large"
                      color={COLORS.primary}
                      style={styles.loader}
                    />
                  ) : (
                    <AppButton
                      theme="primary"
                      title="Sign Up"
                      icon="person-add-outline"
                      onPress={handleRegister}
                    />
                  )}
                </View>
              </View>
            )}

            {!success && (
              <View style={styles.bottomRow}>
                <Text style={styles.bottomText}>Already have an account? </Text>
                <Link href="/login" style={styles.link}>
                  Sign In
                </Link>
              </View>
            )}
            <Text style={styles.footer}>Secure attendance starts here</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, zIndex: 1 },
  screen: { flex: 1, backgroundColor: COLORS.background, overflow: "hidden" },
  topAccent: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 9,
    backgroundColor: COLORS.primary,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 22,
    paddingTop: 24,
  },
  scrollWithKeyboard: { justifyContent: "flex-start" },
  content: { width: "100%", maxWidth: 430, alignSelf: "center" },
  header: { alignItems: "center", marginBottom: 20 },
  intro: { alignItems: "center", marginTop: 7, paddingHorizontal: 10 },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: "800",
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: COLORS.textPrimary,
    textAlign: "center",
  },
  subtitle: {
    marginTop: 7,
    fontSize: 14,
    lineHeight: 22,
    color: COLORS.textSecondary,
    textAlign: "center",
  },
  card: {
    backgroundColor: "rgba(255, 255, 255, 0.96)",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.98)",
    padding: 20,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.09,
    shadowRadius: 14,
    elevation: 3,
  },
  cardTitle: { color: COLORS.textPrimary, fontSize: 18, fontWeight: "800" },
  cardSubtitle: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 4,
    marginBottom: 20,
  },
  label: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 7,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 52,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 13,
    backgroundColor: COLORS.card,
    paddingHorizontal: 13,
    marginBottom: 15,
    gap: 10,
  },
  input: {
    flex: 1,
    minWidth: 0,
    color: COLORS.textPrimary,
    fontSize: 15,
    paddingVertical: 10,
  },
  eyeButton: { padding: 4 },
  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
    marginTop: 0,
    marginBottom: 6,
  },
  errorText: { color: COLORS.danger, fontSize: 12, lineHeight: 18, flex: 1 },
  buttonWrap: { marginTop: 10 },
  loader: { paddingVertical: 11 },
  bottomRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 22,
  },
  bottomText: { color: COLORS.textSecondary, fontSize: 14 },
  link: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: "800",
    paddingVertical: 8,
  },
  footer: {
    color: COLORS.textSecondary,
    textAlign: "center",
    fontSize: 11,
    marginTop: 12,
  },
  successCard: { alignItems: "center", paddingVertical: 28 },
  successIcon: {
    backgroundColor: COLORS.background,
    padding: 16,
    borderRadius: 20,
    marginBottom: 14,
  },
  successTitle: { fontSize: 20, fontWeight: "800", color: COLORS.textPrimary },
  successText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 22,
    textAlign: "center",
    marginTop: 10,
    marginBottom: 18,
  },
  successLink: {
    fontSize: 14,
    fontWeight: "800",
    color: COLORS.primary,
    paddingVertical: 10,
  },
});
