/**
 * Axios API client — all backend communication goes through this module.
 * Configured with credentials for httpOnly cookie auth.
 */
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || '';

const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ─── Auth ─────────────────────────────────────────────────
export const login = (username: string, password: string) => {
  const formData = new FormData();
  formData.append('username', username);
  formData.append('password', password);
  return api.post('/api/auth/login', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export const checkSession = () => api.get('/api/auth/check');
export const logout = () => api.get('/auth/logout');

// ─── Dashboard ────────────────────────────────────────────
export const fetchDashboard = (params: Record<string, any>) =>
  api.get('/api/dashboard', { params });

export const toggleShortlist = (productId: number) =>
  api.post(`/api/products/${productId}/shortlist`);

export const updateProductStatus = (productId: number, status: string) =>
  api.put(`/api/products/${productId}/status`, { status });

export const moveToNewStatus = (productId: number) =>
  api.post(`/api/product/${productId}/move-to-new-status`);

export const refreshDashboard = () => api.post('/api/dashboard/refresh');

// ─── Sidebar ──────────────────────────────────────────────
export const fetchSidebar = () => api.get('/api/sidebar');

// ─── Bestsellers ──────────────────────────────────────────
export const fetchBestsellers = (params: Record<string, any>) =>
  api.get('/api/bestsellers', { params });

export const refreshBestsellers = () => api.post('/api/bestsellers/refresh');

// ─── Product ──────────────────────────────────────────────
export const fetchProduct = (productId: number) =>
  api.get(`/api/product/${productId}`);

export const fetchSimilarProducts = (productId: number) =>
  api.get(`/api/product/${productId}/similar`);

export const fetchPipelineDetails = (productId: number) =>
  api.get(`/api/product/${productId}/pipeline-details`);

export const savePipelineDetails = (productId: number, data: any) =>
  api.post(`/api/product/${productId}/pipeline-details`, data);

export const generateSeasonality = (productId: number) =>
  api.post(`/api/product/${productId}/seasonality/generate`);

export const autofillTaric = (productId: number) =>
  api.post(`/api/product/${productId}/financial-review/autofill`);

export const patchKeyData = (productId: number, data: any) =>
  api.patch(`/api/product/${productId}/key-data`, data);

// ─── Pipeline Status ──────────────────────────────────────
export const fetchPipelineStatus = (statusSlug: string, params?: Record<string, any>) =>
  api.get(`/api/pipeline/${statusSlug}`, { params });

export const exportPipelineExcel = (statusSlug: string, params?: Record<string, any>) =>
  api.get(`/api/pipeline/${statusSlug}/export`, { params, responseType: 'blob' });

// ─── Opportunities ────────────────────────────────────────
export const fetchOpportunities = () => api.get('/api/opportunities');

export const batchGenerateSeasonality = () =>
  api.post('/api/opportunities/generate-seasonality');

export const exportOpportunitiesExcel = () =>
  api.get('/api/opportunities/export-excel', { responseType: 'blob' });

// ─── Analytics ────────────────────────────────────────────
export const fetchAnalytics = () => api.get('/api/analytics');
export const fetchStoreAnalytics = () => api.get('/api/store-analytics');
export const refreshStoreAnalytics = () => api.post('/api/store-analytics/refresh');

// ─── Parser Status ────────────────────────────────────────
export const fetchParserStatus = () => api.get('/api/parser-status');
export const fetchParserRuns = (parserId?: number) =>
  api.get('/api/parser-runs', { params: parserId ? { parser_id: parserId } : {} });

// ─── Config ───────────────────────────────────────────────
export const fetchConfig = () => api.get('/api/config/data');

export const createProductCategory = (data: { name: string; code: string }) =>
  api.post('/api/config/product-categories', data);

export const updateProductCategory = (id: number, data: { name: string; code: string }) =>
  api.put(`/api/config/product-categories/${id}`, data);

export const deleteProductCategory = (id: number) =>
  api.delete(`/api/config/product-categories/${id}`);

export const createParserCategory = (data: { name: string }) =>
  api.post('/api/config/parser-defined-categories', data);

export const createProductGroup = (data: { name: string }) =>
  api.post('/api/config/product-groups', data);

export const updateProductGroup = (id: number, data: { name: string }) =>
  api.put(`/api/config/product-groups/${id}`, data);

export const deleteProductGroup = (id: number) =>
  api.delete(`/api/config/product-groups/${id}`);

export const assignParserCategories = (assignments: any[]) =>
  api.post('/api/config/parsers/assign-categories', assignments);

export const updateSetting = (key: string, value: string) => {
  const formData = new FormData();
  formData.append('setting_key', key);
  formData.append('setting_value', value);
  return api.post('/api/config/application-settings/update-via-form', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export const triggerSalesRankings = () =>
  api.post('/api/config/tasks/update-sales-rankings');

// ─── System Monitoring ────────────────────────────────────
export const fetchSystemMonitoring = () =>
  api.get('/api/system/monitoring');

export const refreshSingleMV = (mvName: string) =>
  api.post(`/api/system/refresh-mv/${mvName}`);

export default api;
