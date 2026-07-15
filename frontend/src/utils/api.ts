import { storage } from "@/src/utils/storage";

const TOKEN_KEY = "daftari_auth_token";

const BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

async function getAuthHeader(): Promise<Record<string, string>> {
  const token = await storage.secureGet<string>(TOKEN_KEY, "");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(await getAuthHeader()),
    ...((opts.headers as Record<string, string>) || {}),
  };
  const res = await fetch(`${BASE_URL}/api${path}`, { ...opts, headers });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg = (data && (data.detail || data.message)) || `HTTP ${res.status}`;
    throw new Error(typeof msg === "string" ? msg : "خطأ في الاتصال");
  }
  return data as T;
}

export type Role = "super_admin" | "owner" | "employee";

export type UserPublic = {
  id: string;
  username: string;
  shop_name?: string | null;
  phone?: string | null;
  role: Role;
  is_active: boolean;
  parent_owner_id?: string | null;
  created_at?: string | null;
};

export type Customer = {
  id: string;
  owner_id: string;
  name: string;
  phone: string;
  max_debt?: number | null;
  created_at: string;
  total_debt: number;
  last_transaction_at?: string | null;
};

export type Transaction = {
  id: string;
  customer_id: string;
  owner_id: string;
  author_id?: string;
  type: "debt" | "payment";
  amount: number;
  notes?: string | null;
  receipt_image?: string | null;
  created_at: string;
};

export type AppSettings = {
  reminder_enabled: boolean;
  reminder_frequency: "daily" | "weekly" | "monthly" | "custom";
  reminder_custom_days: number;
  reminder_template: string;
};

export type PublicConfig = {
  admin_phone: string;
  admin_whatsapp: string;
  subscription_price: number;
  free_tier_limit: number;
};

export const api = {
  config: () => request<PublicConfig>("/config"),
  register: (username: string, password: string, shop_name?: string, phone?: string) =>
    request<{ access_token: string; user: UserPublic }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password, shop_name, phone }),
    }),
  login: (username: string, password: string) =>
    request<{ access_token: string; user: UserPublic }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  me: () => request<UserPublic>("/auth/me"),

  listCustomers: (search?: string) =>
    request<Customer[]>(`/customers${search ? `?search=${encodeURIComponent(search)}` : ""}`),
  getCustomer: (id: string) => request<Customer>(`/customers/${id}`),
  createCustomer: (name: string, phone: string, max_debt?: number) =>
    request<Customer>("/customers", {
      method: "POST",
      body: JSON.stringify({ name, phone, max_debt }),
    }),
  updateCustomer: (id: string, payload: { name?: string; phone?: string; max_debt?: number | null }) =>
    request<Customer>(`/customers/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteCustomer: (id: string) => request<{ ok: boolean }>(`/customers/${id}`, { method: "DELETE" }),
  summary: () => request<{ total_debt: number }>("/customers/summary"),

  listTransactions: (customerId: string) =>
    request<Transaction[]>(`/transactions/${customerId}`),
  createTransaction: (payload: {
    customer_id: string;
    type: "debt" | "payment";
    amount: number;
    notes?: string;
    receipt_image?: string;
  }) => request<Transaction>("/transactions", { method: "POST", body: JSON.stringify(payload) }),
  deleteTransaction: (id: string) =>
    request<{ ok: boolean }>(`/transactions/${id}`, { method: "DELETE" }),

  getSettings: () => request<AppSettings>("/settings"),
  updateSettings: (payload: Partial<AppSettings>) =>
    request<AppSettings>("/settings", { method: "PUT", body: JSON.stringify(payload) }),

  // Staff
  listStaff: () => request<UserPublic[]>("/staff"),
  createStaff: (username: string, password: string, display_name?: string) =>
    request<UserPublic>("/staff", {
      method: "POST",
      body: JSON.stringify({ username, password, display_name }),
    }),
  updateStaff: (id: string, payload: { password?: string; display_name?: string; is_active?: boolean }) =>
    request<UserPublic>(`/staff/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteStaff: (id: string) => request<{ ok: boolean }>(`/staff/${id}`, { method: "DELETE" }),

  // Admin
  adminListUsers: () => request<UserPublic[]>("/admin/users"),
  adminActivate: (id: string) =>
    request<UserPublic>(`/admin/users/${id}/activate`, { method: "PUT" }),
  adminDeactivate: (id: string) =>
    request<UserPublic>(`/admin/users/${id}/deactivate`, { method: "PUT" }),
  adminResetPassword: (id: string, new_password: string) =>
    request<UserPublic>(`/admin/users/${id}/reset-password`, {
      method: "PUT",
      body: JSON.stringify({ new_password }),
    }),
};

// WhatsApp helper
export function whatsappUrl(phone: string, message: string): string {
  let p = (phone || "").replace(/[^\d+]/g, "");
  if (p.startsWith("00")) p = p.slice(2);
  if (p.startsWith("+")) p = p.slice(1);
  return `https://wa.me/${p}?text=${encodeURIComponent(message)}`;
}
