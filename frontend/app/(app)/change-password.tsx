import { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/utils/api";
import { useSession } from "@/src/ctx/SessionProvider";
import { useColors, ThemeColors } from "@/src/theme";

export default function ChangePasswordScreen() {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { user } = useSession();
  const isEmployee = user?.role === "employee";

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const submit = async () => {
    if (!current || !next || !confirmPw) {
      setError("الرجاء تعبئة جميع الحقول");
      return;
    }
    if (isEmployee && !verificationCode.trim()) {
      setError("مطلوب رمز موافقة المالك");
      return;
    }
    if (next.length < 4) {
      setError("كلمة المرور الجديدة يجب أن تكون 4 أحرف على الأقل");
      return;
    }
    if (next !== confirmPw) {
      setError("تأكيد كلمة المرور لا يطابق الجديدة");
      return;
    }
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      await api.changePassword(current, next, isEmployee ? verificationCode.trim() : undefined);
      setSuccess("تم تحديث كلمة المرور بنجاح");
      setCurrent("");
      setNext("");
      setConfirmPw("");
      setVerificationCode("");
      setTimeout(() => router.back(), 1500);
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
          testID="change-pw-back"
          style={styles.iconBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
        >
          <Ionicons name="arrow-forward" size={24} color={colors.textMain} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>تغيير كلمة المرور</Text>
        <View style={{ width: 44 }} />
      </View>

      <KeyboardAwareScrollView contentContainerStyle={styles.container} bottomOffset={20}>
        <View style={styles.iconBox}>
          <Ionicons name="lock-closed" size={40} color={colors.white} />
        </View>

        <Text style={styles.label}>كلمة المرور الحالية *</Text>
        <TextInput
          testID="change-pw-current"
          style={styles.input}
          value={current}
          onChangeText={setCurrent}
          placeholder="أدخل كلمة المرور الحالية"
          placeholderTextColor={colors.textMuted}
          secureTextEntry
          textAlign="right"
        />

        <Text style={styles.label}>كلمة المرور الجديدة *</Text>
        <TextInput
          testID="change-pw-new"
          style={styles.input}
          value={next}
          onChangeText={setNext}
          placeholder="4 أحرف على الأقل"
          placeholderTextColor={colors.textMuted}
          secureTextEntry
          textAlign="right"
        />

        <Text style={styles.label}>تأكيد كلمة المرور الجديدة *</Text>
        <TextInput
          testID="change-pw-confirm"
          style={styles.input}
          value={confirmPw}
          onChangeText={setConfirmPw}
          placeholder="أعد إدخال كلمة المرور الجديدة"
          placeholderTextColor={colors.textMuted}
          secureTextEntry
          textAlign="right"
        />

        {isEmployee && (
          <>
            <Text style={styles.label}>رمز موافقة المالك *</Text>
            <TextInput
              testID="change-pw-vc"
              style={styles.input}
              value={verificationCode}
              onChangeText={setVerificationCode}
              placeholder="6 أرقام من المالك"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              maxLength={8}
              textAlign="center"
            />
            <Text style={styles.hint} testID="change-pw-employee-hint">
              يتطلب حسابك رمز موافقة من المالك. اطلب من المالك توليد الرمز من قسم رمز موافقة الموظف.
            </Text>
          </>
        )}

        {error && (
          <Text style={styles.error} testID="change-pw-error">{error}</Text>
        )}
        {success && (
          <Text style={styles.success} testID="change-pw-success">{success}</Text>
        )}

        <TouchableOpacity
          testID="change-pw-submit"
          style={[styles.submitBtn, loading && { opacity: 0.7 }]}
          onPress={submit}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.submitText}>حفظ كلمة المرور</Text>
          )}
        </TouchableOpacity>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
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
    iconBtn: { width: 44, height: 44, justifyContent: "center", alignItems: "center" },
    headerTitle: { fontSize: 18, fontWeight: "800", color: colors.textMain },
    container: { padding: 24 },
    iconBox: {
      width: 80,
      height: 80,
      borderRadius: 22,
      backgroundColor: colors.debtRed,
      justifyContent: "center",
      alignItems: "center",
      alignSelf: "center",
      marginBottom: 12,
    },
    label: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.textMain,
      marginTop: 16,
      marginBottom: 6,
      textAlign: "right",
    },
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
    error: { color: colors.debtRed, marginTop: 14, textAlign: "right", fontWeight: "700" },
    success: { color: colors.paymentGreen, marginTop: 14, textAlign: "right", fontWeight: "700" },
    hint: { color: colors.textMuted, fontSize: 12, marginTop: 8, textAlign: "right", lineHeight: 20 },
    submitBtn: {
      backgroundColor: colors.primary,
      paddingVertical: 16,
      borderRadius: 14,
      alignItems: "center",
      marginTop: 26,
    },
    submitText: { color: colors.primaryText, fontSize: 17, fontWeight: "800" },
  });
