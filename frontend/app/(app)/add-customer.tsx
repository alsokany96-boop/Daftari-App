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
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, PartyType } from "@/src/utils/api";
import { useSession } from "@/src/ctx/SessionProvider";
import { useColors, ThemeColors } from "@/src/theme";

export default function AddCustomerScreen() {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { activeStoreId, partyType: sessionPartyType, refreshUser } = useSession();
  const params = useLocalSearchParams<{ party_type?: string }>();
  const partyType: PartyType = (params.party_type === "supplier" ? "supplier" : (sessionPartyType === "supplier" ? "supplier" : "customer"));
  const isSupplier = partyType === "supplier";
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [maxDebt, setMaxDebt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError("الرجاء إدخال اسم الزبون");
      return;
    }
    if (!phone.trim()) {
      setError("الرجاء إدخال رقم الهاتف");
      return;
    }
    if (!activeStoreId) {
      setError("الرجاء اختيار محل نشط أولاً");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const md = maxDebt.trim() ? parseFloat(maxDebt.trim()) : undefined;
      await api.createCustomer({
        name: name.trim(),
        phone: phone.trim(),
        max_debt: md,
        party_type: partyType,
        store_id: activeStoreId,
      });
      // Re-fetch the user so subscription/lock state reflects the new customer
      // count immediately (10th customer triggers the lock screen).
      try {
        await refreshUser();
      } catch {
        /* non-blocking */
      }
      router.back();
    } catch (e: any) {
      setError(e?.message || "فشل الحفظ");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity
          testID="add-customer-back"
          style={styles.backBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
        >
          <Ionicons name="close" size={26} color={colors.textMain} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{isSupplier ? "مورد جديد" : "زبون جديد"}</Text>
        <View style={{ width: 44 }} />
      </View>

      <KeyboardAwareScrollView
        contentContainerStyle={styles.container}
        bottomOffset={20}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.label}>{isSupplier ? "اسم المورد *" : "اسم الزبون *"}</Text>
        <TextInput
          testID="add-customer-name-input"
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder={isSupplier ? "مثال: شركة الشرق" : "مثال: أحمد محمد"}
          placeholderTextColor={colors.textMuted}
          textAlign="right"
        />

        <Text style={styles.label}>رقم الهاتف *</Text>
        <TextInput
          testID="add-customer-phone-input"
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          placeholder="مثال: 07XXXXXXXX"
          placeholderTextColor={colors.textMuted}
          keyboardType="phone-pad"
          textAlign="right"
        />

        <Text style={styles.label}>الحد الأقصى للدين (اختياري)</Text>
        <TextInput
          testID="add-customer-maxdebt-input"
          style={styles.input}
          value={maxDebt}
          onChangeText={setMaxDebt}
          placeholder="اترك فارغاً إذا لم يكن هناك حد"
          placeholderTextColor={colors.textMuted}
          keyboardType="numeric"
          textAlign="right"
        />

        {error && (
          <Text style={styles.error} testID="add-customer-error">
            {error}
          </Text>
        )}

        <TouchableOpacity
          testID="add-customer-submit"
          style={[styles.submitBtn, loading && { opacity: 0.7 }]}
          onPress={handleSubmit}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.submitText}>حفظ الزبون</Text>
          )}
        </TouchableOpacity>
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
    paddingVertical: 8,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { width: 44, height: 44, justifyContent: "center", alignItems: "center" },
  headerTitle: { fontSize: 20, fontWeight: "800", color: colors.textMain },
  container: { padding: 20 },
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
  error: { color: colors.debtRed, marginTop: 12, textAlign: "right", fontWeight: "600" },
  submitBtn: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 28,
  },
  submitText: { color: colors.white, fontSize: 18, fontWeight: "800" },
});
