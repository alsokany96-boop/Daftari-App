import React, { useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Modal, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors, ThemeColors } from "@/src/theme";

type Props = {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmColor?: "danger" | "primary" | "success";
  loading?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  onConfirm: () => void;
  onCancel: () => void;
  testID?: string;
};

export default function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = "تأكيد",
  cancelLabel = "إلغاء",
  confirmColor = "danger",
  loading = false,
  icon = "alert-circle",
  onConfirm,
  onCancel,
  testID = "confirm-dialog",
}: Props) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const accent =
    confirmColor === "success"
      ? colors.paymentGreen
      : confirmColor === "primary"
      ? colors.primary
      : colors.debtRed;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.card} testID={testID}>
          <View style={[styles.iconBox, { backgroundColor: accent }]}>
            <Ionicons name={icon} size={30} color="#FFFFFF" />
          </View>
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}

          <View style={styles.actions}>
            <TouchableOpacity
              testID={`${testID}-cancel`}
              onPress={onCancel}
              disabled={loading}
              style={[styles.btn, styles.cancelBtn]}
              activeOpacity={0.85}
            >
              <Text style={[styles.btnText, { color: colors.textMain }]}>{cancelLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID={`${testID}-confirm`}
              onPress={onConfirm}
              disabled={loading}
              style={[styles.btn, { backgroundColor: accent }, loading && { opacity: 0.7 }]}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.btnText}>{confirmLabel}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: "center",
      padding: 24,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 22,
      padding: 24,
      alignItems: "center",
    },
    iconBox: {
      width: 64,
      height: 64,
      borderRadius: 18,
      justifyContent: "center",
      alignItems: "center",
    },
    title: {
      fontSize: 19,
      fontWeight: "900",
      color: colors.textMain,
      marginTop: 14,
      textAlign: "center",
    },
    message: {
      fontSize: 14,
      color: colors.textMuted,
      marginTop: 6,
      textAlign: "center",
      lineHeight: 22,
    },
    actions: { flexDirection: "row", gap: 10, marginTop: 22, width: "100%" },
    btn: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    cancelBtn: { backgroundColor: colors.surfaceAlt },
    btnText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  });
