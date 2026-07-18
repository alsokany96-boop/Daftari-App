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
  Linking,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, UserPublic, ResetCodeRow, whatsappUrl } from "@/src/utils/api";
import { useSession } from "@/src/ctx/SessionProvider";
import { useColors, ThemeColors } from "@/src/theme";
import { fmtDateTime, fmtDate } from "@/src/utils/format";
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
  const [resetCodes, setResetCodes] = useState<ResetCodeRow[]>([]);
  const [showCodes, setShowCodes] = useState(false);
  const [codesLoading, setCodesLoading] = useState(false);
  const [extendBusyId, setExtendBusyId] = useState<string | null>(null);

  const [resetTarget, setResetTarget] = useState<UserPublic | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);

  // Admin search: matches shop_name, username, or phone (case-insensitive).
  const [search, setSearch] = useState("");
  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const fields = [
        u.username || "",
        u.shop_name || "",
        u.phone || "",
      ].map((s) => s.toLowerCase());
      return fields.some((f) => f.includes(q));
    });
  }, [users, search]);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [list, codes] = await Promise.all([
        api.adminListUsers(),
        api.adminListResetCodes().catch(() => [] as ResetCodeRow[]),
      ]);
      setUsers(list);
      setResetCodes(codes);
    } catch (e: any) {
      setError(e?.message || "خطأ في التحميل");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const refreshResetCodes = useCallback(async () => {
    setCodesLoading(true);
    try {
      const codes = await api.adminListResetCodes();
      setResetCodes(codes);
    } catch {
      /* ignore */
    } finally {
      setCodesLoading(false);
    }
  }, []);

  const shareCode = (row: ResetCodeRow) => {
    const message = `رمز التحقق لاستعادة كلمة المرور لحساب "${row.username}" في تطبيق دفتري: ${row.code}\nصالح لمدة قصيرة.`;
    const target = (row.phone || "").trim();
    if (target) {
      const url = whatsappUrl(target, message);
      Linking.openURL(url).catch(() => {});
    } else {
      Linking.openURL(`https://wa.me/?text=${encodeURIComponent(message)}`).catch(() => {});
    }
  };

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

  const extendSub = async (u: UserPublic) => {
    setExtendBusyId(u.id);
    try {
      await api.adminExtendSubscription(u.id, 30);
      load();
    } catch {
      /* ignore */
    } finally {
      setExtendBusyId(null);
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
    const exp = item.subscription_expires_at || null;
    const expTs = exp ? new Date(exp).getTime() : 0;
    const nowTs = Date.now();
    const hasSub = !!exp && expTs > nowTs;
    const isExpired = !!exp && expTs <= nowTs;
    const daysLeft = hasSub ? Math.ceil((expTs - nowTs) / 86400000) : 0;
    const isOwner = item.role !== "employee";
    return (
      <View style={styles.userCard} testID={`admin-user-${item.id}`}>
        <View style={styles.userTop}>
          <View style={styles.userInfo}>
            <Text style={styles.username}>{item.username}</Text>
            {item.shop_name ? <Text style={styles.shopName}>{item.shop_name}</Text> : null}
            <Text style={styles.userMeta}>
              {item.role === "employee" ? "موظف" : "مالك"} • {formatDate(item.created_at)}
            </Text>
            {isOwner && (
              <Text style={styles.userMeta}>
                زبائن: {item.customer_count ?? 0} / {item.free_tier_limit ?? 10}
              </Text>
            )}
          </View>
          <View style={[styles.badge, isActive ? styles.badgeActive : styles.badgeInactive]}>
            <Text style={[styles.badgeText, { color: isActive ? colors.paymentGreenDark : colors.debtRedDark }]}>
              {isActive ? "مفعّل" : "غير مفعّل"}
            </Text>
          </View>
        </View>

        {isOwner && (
          <View style={styles.subRow} testID={`admin-sub-${item.id}`}>
            <Ionicons
              name={hasSub ? "shield-checkmark" : isExpired ? "time" : "shield-outline"}
              size={16}
              color={hasSub ? colors.paymentGreenDark : isExpired ? colors.debtRedDark : colors.textMuted}
            />
            <Text style={styles.subText}>
              {hasSub
                ? `الاشتراك ساري (${daysLeft} يوم متبقٍ) • ينتهي ${formatDate(exp)}`
                : isExpired
                ? `انتهى الاشتراك في ${formatDate(exp)}`
                : "لا يوجد اشتراك — يعمل ضمن الحد المجاني"}
            </Text>
          </View>
        )}

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
            <Text style={styles.actionBtnText}>
              {isActive ? "إلغاء التفعيل" : hasSub ? "تفعيل" : "تفعيل + 30 يوم"}
            </Text>
          </TouchableOpacity>
          {isOwner && (
            <TouchableOpacity
              testID={`admin-extend-${item.id}`}
              style={[styles.actionBtn, styles.extendBtn]}
              onPress={() => extendSub(item)}
              activeOpacity={0.85}
              disabled={extendBusyId === item.id}
            >
              {extendBusyId === item.id ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <>
                  <Ionicons name="add-circle" size={18} color={colors.white} />
                  <Text style={styles.actionBtnText}>+30 يوم</Text>
                </>
              )}
            </TouchableOpacity>
          )}
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
          testID="admin-profile-open"
          onPress={() => router.push("/(app)/admin-profile")}
          style={styles.iconBtn}
          hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
        >
          <Ionicons name="person-circle-outline" size={28} color={colors.primary} />
        </TouchableOpacity>
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

      {/* Pending Manual OTP Codes */}
      <TouchableOpacity
        testID="admin-toggle-codes"
        style={styles.resetCodesBar}
        onPress={() => {
          setShowCodes((v) => !v);
          if (!showCodes) refreshResetCodes();
        }}
        activeOpacity={0.85}
      >
        <Ionicons name="key" size={20} color={colors.debtRedDark} />
        <Text style={styles.resetCodesText}>
          رموز استعادة كلمة المرور المعلّقة ({resetCodes.length})
        </Text>
        <Ionicons
          name={showCodes ? "chevron-up" : "chevron-down"}
          size={20}
          color={colors.debtRedDark}
        />
      </TouchableOpacity>

      {showCodes && (
        <View style={styles.resetCodesBox}>
          {codesLoading ? (
            <ActivityIndicator color={colors.debtRed} />
          ) : resetCodes.length === 0 ? (
            <Text style={styles.emptyCodesText}>لا توجد رموز معلّقة</Text>
          ) : (
            <ScrollView style={{ maxHeight: 220 }}>
              {resetCodes.map((row) => (
                <View key={row.id} style={styles.codeCard} testID={`reset-code-${row.id}`}>
                  <TouchableOpacity
                    testID={`share-code-${row.id}`}
                    style={styles.codeShareBtn}
                    onPress={() => shareCode(row)}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="logo-whatsapp" size={20} color={colors.white} />
                  </TouchableOpacity>
                  <View style={styles.codePill}>
                    <Text style={styles.codeValue}>{row.code}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.codeUser}>{row.username}</Text>
                    <Text style={styles.codeMeta}>
                      {row.phone || "—"} • ينتهي {fmtDateTime(row.expires_at)}
                    </Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      {/* Search bar */}
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={20} color={colors.textMuted} />
        <TextInput
          testID="admin-search-input"
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="ابحث بالاسم أو المتجر أو الهاتف..."
          placeholderTextColor={colors.textMuted}
          textAlign="right"
        />
        {search.length > 0 && (
          <TouchableOpacity
            testID="admin-search-clear"
            onPress={() => setSearch("")}
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
          >
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={colors.debtRed} />
        </View>
      ) : (
        <FlatList
          data={filteredUsers}
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
              <Text style={styles.emptyTitle} testID="admin-empty-title">
                {search.trim()
                  ? "لا توجد نتائج مطابقة للبحث"
                  : "لا يوجد مستخدمون بعد"}
              </Text>
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
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.textMain,
  },
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
  extendBtn: { backgroundColor: colors.whatsapp },
  actionBtnText: { color: colors.white, fontSize: 13, fontWeight: "800" },
  subRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  subText: { flex: 1, fontSize: 12, color: colors.textMain, textAlign: "right", fontWeight: "600" },
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
  resetCodesBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.debtRedBg,
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.debtRed,
  },
  resetCodesText: { flex: 1, fontSize: 14, fontWeight: "800", color: colors.debtRedDark, textAlign: "right" },
  resetCodesBox: {
    backgroundColor: colors.surface,
    marginHorizontal: 16,
    marginTop: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyCodesText: { color: colors.textMuted, textAlign: "center", padding: 12, fontWeight: "600" },
  codeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    marginBottom: 8,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 10,
  },
  codeUser: { fontSize: 14, fontWeight: "800", color: colors.textMain, textAlign: "right" },
  codeMeta: { fontSize: 11, color: colors.textMuted, marginTop: 2, textAlign: "right" },
  codePill: {
    backgroundColor: colors.debtRed,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  codeValue: { color: colors.white, fontSize: 18, fontWeight: "900", letterSpacing: 3 },
  codeShareBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.whatsapp,
    justifyContent: "center",
    alignItems: "center",
  },
});
