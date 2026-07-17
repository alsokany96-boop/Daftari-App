import { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Modal,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, UserPublic } from "@/src/utils/api";
import { useSession } from "@/src/ctx/SessionProvider";
import { useColors, ThemeColors } from "@/src/theme";
import { fmtDate } from "@/src/utils/format";
import ConfirmDialog from "@/src/components/ConfirmDialog";

function formatDate(iso?: string | null) {
  return fmtDate(iso);
}

export default function AdminDashboardScreen() {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { user, signOut } = useSession();
  const [users, setUsers] = useState<UserPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSignOut, setShowSignOut] = useState(false);
  const [pendingDeactivate, setPendingDeactivate] = useState<UserPublic | null>(null);
  const [toggleBusy, setToggleBusy] = useState(false);

  const [resetTarget, setResetTarget] = useState<UserPublic | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const list = await api.adminListUsers();
      setUsers(list);
    } catch (e: any) {
      setError(e?.message || "خطأ في التحميل");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const toggleActive = async (u: UserPublic) => {
    if (u.is_active) {
      setPendingDeactivate(u);
      return;
    }
    try {
      await api.adminActivate(u.id);
      load();
    } catch {
      /* ignore */
    }
  };

  const confirmDeactivate = async () => {
    if (!pendingDeactivate) return;
    setToggleBusy(true);
    try {
      await api.adminDeactivate(pendingDeactivate.id);
      setPendingDeactivate(null);
      load();
    } catch {
      /* ignore */
    } finally {
      setToggleBusy(false);
    }
  };

  const doReset = async () => {
    if (!resetTarget) return;
    if (!newPassword || newPassword.length < 4) {
      setResetError("كلمة المرور يجب أن تكون 4 أحرف على الأقل");
      return;
    }
    setResetBusy(true);
    setResetError(null);
    try {
      await api.adminResetPassword(resetTarget.id, newPassword);
      setResetSuccess(`تم إعادة تعيين كلمة مرور ${resetTarget.username}`);
      setNewPassword("");
      setTimeout(() => {
        setResetTarget(null);
        setResetSuccess(null);
      }, 1500);
    } catch (e: any) {
      setResetError(e?.message || "فشل التعيين");
    } finally {
      setResetBusy(false);
    }
  };

  const renderUser = ({ item }: { item: UserPublic }) => {
    const isActive = item.is_active;
    return (
      <View style={styles.userCard} testID={`admin-user-${item.id}`}>
        <View style={styles.userTop}>
          <View style={styles.userInfo}>
            <Text style={styles.username}>{item.username}</Text>
            {item.shop_name ? <Text style={styles.shopName}>{item.shop_name}</Text> : null}
            <Text style={styles.userMeta}>
              {item.role === "employee" ? "موظف" : "مالك"} • {formatDate(item.created_at)}
            </Text>
          </View>
          <View style={[styles.badge, isActive ? styles.badgeActive : styles.badgeInactive]}>
            <Text style={[styles.badgeText, { color: isActive ? colors.paymentGreenDark : colors.debtRedDark }]}>
              {isActive ? "مفعّل" : "غير مفعّل"}
            </Text>
          </View>
        </View>

        <View style={styles.userActions}>
          <TouchableOpacity
            testID={`admin-toggle-${item.id}`}
            style={[styles.actionBtn, isActive ? styles.deactivateBtn : styles.activateBtn]}
            onPress={() => toggleActive(item)}
            activeOpacity={0.85}
          >
            <Ionicons
              name={isActive ? "close-circle" : "checkmark-circle"}
              size={18}
              color={colors.white}
            />
            <Text style={styles.actionBtnText}>{isActive ? "إلغاء التفعيل" : "تفعيل"}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID={`admin-reset-${item.id}`}
            style={[styles.actionBtn, styles.resetBtn]}
            onPress={() => {
              setResetTarget(item);
              setNewPassword("");
              setResetError(null);
              setResetSuccess(null);
            }}
            activeOpacity={0.85}
          >
            <Ionicons name="key" size={18} color={colors.white} />
            <Text style={styles.actionBtnText}>إعادة تعيين</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.appBar}>
        <View style={{ flex: 1 }}>
          <Text style={styles.appTitle}>لوحة المشرف</Text>
          <Text style={styles.appSubtitle}>{user?.username}</Text>
        </View>
        <TouchableOpacity
          testID="admin-signout"
          onPress={() => setShowSignOut(true)}
          style={styles.iconBtn}
          hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
        >
          <Ionicons name="log-out-outline" size={26} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      <View style={styles.statCard}>
        <View>
          <Text style={styles.statLabel}>إجمالي المستخدمين</Text>
          <Text style={styles.statValue}>{users.length}</Text>
        </View>
        <View>
          <Text style={styles.statLabel}>المفعّلون</Text>
          <Text style={[styles.statValue, { color: colors.paymentGreen }]}>
            {users.filter((u) => u.is_active).length}
          </Text>
        </View>
        <View>
          <Text style={styles.statLabel}>غير المفعّلين</Text>
          <Text style={[styles.statValue, { color: colors.debtRed }]}>
            {users.filter((u) => !u.is_active).length}
          </Text>
        </View>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={colors.debtRed} />
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => item.id}
          renderItem={renderUser}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor={colors.debtRed}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name="people-outline" size={56} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>لا يوجد مستخدمون بعد</Text>
            </View>
          }
        />
      )}

      {/* Reset Password Modal */}
      <Modal visible={!!resetTarget} transparent animationType="fade" onRequestClose={() => setResetTarget(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent} testID="reset-password-modal">
            <Text style={styles.modalTitle}>إعادة تعيين كلمة المرور</Text>
            <Text style={styles.modalSubtitle}>المستخدم: {resetTarget?.username}</Text>

            <TextInput
              testID="reset-new-password"
              style={styles.modalInput}
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="كلمة المرور الجديدة"
              placeholderTextColor={colors.textMuted}
              secureTextEntry
              textAlign="right"
              autoFocus
            />

            {resetError && <Text style={styles.error}>{resetError}</Text>}
            {resetSuccess && <Text style={styles.success}>{resetSuccess}</Text>}

            <View style={styles.modalActions}>
              <TouchableOpacity
                testID="reset-cancel"
                style={[styles.modalBtn, { backgroundColor: colors.border }]}
                onPress={() => setResetTarget(null)}
                disabled={resetBusy}
              >
                <Text style={[styles.modalBtnText, { color: colors.textMain }]}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="reset-confirm"
                style={[styles.modalBtn, { backgroundColor: colors.primary }, resetBusy && { opacity: 0.7 }]}
                onPress={doReset}
                disabled={resetBusy}
              >
                {resetBusy ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.modalBtnText}>تأكيد</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <ConfirmDialog
        visible={!!pendingDeactivate}
        title="هل أنت متأكد من إلغاء تفعيل هذا المستخدم؟"
        message={pendingDeactivate ? `سيُمنع ${pendingDeactivate.username} من الدخول.` : ""}
        confirmLabel="إلغاء التفعيل"
        onCancel={() => setPendingDeactivate(null)}
        onConfirm={confirmDeactivate}
        loading={toggleBusy}
        icon="close-circle"
        testID="deactivate-confirm"
      />

      <ConfirmDialog
        visible={showSignOut}
        title="هل أنت متأكد من تسجيل الخروج؟"
        confirmLabel="تسجيل الخروج"
        icon="log-out"
        onCancel={() => setShowSignOut(false)}
        onConfirm={async () => {
          setShowSignOut(false);
          await signOut();
        }}
        testID="admin-signout-confirm"
      />
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  appBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  appTitle: { fontSize: 22, fontWeight: "900", color: colors.primary, textAlign: "right" },
  appSubtitle: { fontSize: 13, color: colors.textMuted, marginTop: 2, textAlign: "right" },
  iconBtn: { width: 44, height: 44, justifyContent: "center", alignItems: "center" },
  statCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statLabel: { fontSize: 12, color: colors.textMuted, fontWeight: "600", textAlign: "center" },
  statValue: { fontSize: 22, fontWeight: "900", color: colors.textMain, marginTop: 4, textAlign: "center" },
  error: { color: colors.debtRed, marginHorizontal: 16, marginTop: 8, fontWeight: "600", textAlign: "right" },
  success: { color: colors.paymentGreen, marginTop: 8, fontWeight: "600", textAlign: "right" },
  centerBox: { flex: 1, justifyContent: "center", alignItems: "center" },
  userCard: {
    backgroundColor: colors.surface,
    padding: 14,
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  userTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  userInfo: { flex: 1 },
  username: { fontSize: 17, fontWeight: "800", color: colors.textMain, textAlign: "right" },
  shopName: { fontSize: 13, color: colors.textMain, marginTop: 2, textAlign: "right" },
  userMeta: { fontSize: 11, color: colors.textMuted, marginTop: 4, textAlign: "right" },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeActive: { backgroundColor: colors.paymentGreenBg },
  badgeInactive: { backgroundColor: colors.debtRedBg },
  badgeText: { fontSize: 12, fontWeight: "800" },
  userActions: { flexDirection: "row", gap: 8, marginTop: 12 },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  activateBtn: { backgroundColor: colors.paymentGreen },
  deactivateBtn: { backgroundColor: colors.debtRed },
  resetBtn: { backgroundColor: colors.primary },
  actionBtnText: { color: colors.white, fontSize: 13, fontWeight: "800" },
  emptyBox: { alignItems: "center", paddingTop: 60 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: colors.textMain, marginTop: 12 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 24,
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 24,
  },
  modalTitle: { fontSize: 18, fontWeight: "900", color: colors.textMain, textAlign: "right" },
  modalSubtitle: { fontSize: 14, color: colors.textMuted, marginTop: 4, textAlign: "right" },
  modalInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.textMain,
    backgroundColor: colors.background,
    marginTop: 16,
  },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 20 },
  modalBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  modalBtnText: { color: colors.white, fontSize: 15, fontWeight: "800" },
});
