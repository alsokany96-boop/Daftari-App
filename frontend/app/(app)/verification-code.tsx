import { useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/utils/api";
import { useColors, ThemeColors } from "@/src/theme";

export default function VerificationCodeScreen() {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [ttlMinutes, setTtlMinutes] = useState<number>(15);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.createVerificationCode();
      setCode(res.code);
      setExpiresAt(res.expires_at);
      setTtlMinutes(res.ttl_minutes);
    } catch (e: any) {
      setError(e?.message || "فشل التوليد");
    } finally {
      setLoading(false);
    }
  };

  const shareViaWhatsApp = () => {
    if (!code) return;
    const message = `رمز موافقة المالك لتغيير كلمة المرور: ${code}\nصالح لمدة ${ttlMinutes} دقيقة.`;
    Linking.openURL(`https://wa.me/?text=${encodeURIComponent(message)}`).catch(() => {});
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity
          testID="vc-back"
          style={styles.backBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
        >
          <Ionicons name="arrow-forward" size={24} color={colors.textMain} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>رمز موافقة الموظف</Text>
        <View style={{ width: 44 }} />
      </View>

      <View style={styles.container}>
        <View style={styles.iconBox}>
          <Ionicons name="shield-checkmark" size={44} color={colors.white} />
        </View>
        <Text style={styles.title}>توليد رمز تحقق للموظف</Text>
        <Text style={styles.subtitle}>
          يحتاج الموظف إلى هذا الرمز لتغيير كلمة المرور الخاصة به.{"\n"}
          الرمز صالح لمدة {ttlMinutes} دقيقة فقط، ويصبح مُلغى تلقائياً عند توليد رمز جديد.
        </Text>

        <View style={styles.codeCard} testID="vc-card">
          {code ? (
            <>
              <Text style={styles.codeLabel}>الرمز الحالي</Text>
              <Text style={styles.codeText} testID="vc-code">{code}</Text>
              {expiresAt && (
                <Text style={styles.codeExpires}>
                  تنتهي صلاحيته: {new Date(expiresAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                </Text>
              )}
            </>
          ) : (
            <Text style={styles.codePlaceholder}>لا يوجد رمز حالياً — اضغط للتوليد</Text>
          )}
        </View>

        {error && <Text style={styles.error} testID="vc-error">{error}</Text>}

        <TouchableOpacity
          testID="vc-generate"
          style={[styles.generateBtn, loading && { opacity: 0.7 }]}
          onPress={generate}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <>
              <Ionicons name={code ? "refresh" : "key"} size={22} color={colors.white} />
              <Text style={styles.generateText}>{code ? "توليد رمز جديد" : "توليد الرمز"}</Text>
            </>
          )}
        </TouchableOpacity>

        {code && (
          <TouchableOpacity
            testID="vc-share"
            style={styles.shareBtn}
            onPress={shareViaWhatsApp}
            activeOpacity={0.85}
          >
            <Ionicons name="logo-whatsapp" size={20} color={colors.white} />
            <Text style={styles.shareText}>مشاركة عبر الواتساب</Text>
          </TouchableOpacity>
        )}
      </View>
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
    backBtn: { width: 44, height: 44, justifyContent: "center", alignItems: "center" },
    headerTitle: { fontSize: 18, fontWeight: "800", color: colors.textMain },
    container: { padding: 24, alignItems: "center" },
    iconBox: {
      width: 96,
      height: 96,
      borderRadius: 26,
      backgroundColor: colors.primary,
      justifyContent: "center",
      alignItems: "center",
      marginTop: 12,
    },
    title: { fontSize: 22, fontWeight: "900", color: colors.textMain, marginTop: 18, textAlign: "center" },
    subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 6, textAlign: "center", lineHeight: 22 },
    codeCard: {
      width: "100%",
      backgroundColor: colors.surface,
      borderRadius: 20,
      padding: 24,
      alignItems: "center",
      marginTop: 24,
      borderWidth: 1,
      borderColor: colors.border,
    },
    codeLabel: { fontSize: 12, color: colors.textMuted, fontWeight: "700" },
    codeText: { fontSize: 44, fontWeight: "900", color: colors.debtRed, letterSpacing: 8, marginTop: 6 },
    codeExpires: { fontSize: 12, color: colors.textMuted, marginTop: 8 },
    codePlaceholder: { fontSize: 14, color: colors.textMuted, fontWeight: "600" },
    error: { color: colors.debtRed, marginTop: 16, fontWeight: "700" },
    generateBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      backgroundColor: colors.primary,
      paddingVertical: 16,
      borderRadius: 14,
      marginTop: 22,
      width: "100%",
    },
    generateText: { color: colors.primaryText, fontSize: 17, fontWeight: "800" },
    shareBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      backgroundColor: colors.whatsapp,
      paddingVertical: 14,
      borderRadius: 14,
      marginTop: 10,
      width: "100%",
    },
    shareText: { color: colors.white, fontSize: 16, fontWeight: "800" },
  });
