import { useCallback, useMemo, useState } from "react";
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
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, AppSettings } from "@/src/utils/api";
import { useColors, ThemeColors } from "@/src/theme";

const FREQ_OPTIONS: { key: AppSettings["reminder_frequency"]; label: string }[] = [
  { key: "daily", label: "يومياً" },
  { key: "weekly", label: "أسبوعياً" },
  { key: "monthly", label: "شهرياً" },
  { key: "custom", label: "مخصص" },
];

export default function SettingsScreen() {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const s = await api.getSettings();
      setSettings(s);
    } catch (e: any) {
      setError(e?.message || "فشل التحميل");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    try {
      const updated = await api.updateSettings(settings);
      setSettings(updated);
      setSavedMsg("تم حفظ الإعدادات");
      setTimeout(() => setSavedMsg(null), 2000);
    } catch (e: any) {
      setError(e?.message || "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !settings) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={colors.debtRed} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity
          testID="settings-back"
          style={styles.backBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
        >
          <Ionicons name="arrow-forward" size={24} color={colors.textMain} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>إعدادات التذكيرات</Text>
        <View style={{ width: 44 }} />
      </View>

      <KeyboardAwareScrollView contentContainerStyle={styles.container} bottomOffset={20}>
        {/* Enable toggle */}
        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>تفعيل التذكيرات</Text>
            <Text style={styles.rowHint}>عرض تذكير الواتساب بعد كل عملية</Text>
          </View>
          <TouchableOpacity
            testID="settings-enable-toggle"
            style={[styles.toggle, settings.reminder_enabled && styles.toggleOn]}
            onPress={() => setSettings({ ...settings, reminder_enabled: !settings.reminder_enabled })}
            activeOpacity={0.8}
          >
            <View style={[styles.toggleThumb, settings.reminder_enabled && styles.toggleThumbOn]} />
          </TouchableOpacity>
        </View>

        {/* Frequency */}
        <Text style={styles.sectionLabel}>تكرار التذكير</Text>
        <View style={styles.freqRow}>
          {FREQ_OPTIONS.map((f) => {
            const selected = settings.reminder_frequency === f.key;
            return (
              <TouchableOpacity
                key={f.key}
                testID={`settings-freq-${f.key}`}
                style={[styles.freqChip, selected && styles.freqChipSelected]}
                onPress={() => setSettings({ ...settings, reminder_frequency: f.key })}
                activeOpacity={0.85}
              >
                <Text style={[styles.freqChipText, selected && styles.freqChipTextSelected]}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {settings.reminder_frequency === "custom" && (
          <>
            <Text style={styles.sectionLabel}>عدد الأيام</Text>
            <TextInput
              testID="settings-custom-days"
              style={styles.input}
              value={String(settings.reminder_custom_days)}
              onChangeText={(t) => {
                const n = parseInt(t.replace(/\D/g, ""), 10);
                setSettings({ ...settings, reminder_custom_days: isNaN(n) ? 0 : n });
              }}
              keyboardType="numeric"
              placeholder="7"
              placeholderTextColor={colors.textMuted}
              textAlign="right"
            />
          </>
        )}

        {/* Template */}
        <Text style={styles.sectionLabel}>نص التذكير</Text>
        <Text style={styles.rowHint}>
          المتغيرات المتاحة: {"{name}"} اسم الزبون، {"{shop}"} اسم المحل، {"{amount}"} المبلغ، {"{currency}"} العملة
        </Text>
        <TextInput
          testID="settings-template"
          style={[styles.input, { minHeight: 120 }]}
          value={settings.reminder_template}
          onChangeText={(t) => setSettings({ ...settings, reminder_template: t })}
          multiline
          textAlign="right"
          textAlignVertical="top"
        />

        {error && <Text style={styles.error} testID="settings-error">{error}</Text>}
        {savedMsg && <Text style={styles.success} testID="settings-saved">{savedMsg}</Text>}

        <TouchableOpacity
          testID="settings-save"
          style={[styles.saveBtn, saving && { opacity: 0.7 }]}
          onPress={save}
          disabled={saving}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.saveText}>حفظ الإعدادات</Text>
          )}
        </TouchableOpacity>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  centerBox: { flex: 1, justifyContent: "center", alignItems: "center" },
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
  container: { padding: 20 },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  rowTitle: { fontSize: 16, fontWeight: "800", color: colors.textMain, textAlign: "right" },
  rowHint: { fontSize: 12, color: colors.textMuted, marginTop: 4, textAlign: "right", lineHeight: 20 },
  toggle: {
    width: 52,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.border,
    padding: 3,
    justifyContent: "center",
  },
  toggleOn: { backgroundColor: colors.paymentGreen },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.white,
    alignSelf: "flex-start",
  },
  toggleThumbOn: { alignSelf: "flex-end" },
  sectionLabel: { fontSize: 14, fontWeight: "800", color: colors.textMain, marginTop: 20, marginBottom: 8, textAlign: "right" },
  freqRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  freqChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  freqChipSelected: { backgroundColor: colors.debtRed, borderColor: colors.debtRed },
  freqChipText: { color: colors.textMain, fontWeight: "700" },
  freqChipTextSelected: { color: colors.white },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    color: colors.textMain,
    backgroundColor: colors.surface,
    marginTop: 4,
  },
  error: { color: colors.debtRed, marginTop: 16, textAlign: "right", fontWeight: "600" },
  success: { color: colors.paymentGreen, marginTop: 16, textAlign: "right", fontWeight: "700" },
  saveBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 28,
  },
  saveText: { color: colors.white, fontSize: 17, fontWeight: "800" },
});
