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

export type UserPublic = { id: string; username: string; shop_name?: string | null };
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
  type: "debt" | "payment";
  amount: number;
  notes?: string | null;
  receipt_image?: string | null;
  created_at: string;
};

export const api = {
  register: (username: string, password: string, shop_name?: string) =>
    request<{ access_token: string; user: UserPublic }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password, shop_name }),
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
};
