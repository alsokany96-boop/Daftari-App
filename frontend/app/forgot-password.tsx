import { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Linking,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, whatsappUrl } from "@/src/utils/api";
import { useSession } from "@/src/ctx/SessionProvider";
import { useColors, ThemeColors } from "@/src/theme";

export default function ForgotPasswordScreen() {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { config } = useSession();

  const [step, setStep] = useState<1 | 2>(1);
  const [username, setUsername] = useState("");
  const [code, setCode] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const adminWa = config?.admin_whatsapp || "218926609606";
  const adminPhone = config?.admin_phone || "0926609606";

  const requestCode = async () => {
    if (!username.trim()) {
      setError("الرجاء إدخال اسم المستخدم");
      return;
    }
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      await api.forgotPin(username.trim());
      setStep(2);
      setInfo("تم إنشاء رمز التحقق. تواصل مع المشرف للحصول عليه.");
    } catch (e: any) {
      setError(e?.message || "فشل الطلب");
    } finally {
      setLoading(false);
    }
  };

  const contactAdmin = () => {
    const message = `مرحباً، أنا نسيت كلمة المرور لحسابي في تطبيق دفتري.
- اسم المستخدم: ${username.trim() || "..."}
أرجو إرسال رمز التحقق الجديد.`;
    Linking.openURL(whatsappUrl(adminWa, message)).catch(() => {});
  };

  const submitReset = async () => {
    if (!code.trim()) {
      setError("الرجاء إدخال رمز التحقق");
      return;
    }
    if (newPass.length < 4) {
      setError("كلمة المرور يجب أن تكون 4 أحرف على الأقل");
      return;
    }
    if (newPass !== confirmPass) {
      setError("تأكيد كلمة المرور لا يطابق الجديدة");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await api.resetPin(username.trim(), code.trim(), newPass);
      setInfo("تم تحديث كلمة المرور. يمكنك تسجيل الدخول الآن.");
      setTimeout(() => router.replace("/sign-in"), 1500);
    } catch (e: any) {
      setError(e?.message || "فشل التحديث");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity
          testID="forgot-back-button"
          style={styles.backBtn}
          onPress={() => (step === 2 ? setStep(1) : router.back())}
          hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
        >
          <Ionicons name="arrow-forward" size={24} color={colors.textMain} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>استعادة كلمة المرور</Text>
        <View style={{ width: 44 }} />
      </View>

      <KeyboardAwareScrollView contentContainerStyle={styles.container} bottomOffset={20}>
        <View style={styles.iconBox}>
          <Ionicons name="key" size={44} color={colors.white} />
        </View>

        {step === 1 && (
          <>
            <Text style={styles.title}>الخطوة 1 من 2</Text>
            <Text style={styles.subtitle}>
              أدخل اسم المستخدم لطلب رمز تحقق آمن مدته 15 دقيقة. سنعرض عليك زر واتساب لطلب الرمز من المشرف.
            </Text>

            <Text style={styles.label}>اسم المستخدم *</Text>
            <TextInput
              testID="forgot-username-input"
              style={styles.input}
              value={username}
              onChangeText={setUsername}
              placeholder="اسم المستخدم"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              textAlign="right"
            />

            {error && <Text style={styles.error} testID="forgot-error">{error}</Text>}

            <TouchableOpacity
              testID="forgot-request-code"
              style={[styles.primaryBtn, loading && { opacity: 0.7 }]}
              onPress={requestCode}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? <ActivityIndicator color={colors.primaryText} /> : <Text style={styles.primaryText}>طلب رمز التحقق</Text>}
            </TouchableOpacity>
          </>
        )}

        {step === 2 && (
          <>
            <Text style={styles.title}>الخطوة 2 من 2</Text>
            <Text style={styles.subtitle}>
              تم إنشاء رمز تحقق مؤقت. اضغط زر الواتساب أدناه للتواصل مع المشرف، سيرسل لك المشرف رمز التحقق الخاص بحسابك، ثم أدخله هنا واختر كلمة مرور جديدة.
            </Text>

            <TouchableOpacity
              testID="forgot-whatsapp-button"
              style={styles.waBtn}
              onPress={contactAdmin}
              activeOpacity={0.85}
            >
              <Ionicons name="logo-whatsapp" size={20} color={colors.white} />
              <Text style={styles.waText}>تواصل مع المشرف ({adminPhone})</Text>
            </TouchableOpacity>

            <Text style={styles.label}>رمز التحقق *</Text>
            <TextInput
              testID="reset-code-input"
              style={styles.input}
              value={code}
              onChangeText={setCode}
              placeholder="6 أرقام"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              textAlign="center"
              maxLength={8}
            />

            <Text style={styles.label}>كلمة المرور الجديدة *</Text>
            <TextInput
              testID="reset-new-pass"
              style={styles.input}
              value={newPass}
              onChangeText={setNewPass}
              placeholder="4 أحرف على الأقل"
              placeholderTextColor={colors.textMuted}
              secureTextEntry
              textAlign="right"
            />

            <Text style={styles.label}>تأكيد كلمة المرور *</Text>
            <TextInput
              testID="reset-confirm-pass"
              style={styles.input}
              value={confirmPass}
              onChangeText={setConfirmPass}
              placeholder="أعد الإدخال"
              placeholderTextColor={colors.textMuted}
              secureTextEntry
              textAlign="right"
            />

            {error && <Text style={styles.error} testID="reset-error">{error}</Text>}
            {info && <Text style={styles.success} testID="reset-success">{info}</Text>}

            <TouchableOpacity
              testID="reset-submit"
              style={[styles.primaryBtn, loading && { opacity: 0.7 }]}
              onPress={submitReset}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? <ActivityIndicator color={colors.primaryText} /> : <Text style={styles.primaryText}>حفظ كلمة المرور الجديدة</Text>}
            </TouchableOpacity>
          </>
        )}
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { width: 44, height: 44, justifyContent: "center", alignItems: "center" },
  headerTitle: { fontSize: 18, fontWeight: "800", color: colors.textMain },
  container: { padding: 24 },
  iconBox: {
    width: 84,
    height: 84,
    borderRadius: 24,
    backgroundColor: colors.debtRed,
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "center",
    marginBottom: 8,
  },
  title: { fontSize: 20, fontWeight: "900", color: colors.textMain, marginTop: 16, textAlign: "center" },
  subtitle: { fontSize: 14, color: colors.textMuted, textAlign: "center", marginTop: 8, lineHeight: 22 },
  label: { fontSize: 14, fontWeight: "700", color: colors.textMain, marginTop: 16, marginBottom: 6, textAlign: "right" },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.textMain,
    backgroundColor: colors.surface,
  },
  error: { color: colors.debtRed, marginTop: 12, fontWeight: "700", textAlign: "right" },
  success: { color: colors.paymentGreen, marginTop: 12, fontWeight: "700", textAlign: "right" },
  primaryBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 20,
  },
  primaryText: { color: colors.primaryText, fontSize: 17, fontWeight: "800" },
  waBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: colors.whatsapp,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 18,
  },
  waText: { color: colors.white, fontSize: 15, fontWeight: "800" },
});
