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
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/utils/api";
import { useSession } from "@/src/ctx/SessionProvider";
import { useColors, ThemeColors } from "@/src/theme";
import ConfirmDialog from "@/src/components/ConfirmDialog";

export default function EditCustomerScreen() {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useSession();
  const isEmployee = user?.role === "employee";
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [maxDebt, setMaxDebt] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const c = await api.getCustomer(id);
      setName(c.name);
      setPhone(c.phone);
      setMaxDebt(c.max_debt ? String(c.max_debt) : "");
    } catch (e: any) {
      setError(e?.message || "فشل التحميل");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const save = async () => {
    if (!id) return;
    if (!name.trim() || !phone.trim()) {
      setError("الاسم ورقم الهاتف مطلوبان");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload: any = { name: name.trim(), phone: phone.trim() };
      if (!isEmployee) {
        payload.max_debt = maxDebt.trim() ? parseFloat(maxDebt.trim()) : null;
      }
      await api.updateCustomer(id, payload);
      router.back();
    } catch (e: any) {
      setError(e?.message || "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (!id) return;
    setDeleting(true);
    try {
      await api.deleteCustomer(id);
      setConfirmDelete(false);
      router.dismissTo("/(app)/home");
    } catch (e: any) {
      setError(e?.message || "فشل الحذف");
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
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
          testID="edit-customer-back"
          style={styles.backBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
        >
          <Ionicons name="close" size={26} color={colors.textMain} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>تعديل الزبون</Text>
        <View style={{ width: 44 }} />
      </View>

      <KeyboardAwareScrollView contentContainerStyle={styles.container} bottomOffset={20}>
        <Text style={styles.label}>اسم الزبون *</Text>
        <TextInput
          testID="edit-customer-name"
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="اسم الزبون"
          placeholderTextColor={colors.textMuted}
          textAlign="right"
        />

        <Text style={styles.label}>رقم الهاتف *</Text>
        <TextInput
          testID="edit-customer-phone"
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          placeholder="رقم الهاتف"
          placeholderTextColor={colors.textMuted}
          keyboardType="phone-pad"
          textAlign="right"
        />

        {!isEmployee && (
          <>
            <Text style={styles.label}>الحد الأقصى للدين (اختياري)</Text>
            <TextInput
              testID="edit-customer-maxdebt"
              style={styles.input}
              value={maxDebt}
              onChangeText={setMaxDebt}
              placeholder="اترك فارغاً إذا لم يكن هناك حد"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              textAlign="right"
            />
          </>
        )}

        {isEmployee && (
          <Text style={styles.hint}>يمكن للموظفين تعديل الاسم ورقم الهاتف فقط.</Text>
        )}

        {error && <Text style={styles.error} testID="edit-customer-error">{error}</Text>}

        <TouchableOpacity
          testID="edit-customer-save"
          style={[styles.saveBtn, saving && { opacity: 0.7 }]}
          onPress={save}
          disabled={saving}
          activeOpacity={0.85}
        >
          {saving ? <ActivityIndicator color={colors.white} /> : <Text style={styles.saveText}>حفظ التغييرات</Text>}
        </TouchableOpacity>

        {!isEmployee && (
          <TouchableOpacity
            testID="edit-customer-delete"
            style={styles.deleteBtn}
            onPress={() => setConfirmDelete(true)}
            activeOpacity={0.85}
          >
            <Ionicons name="trash" size={18} color={colors.white} />
            <Text style={styles.deleteText}>حذف الزبون وجميع عملياته</Text>
          </TouchableOpacity>
        )}
      </KeyboardAwareScrollView>

      <ConfirmDialog
        visible={confirmDelete}
        title="هل أنت متأكد من عملية الحذف؟"
        message="سيتم حذف الزبون وجميع عملياته بشكل نهائي."
        confirmLabel="حذف"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={doDelete}
        loading={deleting}
        icon="trash"
        testID="delete-customer-confirm"
      />
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
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
    hint: { color: colors.textMuted, fontSize: 12, marginTop: 12, textAlign: "right" },
    error: { color: colors.debtRed, marginTop: 12, textAlign: "right", fontWeight: "600" },
    saveBtn: {
      backgroundColor: colors.primary,
      paddingVertical: 16,
      borderRadius: 14,
      alignItems: "center",
      marginTop: 28,
    },
    saveText: { color: colors.primaryText, fontSize: 17, fontWeight: "800" },
    deleteBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: colors.debtRed,
      paddingVertical: 14,
      borderRadius: 14,
      marginTop: 16,
    },
    deleteText: { color: colors.white, fontSize: 15, fontWeight: "800" },
  });
