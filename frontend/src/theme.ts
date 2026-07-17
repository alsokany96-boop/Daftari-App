import { useColorScheme } from "react-native";

const light = {
  background: "#F8FAFC",
  surface: "#FFFFFF",
  surfaceAlt: "#F1F5F9",
  primary: "#0F172A",
  primaryText: "#FFFFFF",
  debtRed: "#EF4444",
  debtRedDark: "#DC2626",
  debtRedBg: "#FEF2F2",
  paymentGreen: "#22C55E",
  paymentGreenDark: "#16A34A",
  paymentGreenBg: "#F0FDF4",
  whatsapp: "#25D366",
  textMain: "#1E293B",
  textMuted: "#64748B",
  border: "#E2E8F0",
  white: "#FFFFFF",
  overlay: "rgba(0,0,0,0.55)",
  warnBg: "#FEF3C7",
  warnBorder: "#FBBF24",
  warnText: "#B45309",
};

const dark = {
  background: "#0B1220",
  surface: "#111827",
  surfaceAlt: "#1F2937",
  primary: "#F8FAFC",
  primaryText: "#0F172A",
  debtRed: "#F87171",
  debtRedDark: "#EF4444",
  debtRedBg: "#3F1D1D",
  paymentGreen: "#4ADE80",
  paymentGreenDark: "#22C55E",
  paymentGreenBg: "#14351F",
  whatsapp: "#25D366",
  textMain: "#F1F5F9",
  textMuted: "#94A3B8",
  border: "#1F2937",
  white: "#FFFFFF",
  overlay: "rgba(0,0,0,0.7)",
  warnBg: "#3F2D0F",
  warnBorder: "#F59E0B",
  warnText: "#FCD34D",
};

export type ThemeColors = typeof light;

export function useColors(): ThemeColors {
  const scheme = useColorScheme();
  return scheme === "dark" ? dark : light;
}

// Backward-compat default palette (light)
export const colors: ThemeColors = light;

export const CURRENCY = "دينار";
