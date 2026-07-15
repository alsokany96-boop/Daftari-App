import { useCallback, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Modal,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, UserPublic } from "@/src/utils/api";
import { colors } from "@/src/theme";

export default function StaffScreen() {
  const [staff, setStaff] = useState<UserPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newDisplay, setNewDisplay] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await api.listStaff();
      setStaff(list);
    } catch (e) {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const submitAdd = async () => {
    if (!newUsername.trim() || !newPassword) {
      setError("الرجاء إدخال اسم المستخدم وكلمة المرور");
      return;
    }
    if (newPassword.length < 4) {
      setError("كلمة المرور يجب أن تكون 4 أحرف على الأقل");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.createStaff(newUsername.trim(), newPassword, newDisplay.trim() || undefined);
      setShowAdd(false);
      setNewUsername("");
      setNewPassword("");
      setNewDisplay("");
      load();
    } catch (e: any) {
      setError(e?.message || "فشل الإضافة");
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (u: UserPublic) => {
    try {
      await api.updateStaff(u.id, { is_active: !u.is_active });
      load();
    } catch {
      /* ignore */
    }
  };

  const remove = async (u: UserPublic) => {
    try {
      await api.deleteStaff(u.id);
      load();
    } catch {
      /* ignore */
    }
  };

  const renderStaff = ({ item }: { item: UserPublic }) => (
    <View style={styles.card} testID={`staff-${item.id}`}>
      <View style={{ flex: 1 }}>
        <Text style={styles.username}>{item.username}</Text>
        {item.shop_name ? <Text style={styles.display}>{item.shop_name}</Text> : null}
        <Text style={[styles.status, { color: item.is_active ? colors.paymentGreen : colors.debtRed }]}>
          {item.is_active ? "مفعّل" : "غير مفعّل"}
        </Text>
      </View>
      <TouchableOpacity
        testID={`staff-toggle-${item.id}`}
        style={[styles.smallBtn, { backgroundColor: item.is_active ? colors.debtRed : colors.paymentGreen }]}
        onPress={() => toggleActive(item)}
      >
        <Ionicons
          name={item.is_active ? "pause" : "play"}
          size={16}
          color={colors.white}
        />
      </TouchableOpacity>
      <TouchableOpacity
        testID={`staff-delete-${item.id}`}
        style={[styles.smallBtn, { backgroundColor: colors.primary }]}
        onPress={() => remove(item)}
      >
        <Ionicons name="trash" size={16} color={colors.white} />
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity
          testID="staff-back"
          style={styles.backBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
        >
          <Ionicons name="arrow-forward" size={24} color={colors.textMain} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>الموظفون</Text>
        <TouchableOpacity
          testID="staff-add-btn"
          style={styles.addBtn}
          onPress={() => setShowAdd(true)}
          hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
        >
          <Ionicons name="add" size={28} color={colors.debtRed} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={colors.debtRed} />
        </View>
      ) : (
        <FlatList
          data={staff}
          keyExtractor={(u) => u.id}
          renderItem={renderStaff}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          ListEmptyComponent={
            <View style={styles.emptyBox} testID="staff-empty">
              <Ionicons name="people-outline" size={64} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>لا يوجد موظفون بعد</Text>
              <Text style={styles.emptySubtitle}>اضغط + لإضافة موظف يشاركك إدارة الدفتر</Text>
            </View>
          }
        />
      )}

      <Modal visible={showAdd} transparent animationType="fade" onRequestClose={() => setShowAdd(false)}>
        <View style={styles.modalOverlay}>
          <KeyboardAwareScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24 }} bottomOffset={20}>
            <View style={styles.modalContent} testID="staff-add-modal">
              <Text style={styles.modalTitle}>إضافة موظف</Text>

              <Text style={styles.label}>اسم المستخدم *</Text>
              <TextInput
                testID="staff-new-username"
                style={styles.input}
                value={newUsername}
                onChangeText={setNewUsername}
                placeholder="مثال: ahmed"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                textAlign="right"
              />

              <Text style={styles.label}>الاسم الظاهر (اختياري)</Text>
              <TextInput
                testID="staff-new-display"
                style={styles.input}
                value={newDisplay}
                onChangeText={setNewDisplay}
                placeholder="مثال: أحمد الكاشير"
                placeholderTextColor={colors.textMuted}
                textAlign="right"
              />

              <Text style={styles.label}>كلمة المرور *</Text>
              <TextInput
                testID="staff-new-password"
                style={styles.input}
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="4 أحرف على الأقل"
                placeholderTextColor={colors.textMuted}
                secureTextEntry
                textAlign="right"
              />

              {error && <Text style={styles.error}>{error}</Text>}

              <View style={styles.modalActions}>
                <TouchableOpacity
                  testID="staff-cancel"
                  style={[styles.modalBtn, { backgroundColor: colors.border }]}
                  onPress={() => {
                    setShowAdd(false);
                    setError(null);
                  }}
                  disabled={busy}
                >
                  <Text style={[styles.modalBtnText, { color: colors.textMain }]}>إلغاء</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  testID="staff-confirm"
                  style={[styles.modalBtn, { backgroundColor: colors.primary }, busy && { opacity: 0.7 }]}
                  onPress={submitAdd}
                  disabled={busy}
                >
                  {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.modalBtnText}>إضافة</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAwareScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
  addBtn: { width: 44, height: 44, justifyContent: "center", alignItems: "center" },
  headerTitle: { fontSize: 18, fontWeight: "800", color: colors.textMain },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    padding: 14,
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  username: { fontSize: 16, fontWeight: "800", color: colors.textMain, textAlign: "right" },
  display: { fontSize: 13, color: colors.textMain, marginTop: 2, textAlign: "right" },
  status: { fontSize: 12, fontWeight: "700", marginTop: 4, textAlign: "right" },
  smallBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyBox: { alignItems: "center", paddingTop: 60, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 17, fontWeight: "800", color: colors.textMain, marginTop: 16 },
  emptySubtitle: { fontSize: 13, color: colors.textMuted, marginTop: 6, textAlign: "center" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  modalContent: { backgroundColor: colors.surface, borderRadius: 20, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: "900", color: colors.textMain, textAlign: "right" },
  label: { fontSize: 13, fontWeight: "700", color: colors.textMain, marginTop: 14, marginBottom: 6, textAlign: "right" },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.textMain,
    backgroundColor: colors.background,
  },
  error: { color: colors.debtRed, marginTop: 10, textAlign: "right", fontWeight: "600" },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 20 },
  modalBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  modalBtnText: { color: colors.white, fontSize: 15, fontWeight: "800" },
});
