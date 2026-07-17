import { useCallback, useMemo, useState } from "react";
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
import { api, Store } from "@/src/utils/api";
import { useSession } from "@/src/ctx/SessionProvider";
import { useColors, ThemeColors } from "@/src/theme";
import ConfirmDialog from "@/src/components/ConfirmDialog";

export default function StoresScreen() {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { refreshStores, setActiveStoreId } = useSession();
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Store | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [editing, setEditing] = useState<Store | null>(null);
  const [editName, setEditName] = useState("");

  const load = useCallback(async () => {
    try {
      const list = await api.listStores();
      setStores(list);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const submitAdd = async () => {
    if (!name.trim()) {
      setError("الرجاء إدخال اسم المحل");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await api.createStore(name.trim());
      setName("");
      setShowAdd(false);
      await refreshStores();
      await setActiveStoreId(created.id);
      load();
    } catch (e: any) {
      setError(e?.message || "فشل الإضافة");
    } finally {
      setBusy(false);
    }
  };

  const submitEdit = async () => {
    if (!editing || !editName.trim()) return;
    try {
      await api.updateStore(editing.id, { name: editName.trim() });
      setEditing(null);
      await refreshStores();
      load();
    } catch {
      /* ignore */
    }
  };

  const doDelete = async () => {
    if (!pendingDelete) return;
    setDeleteBusy(true);
    try {
      await api.deleteStore(pendingDelete.id);
      setPendingDelete(null);
      await refreshStores();
      load();
    } catch (e: any) {
      setError(e?.message || "فشل الحذف");
      setPendingDelete(null);
    } finally {
      setDeleteBusy(false);
    }
  };

  const renderItem = ({ item }: { item: Store }) => (
    <View style={styles.card} testID={`store-row-${item.id}`}>
      <Ionicons name={(item.icon as any) || "storefront"} size={24} color={colors.debtRed} />
      <Text style={styles.name}>{item.name}</Text>
      <TouchableOpacity
        testID={`store-edit-${item.id}`}
        style={[styles.smallBtn, { backgroundColor: colors.primary }]}
        onPress={() => { setEditing(item); setEditName(item.name); }}
      >
        <Ionicons name="pencil" size={16} color={colors.primaryText} />
      </TouchableOpacity>
      <TouchableOpacity
        testID={`store-delete-${item.id}`}
        style={[styles.smallBtn, { backgroundColor: colors.debtRed }]}
        onPress={() => setPendingDelete(item)}
      >
        <Ionicons name="trash" size={16} color={colors.white} />
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity
          testID="stores-back"
          style={styles.backBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
        >
          <Ionicons name="arrow-forward" size={24} color={colors.textMain} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>إدارة المحلات</Text>
        <TouchableOpacity
          testID="stores-add-btn"
          style={styles.backBtn}
          onPress={() => setShowAdd(true)}
          hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
        >
          <Ionicons name="add" size={26} color={colors.debtRed} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={colors.debtRed} />
        </View>
      ) : (
        <FlatList
          data={stores}
          keyExtractor={(s) => s.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16 }}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name="storefront-outline" size={56} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>لا يوجد محلات بعد</Text>
            </View>
          }
        />
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      {/* Add Modal */}
      <Modal visible={showAdd} transparent animationType="fade" onRequestClose={() => setShowAdd(false)}>
        <View style={styles.overlay}>
          <KeyboardAwareScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 20 }} bottomOffset={20}>
            <View style={styles.modalCard} testID="store-add-modal">
              <Text style={styles.modalTitle}>محل جديد</Text>
              <Text style={styles.label}>اسم المحل *</Text>
              <TextInput
                testID="store-add-name"
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="مثال: محل B"
                placeholderTextColor={colors.textMuted}
                textAlign="right"
                autoFocus
              />
              {error && <Text style={styles.error}>{error}</Text>}
              <View style={styles.modalActions}>
                <TouchableOpacity
                  testID="store-add-cancel"
                  style={[styles.modalBtn, { backgroundColor: colors.surfaceAlt }]}
                  onPress={() => setShowAdd(false)}
                  disabled={busy}
                >
                  <Text style={[styles.modalBtnText, { color: colors.textMain }]}>إلغاء</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  testID="store-add-confirm"
                  style={[styles.modalBtn, { backgroundColor: colors.primary }, busy && { opacity: 0.7 }]}
                  onPress={submitAdd}
                  disabled={busy}
                >
                  {busy ? <ActivityIndicator color={colors.primaryText} /> : <Text style={[styles.modalBtnText, { color: colors.primaryText }]}>إضافة</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAwareScrollView>
        </View>
      </Modal>

      {/* Edit Modal */}
      <Modal visible={!!editing} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <View style={styles.overlay}>
          <KeyboardAwareScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 20 }} bottomOffset={20}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>تعديل المحل</Text>
              <TextInput
                testID="store-edit-name"
                style={styles.input}
                value={editName}
                onChangeText={setEditName}
                textAlign="right"
                autoFocus
              />
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalBtn, { backgroundColor: colors.surfaceAlt }]}
                  onPress={() => setEditing(null)}
                >
                  <Text style={[styles.modalBtnText, { color: colors.textMain }]}>إلغاء</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  testID="store-edit-confirm"
                  style={[styles.modalBtn, { backgroundColor: colors.primary }]}
                  onPress={submitEdit}
                >
                  <Text style={[styles.modalBtnText, { color: colors.primaryText }]}>حفظ</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAwareScrollView>
        </View>
      </Modal>

      <ConfirmDialog
        visible={!!pendingDelete}
        title="هل أنت متأكد من عملية الحذف؟"
        message={pendingDelete ? `سيتم حذف "${pendingDelete.name}" مع جميع الزبائن والعمليات الخاصة به.` : ""}
        confirmLabel="حذف"
        onCancel={() => setPendingDelete(null)}
        onConfirm={doDelete}
        loading={deleteBusy}
        icon="trash"
        testID="delete-store-confirm"
      />
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
  centerBox: { flex: 1, justifyContent: "center", alignItems: "center" },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    marginBottom: 10,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  name: { flex: 1, fontSize: 16, fontWeight: "800", color: colors.textMain, textAlign: "right" },
  smallBtn: { width: 34, height: 34, borderRadius: 17, justifyContent: "center", alignItems: "center" },
  emptyBox: { alignItems: "center", paddingTop: 60 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: colors.textMain, marginTop: 12 },
  overlay: { flex: 1, backgroundColor: colors.overlay },
  modalCard: { backgroundColor: colors.surface, borderRadius: 20, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: "900", color: colors.textMain, textAlign: "right", marginBottom: 12 },
  label: { fontSize: 13, fontWeight: "700", color: colors.textMain, marginTop: 8, marginBottom: 6, textAlign: "right" },
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
  error: { color: colors.debtRed, marginHorizontal: 16, marginTop: 10, fontWeight: "700", textAlign: "right" },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 20 },
  modalBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  modalBtnText: { color: colors.white, fontSize: 15, fontWeight: "800" },
});
