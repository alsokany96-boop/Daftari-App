import { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Linking,
  Image,
  Modal,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, Customer, Transaction, whatsappUrl } from "@/src/utils/api";
import { useSession } from "@/src/ctx/SessionProvider";
import { useColors, ThemeColors, CURRENCY } from "@/src/theme";
import { fmtAmount, fmtDateTime } from "@/src/utils/format";
import { buildReminderMessage } from "@/src/utils/whatsapp";
import ConfirmDialog from "@/src/components/ConfirmDialog";

export default function CustomerDetailScreen() {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useSession();
  const isOwner = user?.role === "owner" || user?.role === "super_admin";
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingDeleteTx, setPendingDeleteTx] = useState<Transaction | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [c, txs] = await Promise.all([api.getCustomer(id), api.listTransactions(id)]);
      setCustomer(c);
      setTransactions(txs);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const debt = customer?.total_debt ?? 0;
  const isDebt = debt > 0;
  const isSupplier = customer?.party_type === "supplier";
  const overLimit =
    !!customer &&
    customer.max_debt != null &&
    customer.max_debt > 0 &&
    debt >= customer.max_debt;

  const sendWhatsApp = async () => {
    if (!customer) return;
    let template =
      "مرحباً {name}، نود تذكيرك بأن حسابك الحالي في {shop} هو {amount} {currency}. نسعد بزيارتك.";
    try {
      const s = await api.getSettings();
      if (s?.reminder_template) template = s.reminder_template;
    } catch {
      /* default */
    }
    const message = buildReminderMessage(template, {
      name: customer?.name || "",
      shop: user?.shop_name || "بقالتنا",
      amount: fmtAmount(Math.abs(debt)),
      currency: CURRENCY,
    });
    Linking.openURL(whatsappUrl(customer?.phone || "", message)).catch(() => {});
  };

  const sendLimitAlert = () => {
    if (!customer || customer.max_debt == null) return;
    const message = `عزيزي ${customer?.name || ""}، نود تذكيرك بأن مديونيتك قد بلغت الحد الأقصى وهو ${fmtAmount(
      customer.max_debt
    )} ${CURRENCY}. يرجى السداد في أقرب وقت.`;
    Linking.openURL(whatsappUrl(customer?.phone || "", message)).catch(() => {});
  };

  const doDeleteTx = async () => {
    if (!pendingDeleteTx) return;
    setDeleting(true);
    try {
      await api.deleteTransaction(pendingDeleteTx.id);
      setPendingDeleteTx(null);
      load();
    } catch {
      /* ignore */
    } finally {
      setDeleting(false);
    }
  };

  const openEditTx = (t: Transaction) => {
    setEditingTx(t);
    setEditAmount(String(t.amount));
    setEditNotes(t.notes || "");
    setEditError(null);
  };

  const closeEditTx = () => {
    setEditingTx(null);
    setEditAmount("");
    setEditNotes("");
    setEditError(null);
  };

  const saveEditTx = async () => {
    if (!editingTx) return;
    const cleaned = editAmount.trim().replace(",", ".");
    const amt = parseFloat(cleaned);
    if (!isFinite(amt) || amt <= 0) {
      setEditError("الرجاء إدخال مبلغ صحيح أكبر من صفر");
      return;
    }
    setEditSaving(true);
    setEditError(null);
    try {
      await api.updateTransaction(editingTx.id, {
        amount: amt,
        notes: editNotes.trim(),
      });
      closeEditTx();
      await load();
    } catch (e: any) {
      setEditError(e?.message || "فشل التحديث");
    } finally {
      setEditSaving(false);
    }
  };

  const renderTx = ({ item }: { item: Transaction }) => {
    const isDebtTx = item.type === "debt";
    return (
      <View style={styles.txCard} testID={`tx-item-${item.id}`}>
        <View style={[styles.txIcon, isDebtTx ? styles.txIconDebt : styles.txIconPayment]}>
          <Ionicons
            name={isDebtTx ? "arrow-up" : "arrow-down"}
            size={20}
            color={isDebtTx ? colors.debtRed : colors.paymentGreen}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.txType}>
            {isDebtTx
              ? isSupplier
                ? "شراء بالآجل (عليّ)"
                : "دَين / أخذ"
              : isSupplier
              ? "دفعت للمورد"
              : "سداد / دفع"}
          </Text>
          {item.notes ? <Text style={styles.txNotes} numberOfLines={2}>{item.notes}</Text> : null}
          <Text style={styles.txDate}>{fmtDateTime(item.created_at)}</Text>
          {item.receipt_image ? (
            <Image
              source={{ uri: `data:image/jpeg;base64,${item.receipt_image}` }}
              style={styles.txImage}
              resizeMode="cover"
            />
          ) : null}
        </View>
        <View style={{ alignItems: "flex-start", gap: 6 }}>
          <Text
            style={[
              styles.txAmount,
              { color: isDebtTx ? colors.debtRed : colors.paymentGreen },
            ]}
          >
            {isDebtTx ? "+" : "−"}
            {fmtAmount(item.amount)}
          </Text>
          <Text style={styles.txCurrency}>{CURRENCY}</Text>
          {isOwner && (
            <View style={styles.txActionsRow}>
              <TouchableOpacity
                testID={`tx-edit-${item.id}`}
                onPress={() => openEditTx(item)}
                style={[styles.txActionBtn, styles.txEditBtn]}
                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
              >
                <Ionicons name="pencil" size={14} color={colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity
                testID={`tx-delete-${item.id}`}
                onPress={() => setPendingDeleteTx(item)}
                style={[styles.txActionBtn, styles.txDeleteBtn]}
                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
              >
                <Ionicons name="trash" size={14} color={colors.debtRed} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    );
  };

  if (loading || !customer) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={colors.debtRed} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity
          testID="detail-back"
          style={styles.backBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
        >
          <Ionicons name="arrow-forward" size={26} color={colors.textMain} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={styles.headerTitle} numberOfLines={1}>{customer?.name ?? ""}</Text>
          <Text style={styles.headerPhone}>{customer?.phone ?? ""}</Text>
        </View>
        <TouchableOpacity
          testID="detail-edit-button"
          style={styles.backBtn}
          onPress={() => router.push(`/(app)/customer/edit/${customer.id}`)}
          hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
        >
          <Ionicons name="create-outline" size={24} color={colors.debtRed} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id}
        renderItem={renderTx}
        contentContainerStyle={{ paddingBottom: 160, paddingHorizontal: 16, paddingTop: 4 }}
        ListHeaderComponent={
          <View>
            <View style={styles.balanceCard} testID="detail-balance-card">
              <Text style={styles.balanceLabel}>
                {isSupplier
                  ? isDebt
                    ? "المستحق للمورد (عليّ)"
                    : debt < 0
                    ? "دفعة زائدة للمورد"
                    : "لا يوجد رصيد"
                  : isDebt
                  ? "الرصيد المستحق"
                  : debt < 0
                  ? "دفعة مقدمة"
                  : "لا يوجد رصيد"}
              </Text>
              <View style={styles.balanceRow}>
                <Text
                  style={[
                    styles.balanceAmount,
                    { color: isDebt ? colors.debtRed : debt < 0 ? colors.paymentGreen : colors.textMuted },
                  ]}
                  testID="detail-balance-amount"
                >
                  {fmtAmount(Math.abs(debt))}
                </Text>
                <Text style={styles.balanceCurrency}>{CURRENCY}</Text>
              </View>
              {customer.max_debt != null && customer.max_debt > 0 && (
                <Text style={styles.limitHint}>
                  الحد الأقصى: {fmtAmount(customer.max_debt)} {CURRENCY}
                </Text>
              )}
              <TouchableOpacity
                testID="whatsapp-reminder-button"
                style={styles.waBtn}
                onPress={sendWhatsApp}
                activeOpacity={0.85}
              >
                <Ionicons name="logo-whatsapp" size={22} color={colors.white} />
                <Text style={styles.waBtnText}>تذكير بالواتساب</Text>
              </TouchableOpacity>
            </View>

            {overLimit && (
              <View style={styles.alertCard} testID="debt-limit-alert">
                <View style={styles.alertIconBox}>
                  <Ionicons name="warning" size={22} color={colors.warnText} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.alertTitle}>تجاوز حد الدين</Text>
                  <Text style={styles.alertText}>
                    وصل الزبون إلى الحد الأقصى ({fmtAmount(customer.max_debt!)} {CURRENCY}). يُنصح بإرسال تذكير حاسم.
                  </Text>
                </View>
                <TouchableOpacity
                  testID="limit-alert-whatsapp"
                  style={styles.alertBtn}
                  onPress={sendLimitAlert}
                  activeOpacity={0.85}
                >
                  <Ionicons name="logo-whatsapp" size={18} color={colors.white} />
                </TouchableOpacity>
              </View>
            )}

            <Text style={styles.sectionTitle}>سجل العمليات</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyBox} testID="tx-empty">
            <Ionicons name="document-text-outline" size={56} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>لا توجد عمليات بعد</Text>
            <Text style={styles.emptySubtitle}>ابدأ بتسجيل دَين أو سداد</Text>
          </View>
        }
      />

      <View style={styles.actionBar}>
        <TouchableOpacity
          testID="add-debt-button"
          style={[styles.actionBtn, { backgroundColor: colors.debtRed }]}
          onPress={() => router.push(`/(app)/add-transaction?customerId=${customer.id}&type=debt`)}
          activeOpacity={0.85}
        >
          <Ionicons name="remove-circle" size={22} color={colors.white} />
          <Text style={styles.actionText}>{isSupplier ? "شراء آجل / عليّ" : "أخذ / دَين"}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="add-payment-button"
          style={[styles.actionBtn, { backgroundColor: colors.paymentGreen }]}
          onPress={() => router.push(`/(app)/add-transaction?customerId=${customer.id}&type=payment`)}
          activeOpacity={0.85}
        >
          <Ionicons name="add-circle" size={22} color={colors.white} />
          <Text style={styles.actionText}>{isSupplier ? "دفعت له / سداد" : "دفع / سداد"}</Text>
        </TouchableOpacity>
      </View>

      <ConfirmDialog
        visible={!!pendingDeleteTx}
        title="هل أنت متأكد من عملية الحذف؟"
        message="سيتم حذف هذه العملية بشكل نهائي."
        confirmLabel="حذف"
        onCancel={() => setPendingDeleteTx(null)}
        onConfirm={doDeleteTx}
        loading={deleting}
        icon="trash"
        testID="delete-tx-confirm"
      />

      {/* Edit transaction modal */}
      <Modal
        visible={!!editingTx}
        transparent
        animationType="fade"
        onRequestClose={closeEditTx}
      >
        <View style={styles.editOverlay}>
          <View style={styles.editCard} testID="edit-tx-modal">
            <View style={styles.editHeader}>
              <Ionicons name="pencil" size={22} color={colors.primary} />
              <Text style={styles.editTitle}>تعديل العملية</Text>
            </View>
            <Text style={styles.editSubtitle}>
              {editingTx?.type === "debt"
                ? isSupplier
                  ? "شراء بالآجل (عليّ)"
                  : "دَين / أخذ"
                : isSupplier
                ? "دفعت للمورد"
                : "سداد / دفع"}
            </Text>

            <Text style={styles.editLabel}>المبلغ ({CURRENCY}) *</Text>
            <TextInput
              testID="edit-tx-amount"
              style={styles.editAmountInput}
              value={editAmount}
              onChangeText={setEditAmount}
              keyboardType="decimal-pad"
              textAlign="center"
              autoFocus
            />

            <Text style={styles.editLabel}>ملاحظات</Text>
            <TextInput
              testID="edit-tx-notes"
              style={styles.editNotesInput}
              value={editNotes}
              onChangeText={setEditNotes}
              placeholder="اختياري"
              placeholderTextColor={colors.textMuted}
              textAlign="right"
              multiline
            />

            {editError && (
              <Text style={styles.editError} testID="edit-tx-error">
                {editError}
              </Text>
            )}

            <View style={styles.editActions}>
              <TouchableOpacity
                testID="edit-tx-cancel"
                style={[styles.editBtn, styles.editCancelBtn]}
                onPress={closeEditTx}
                disabled={editSaving}
              >
                <Text style={styles.editCancelText}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="edit-tx-save"
                style={[styles.editBtn, styles.editSaveBtn, editSaving && { opacity: 0.7 }]}
                onPress={saveEditTx}
                disabled={editSaving}
              >
                {editSaving ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.editSaveText}>حفظ</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backBtn: { width: 44, height: 44, justifyContent: "center", alignItems: "center" },
    headerTitle: { fontSize: 20, fontWeight: "800", color: colors.textMain },
    headerPhone: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
    balanceCard: {
      backgroundColor: colors.surface,
      marginTop: 16,
      borderRadius: 20,
      padding: 20,
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: "#000",
      shadowOpacity: 0.05,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 2,
    },
    balanceLabel: { color: colors.textMuted, fontSize: 14, fontWeight: "600" },
    balanceRow: { flexDirection: "row", alignItems: "baseline", marginTop: 6, gap: 8 },
    balanceAmount: { fontSize: 40, fontWeight: "900" },
    balanceCurrency: { fontSize: 16, color: colors.textMuted, fontWeight: "700" },
    limitHint: { color: colors.textMuted, fontSize: 12, marginTop: 6, fontWeight: "600" },
    waBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: colors.whatsapp,
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 30,
      marginTop: 16,
      shadowColor: colors.whatsapp,
      shadowOpacity: 0.35,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 4,
    },
    waBtnText: { color: colors.white, fontSize: 16, fontWeight: "800" },
    alertCard: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.warnBg,
      borderColor: colors.warnBorder,
      borderWidth: 1.5,
      borderRadius: 16,
      padding: 14,
      marginTop: 14,
      gap: 12,
    },
    alertIconBox: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.warnBorder,
      justifyContent: "center",
      alignItems: "center",
      opacity: 0.9,
    },
    alertTitle: { fontSize: 14, fontWeight: "900", color: colors.warnText, textAlign: "right" },
    alertText: { fontSize: 12, color: colors.warnText, marginTop: 2, textAlign: "right", lineHeight: 18 },
    alertBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.whatsapp,
      justifyContent: "center",
      alignItems: "center",
    },
    sectionTitle: {
      fontSize: 17,
      fontWeight: "800",
      color: colors.textMain,
      marginTop: 20,
      marginBottom: 8,
      textAlign: "right",
    },
    txCard: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      padding: 14,
      borderRadius: 14,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 12,
    },
    txIcon: { width: 40, height: 40, borderRadius: 20, justifyContent: "center", alignItems: "center" },
    txIconDebt: { backgroundColor: colors.debtRedBg },
    txIconPayment: { backgroundColor: colors.paymentGreenBg },
    txType: { fontSize: 15, fontWeight: "800", color: colors.textMain, textAlign: "right" },
    txNotes: { fontSize: 13, color: colors.textMain, marginTop: 2, textAlign: "right" },
    txDate: { fontSize: 12, color: colors.textMuted, marginTop: 4, textAlign: "right" },
    txImage: { width: 80, height: 60, borderRadius: 8, marginTop: 6 },
    txAmount: { fontSize: 18, fontWeight: "900" },
    txCurrency: { fontSize: 11, color: colors.textMuted, fontWeight: "600" },
    txActionsRow: { flexDirection: "row", gap: 4, marginTop: 6 },
    txActionBtn: {
      width: 28,
      height: 28,
      borderRadius: 14,
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 1,
    },
    txEditBtn: { borderColor: colors.border, backgroundColor: colors.surfaceAlt },
    txDeleteBtn: { borderColor: colors.debtRedBg, backgroundColor: colors.debtRedBg },
    editOverlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: "center",
      padding: 24,
    },
    editCard: {
      backgroundColor: colors.surface,
      borderRadius: 22,
      padding: 22,
    },
    editHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
    editTitle: {
      flex: 1,
      fontSize: 18,
      fontWeight: "900",
      color: colors.textMain,
      textAlign: "right",
    },
    editSubtitle: {
      color: colors.textMuted,
      fontSize: 13,
      fontWeight: "700",
      marginTop: 6,
      textAlign: "right",
    },
    editLabel: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.textMain,
      marginTop: 18,
      marginBottom: 6,
      textAlign: "right",
    },
    editAmountInput: {
      borderWidth: 2,
      borderColor: colors.border,
      borderRadius: 14,
      paddingVertical: 14,
      paddingHorizontal: 12,
      fontSize: 30,
      fontWeight: "900",
      color: colors.textMain,
      backgroundColor: colors.background,
    },
    editNotesInput: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      color: colors.textMain,
      backgroundColor: colors.background,
      minHeight: 60,
      textAlignVertical: "top",
    },
    editError: {
      color: colors.debtRed,
      marginTop: 10,
      textAlign: "right",
      fontWeight: "700",
    },
    editActions: { flexDirection: "row", gap: 10, marginTop: 18 },
    editBtn: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    editCancelBtn: { backgroundColor: colors.surfaceAlt },
    editSaveBtn: { backgroundColor: colors.primary },
    editCancelText: { color: colors.textMain, fontSize: 15, fontWeight: "800" },
    editSaveText: { color: colors.primaryText, fontSize: 15, fontWeight: "800" },
    emptyBox: { alignItems: "center", paddingTop: 40, paddingHorizontal: 40 },
    emptyTitle: { fontSize: 17, fontWeight: "800", color: colors.textMain, marginTop: 12 },
    emptySubtitle: { fontSize: 13, color: colors.textMuted, marginTop: 4, textAlign: "center" },
    actionBar: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      flexDirection: "row",
      padding: 16,
      paddingBottom: 24,
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      gap: 12,
    },
    actionBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 16,
      borderRadius: 14,
      shadowColor: "#000",
      shadowOpacity: 0.15,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 4,
    },
    actionText: { color: colors.white, fontSize: 16, fontWeight: "800" },
  });
