import { Linking } from "react-native";
import { whatsappUrl } from "./api";

export function buildReminderMessage(
  template: string,
  vars: { name: string; shop: string; amount: string; currency: string }
): string {
  return template
    .replace(/\{name\}/g, vars.name)
    .replace(/\{shop\}/g, vars.shop || "بقالتنا")
    .replace(/\{amount\}/g, vars.amount)
    .replace(/\{currency\}/g, vars.currency);
}

export function buildTransactionMessage(params: {
  customerName: string;
  shopName: string;
  txType: "debt" | "payment";
  txAmount: string;
  newBalance: string;
  currency: string;
}): string {
  const { customerName, shopName, txType, txAmount, newBalance, currency } = params;
  const shop = shopName || "بقالتنا";
  if (txType === "debt") {
    return `مرحباً ${customerName}، تم إضافة مبلغ ${txAmount} ${currency} إلى حسابك في ${shop}. رصيدك الحالي: ${newBalance} ${currency}.`;
  }
  return `مرحباً ${customerName}، شكراً لك على السداد. تم استلام ${txAmount} ${currency} في ${shop}. رصيدك الحالي: ${newBalance} ${currency}.`;
}

export async function openWhatsApp(phone: string, message: string) {
  const url = whatsappUrl(phone, message);
  try {
    await Linking.openURL(url);
  } catch {
    /* ignore */
  }
}
