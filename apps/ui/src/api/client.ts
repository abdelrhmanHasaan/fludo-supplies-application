let currentApiBase = (window as any).__API_BASE__ || '';
let currentAppToken = (window as any).__APP_TOKEN__ || '';
let configPromise: Promise<void> | null = null;

export function ensureConfigLoaded(): Promise<void> {
  if (!configPromise) {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.getApiConfig) {
      configPromise = (window as any).electronAPI
        .getApiConfig()
        .then((cfg: any) => {
          if (cfg?.apiBase) currentApiBase = cfg.apiBase;
          if (cfg?.appToken) currentAppToken = cfg.appToken;
        })
        .catch(() => {});
    } else {
      configPromise = Promise.resolve();
    }
  }
  return configPromise || Promise.resolve();
}

// Kick off config resolution immediately on module evaluation
ensureConfigLoaded();

export function getApiBase(): string {
  return currentApiBase || (window.location.origin.includes('3000') || window.location.origin.includes('5173') ? 'http://127.0.0.1:4000/api' : '/api');
}

export function getStoredToken(): string | null {
  return localStorage.getItem('fludo_token');
}

export function setStoredToken(token: string) {
  localStorage.setItem('fludo_token', token);
}

export function clearStoredToken() {
  localStorage.removeItem('fludo_token');
  localStorage.removeItem('fludo_user');
}

export async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  await ensureConfigLoaded();
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  // Attach per-launch app token if present
  if (currentAppToken) {
    headers.set('x-app-token', currentAppToken);
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const base = getApiBase();
  const url = endpoint.startsWith('http') ? endpoint : `${base}${endpoint}`;

  const res = await fetch(url, {
    ...options,
    headers,
  });

  if (!res.ok) {
    let errorMsg = 'حدث خطأ غير متوقع';
    try {
      const errJson = await res.json();
      errorMsg = errJson.error || errJson.message || errorMsg;
    } catch {
      errorMsg = res.statusText || errorMsg;
    }
    throw new Error(errorMsg);
  }

  return (await res.json()) as T;
}

export const api = {
  // Auth
  getAuthStatus: () => apiFetch<{ initialized: boolean; userCount: number }>('/auth/status'),
  setupAdmin: (data: any) => apiFetch<{ message: string; token: string; user: any }>('/auth/setup', { method: 'POST', body: JSON.stringify(data) }),
  login: (credentials: any) => apiFetch<{ token: string; user: any }>('/auth/login', { method: 'POST', body: JSON.stringify(credentials) }),
  me: () => apiFetch<{ user: any }>('/auth/me'),

  // Global Search
  search: (q: string, types?: string) => {
    const params = new URLSearchParams();
    params.set('q', q);
    if (types) params.set('types', types);
    return apiFetch<{ results: any[]; total: number; query: string }>(`/search?${params.toString()}`);
  },

  // Parties
  getParties: (params?: { is_customer?: boolean; is_supplier?: boolean; search?: string }) => {
    const q = new URLSearchParams();
    if (params?.is_customer !== undefined) q.set('is_customer', String(params.is_customer));
    if (params?.is_supplier !== undefined) q.set('is_supplier', String(params.is_supplier));
    if (params?.search) q.set('search', params.search);
    return apiFetch<any[]>(`/parties?${q.toString()}`);
  },
  createParty: (party: any) => apiFetch<any>('/parties', { method: 'POST', body: JSON.stringify(party) }),
  getPartyStatement: (id: string, start?: string, end?: string) => {
    const q = new URLSearchParams();
    if (start) q.set('start_date', start);
    if (end) q.set('end_date', end);
    return apiFetch<any>(`/parties/${id}/statement?${q.toString()}`);
  },
  performNetting: (data: any) => apiFetch<any>('/parties/netting', { method: 'POST', body: JSON.stringify(data) }),

  // Products
  getProducts: () => apiFetch<any[]>('/products'),
  getUnits: () => apiFetch<any[]>('/products/units'),
  saveProduct: (prod: any) => apiFetch<any>('/products', { method: 'POST', body: JSON.stringify(prod) }),

  // Orders / Bookings
  getOrders: (params?: any) => {
    const q = new URLSearchParams(params || {});
    return apiFetch<any[]>(`/orders?${q.toString()}`);
  },
  getOrder: (id: string) => apiFetch<any>(`/orders/${id}`),
  createOrder: (order: any) => apiFetch<any>('/orders', { method: 'POST', body: JSON.stringify(order) }),

  // Invoices
  getSalesInvoices: (params?: any) => {
    const q = new URLSearchParams(params || {});
    return apiFetch<any[]>(`/invoices/sales?${q.toString()}`);
  },
  getSalesInvoice: (id: string) => apiFetch<any>(`/invoices/sales/${id}`),
  createSalesInvoice: (inv: any) => apiFetch<any>('/invoices/sales', { method: 'POST', body: JSON.stringify(inv) }),
  approveSalesInvoice: (id: string, amountPaidNow?: number) =>
    apiFetch<any>(`/invoices/sales/${id}/approve`, { method: 'POST', body: JSON.stringify({ amountPaidNow }) }),
  cancelSalesInvoice: (id: string, approvalId: string, reason: string) =>
    apiFetch<any>(`/invoices/sales/${id}/cancel`, { method: 'POST', body: JSON.stringify({ approvalId, reason }) }),
  getPurchaseInvoices: () => apiFetch<any[]>('/invoices/purchase'),
  createPurchaseInvoice: (inv: any) => apiFetch<any>('/invoices/purchase', { method: 'POST', body: JSON.stringify(inv) }),

  // Payments
  getPayments: (params?: any) => {
    const q = new URLSearchParams(params || {});
    return apiFetch<any[]>(`/payments?${q.toString()}`);
  },
  recordPayment: (payment: any) => apiFetch<any>('/payments', { method: 'POST', body: JSON.stringify(payment) }),

  // Inventory
  getInventory: () => apiFetch<any[]>('/inventory'),
  getStockMovements: (productId?: string) => apiFetch<any[]>(`/inventory/movements${productId ? `?product_id=${productId}` : ''}`),
  recordAdjustment: (adj: any) => apiFetch<any>('/inventory/adjustment', { method: 'POST', body: JSON.stringify(adj) }),

  // Treasury
  getCashAccounts: () => apiFetch<any[]>('/treasury/accounts'),
  transferCash: (data: any) => apiFetch<any>('/treasury/transfer', { method: 'POST', body: JSON.stringify(data) }),
  recordCashCount: (data: any) => apiFetch<any>('/treasury/count', { method: 'POST', body: JSON.stringify(data) }),

  // Payroll
  getEmployees: () => apiFetch<any[]>('/payroll/employees'),
  createEmployee: (emp: any) => apiFetch<any>('/payroll/employees', { method: 'POST', body: JSON.stringify(emp) }),
  recordAttendance: (records: any[]) => apiFetch<any>('/payroll/attendance', { method: 'POST', body: JSON.stringify({ records }) }),
  getEmployeeStatement: (id: string, start: string, end: string) =>
    apiFetch<any>(`/payroll/statement/${id}?start_date=${start}&end_date=${end}`),
  settlePayroll: (data: any) => apiFetch<any>('/payroll/settle', { method: 'POST', body: JSON.stringify(data) }),

  // Equipment
  getEquipment: () => apiFetch<any[]>('/equipment'),
  recordEquipmentExpense: (exp: any) => apiFetch<any>('/equipment/expenses', { method: 'POST', body: JSON.stringify(exp) }),
  getEquipmentExpenses: (equipmentId?: string) =>
    apiFetch<any[]>(`/equipment/expenses${equipmentId ? `?equipment_id=${equipmentId}` : ''}`),

  // Expenses
  getExpenses: () => apiFetch<any[]>('/expenses'),
  getExpenseCategories: () => apiFetch<any[]>('/expenses/categories'),
  recordExpense: (exp: any) => apiFetch<any>('/expenses', { method: 'POST', body: JSON.stringify(exp) }),

  // Reports
  getDashboard: () => apiFetch<any>('/reports/dashboard'),
  getTrialBalance: () => apiFetch<any>('/reports/trial-balance'),
  getIncomeStatement: (start?: string, end?: string) =>
    apiFetch<any>(`/reports/income-statement${start && end ? `?start_date=${start}&end_date=${end}` : ''}`),
  getCustomerAging: () => apiFetch<any[]>('/reports/customer-aging'),

  // Approvals
  verifyManagerPin: (targetTable: string, targetId: string, reason: string, managerPin: string) =>
    apiFetch<any>('/approvals/verify-pin', { method: 'POST', body: JSON.stringify({ targetTable, targetId, reason, managerPin }) }),

  // Audit
  getAuditLogs: (table?: string) => apiFetch<any[]>(`/audit/logs${table ? `?table_name=${table}` : ''}`),
  verifyAuditChain: () => apiFetch<any>('/audit/verify'),

  // Data Portability
  previewExcelImport: (formData: FormData) =>
    apiFetch<any>('/data/import/preview', { method: 'POST', body: formData }),
  commitExcelImport: (preview: any, mode?: string) =>
    apiFetch<any>('/data/import/commit', { method: 'POST', body: JSON.stringify({ preview, mode }) }),
  importSql: (sqlScript: string) =>
    apiFetch<any>('/data/import/sql', { method: 'POST', body: JSON.stringify({ sqlScript }) }),

  // Company Profile & Onboarding Setup
  getCompanyProfile: () => apiFetch<any>('/company/profile'),
  updateCompanyProfile: (data: any) => apiFetch<any>('/company/profile', { method: 'PUT', body: JSON.stringify(data) }),
  setupCompany: (data: any) => apiFetch<any>('/company/setup', { method: 'POST', body: JSON.stringify(data) }),
  updateCompanyAndManager: (data: any) => apiFetch<any>('/company/manage', { method: 'PUT', body: JSON.stringify(data) }),
  smartDelete: (type: string, id: string, pin: string) => apiFetch<any>('/company/delete-item', { method: 'POST', body: JSON.stringify({ type, id, pin }) }),
  resetOperationalData: (pin: string) => apiFetch<any>('/company/reset-movements', { method: 'POST', body: JSON.stringify({ pin }) }),

  // Cloud Sync
  getSyncStatus: () => apiFetch<{
    enabled: boolean;
    serverUrl: string;
    lastSuccessAt: string | null;
    lastError: string | null;
    lastPushedId: number;
    pendingCount: number;
    totalCount: number;
    tenantId: string;
  }>('/sync/status'),
  saveSyncConfig: (data: { serverUrl: string; enabled: boolean; tenantToken?: string }) =>
    apiFetch<{ success: boolean; message: string }>('/sync/config', { method: 'POST', body: JSON.stringify(data) }),
  testSyncConnection: (serverUrl: string) =>
    apiFetch<{ success: boolean; message: string }>('/sync/test', { method: 'POST', body: JSON.stringify({ serverUrl }) }),
  triggerSync: () =>
    apiFetch<{ success: boolean; message: string; pushedCount: number }>('/sync/trigger', { method: 'POST' }),
  enqueueAllForSync: () =>
    apiFetch<{ success: boolean; message: string; enqueuedCount: number }>('/sync/enqueue-all', { method: 'POST' }),
};
