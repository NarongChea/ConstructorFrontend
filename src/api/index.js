import api from './Axios.js'

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authAPI = {
  login:    (d) => api.post('/auth/login', d),
  me:       ()  => api.get('/auth/me'),
  register: (d) => api.post('/auth/register', d),
}

// ── Categories ────────────────────────────────────────────────────────────────
export const categoryAPI = {
  list:   (p) => api.get('/categories', { params: p }),
  get:    (id) => api.get(`/categories/${id}`),
  create: (d)  => api.post('/categories', d),
  update: (id, d) => api.patch(`/categories/${id}`, d),
  delete: (id) => api.delete(`/categories/${id}`),
}

// ── Locations ─────────────────────────────────────────────────────────────────
export const locationAPI = {
  list:   (p) => api.get('/locations', { params: p }),
  create: (d)  => api.post('/locations', d),
  update: (id, d) => api.patch(`/locations/${id}`, d),
  delete: (id) => api.delete(`/locations/${id}`),
}

// ── Unit Types ────────────────────────────────────────────────────────────────
export const unitTypeAPI = {
  list:              (p)        => api.get('/unit-types', { params: p }),
  get:               (id)       => api.get(`/unit-types/${id}`),
  create:            (d)        => api.post('/unit-types', d),
  update:            (id, d)    => api.patch(`/unit-types/${id}`, d),
  delete:            (id)       => api.delete(`/unit-types/${id}`),
  addMeasurement:    (id, d)    => api.post(`/unit-types/${id}/measurements`, d),
  removeMeasurement: (id, sym)  => api.delete(`/unit-types/${id}/measurements/${sym}`),
}

// ── Products ──────────────────────────────────────────────────────────────────
export const productAPI = {
  list:   (p)     => api.get('/products', { params: p }),
  get:    (id)    => api.get(`/products/${id}`),
  create: (d)     => api.post('/products', d),
  update: (id, d) => api.patch(`/products/${id}`, d),
  delete: (id)    => api.delete(`/products/${id}`),
}

// ── Variants ──────────────────────────────────────────────────────────────────
export const variantAPI = {
  listByProduct: (productId, p) => api.get(`/variants/product/${productId}`, { params: p }),
  list:          (p)            => api.get('/variants', { params: p }),
  get:           (id)           => api.get(`/variants/${id}`),
  create:        (d)            => api.post('/variants', d),
  update:        (id, d)        => api.patch(`/variants/${id}`, d),
  delete:        (id)           => api.delete(`/variants/${id}`),
  adjustStock:   (id, d)        => api.post(`/variants/${id}/adjust-stock`, d),
  lowStock:      ()             => api.get('/variants/low-stock'),
}

// ── Invoices ──────────────────────────────────────────────────────────────────
// NOTE: invoices with many line items (bulk orders, 30-40+ variants) can take
// longer than the global 15s default to process server-side (stock checks,
// price resolution, stock-history writes per item). Override the timeout on
// these specific calls rather than raising the global default, so unrelated
// requests still fail fast if something is actually hung.
const BULK_TIMEOUT = 60000 // 60s

export const invoiceAPI = {
  list:         (p)     => api.get('/invoices', { params: p }),
  get:          (id)    => api.get(`/invoices/${id}`),
  create:       (d)     => api.post('/invoices', d, { timeout: BULK_TIMEOUT }),
  updateStatus: (id, s) => api.patch(`/invoices/${id}/status`, { status: s }),
  markPrinted:  (id)    => api.patch(`/invoices/${id}/print`),
  update:       (id, d) => api.put(`/invoices/${id}`, d, { timeout: BULK_TIMEOUT }),
  preview:      (d)     => api.post('/invoices/preview', d, { timeout: BULK_TIMEOUT }),
  history:      (id)    => api.get(`/invoices/${id}/history`),
}

// ── Purchases ─────────────────────────────────────────────────────────────────
export const purchaseAPI = {
  list:   (p)  => api.get('/purchases', { params: p }),
  get:    (id) => api.get(`/purchases/${id}`),
  create: (d)  => api.post('/purchases', d, { timeout: BULK_TIMEOUT }),
}

// ── Partners ──────────────────────────────────────────────────────────────────
export const partnerAPI = {
  list:            (p)     => api.get('/partners', { params: p }),
  get:             (id)    => api.get(`/partners/${id}`),
  create:          (d)     => api.post('/partners', d),
  update:          (id, d) => api.patch(`/partners/${id}`, d),
  delete:          (id)    => api.delete(`/partners/${id}`),
  getBalance:      (id)    => api.get(`/partners/${id}/balance`),
  getTransactions: (id, p) => api.get(`/partners/${id}/transactions`, { params: p }),
}

// ── Suppliers ─────────────────────────────────────────────────────────────────
export const supplierAPI = {
  list:   (p)     => api.get('/suppliers', { params: p }),
  get:    (id)    => api.get(`/suppliers/${id}`),
  create: (d)     => api.post('/suppliers', d),
  update: (id, d) => api.patch(`/suppliers/${id}`, d),
  delete: (id)    => api.delete(`/suppliers/${id}`),
}

// ── User Prices ───────────────────────────────────────────────────────────────
export const userPriceAPI = {
  forPartner:  (id)    => api.get(`/user-prices/partner/${id}`),
  forVariant:  (id)    => api.get(`/user-prices/variant/${id}`),
  resolve:     (p)     => api.get('/user-prices/resolve', { params: p }),
  upsert:      (d)     => api.put('/user-prices', d),
  delete:      (id)    => api.delete(`/user-prices/${id}`),
}

// ── Reports ───────────────────────────────────────────────────────────────────
export const reportAPI = {
  daily:             (p) => api.get('/reports/daily',             { params: p }),
  monthly:           (p) => api.get('/reports/monthly',           { params: p }),
  yearly:            (p) => api.get('/reports/yearly',            { params: p }),
  bestSelling:       (p) => api.get('/reports/best-selling',      { params: p }),
  revenueVsCost:     (p) => api.get('/reports/revenue-vs-cost',   { params: p }),
  partnerSales:      (p) => api.get('/reports/partner-sales',     { params: p }),
  partnerPurchases:  (p) => api.get('/reports/partner-purchases', { params: p }),
  spending:          (p) => api.get('/reports/spending',          { params: p }),
}

// ── Stock ─────────────────────────────────────────────────────────────────────
export const stockAPI = {
  history:  (p) => api.get('/stock/history',  { params: p }),
  lowStock: ()  => api.get('/stock/low-stock'),
  adjust:   (d) => api.post('/stock/adjust', d),
}

// ── Employees ─────────────────────────────────────────────────────────────────
export const employeeAPI = {
  list:   (p)     => api.get('/employees', { params: p }),
  get:    (id)    => api.get(`/employees/${id}`),
  create: (d)     => api.post('/employees', d),
  update: (id, d) => api.patch(`/employees/${id}`, d),
  delete: (id)    => api.delete(`/employees/${id}`),
}

// ── Salaries ──────────────────────────────────────────────────────────────────
export const salaryAPI = {
  list:   (p) => api.get('/salaries', { params: p }),
  pay:    (d) => api.post('/salaries', d),
}

// ── Debts ─────────────────────────────────────────────────────────────────────
export const debtAPI = {
  list:   (p)     => api.get('/debts', { params: p }),
  get:    (id)    => api.get(`/debts/${id}`),
  create: (d)     => api.post('/debts', d),
  update: (id, d) => api.patch(`/debts/${id}`, d),
  pay:    (id, d) => api.post(`/debts/${id}/pay`, d),
  delete: (id)    => api.delete(`/debts/${id}`),
}

// ── Activity Logs ─────────────────────────────────────────────────────────────
export const activityLogAPI = {
  list:        (p)                    => api.get('/activity-logs', { params: p }),
  get:         (id)                   => api.get(`/activity-logs/${id}`),
  forResource: (resource, resourceId) => api.get(`/activity-logs/resource/${resource}/${resourceId}`),
}

// ── Settings ──────────────────────────────────────────────────────────────────
export const settingAPI = {
  getAll:          ()     => api.get('/settings'),
  getExchangeRate: ()     => api.get('/settings/exchange-rate'),
  updateExchangeRate: (d) => api.put('/settings/exchange-rate', d),
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export const dashboardAPI = {
  stats: () => api.get('/dashboard/stats'),
}