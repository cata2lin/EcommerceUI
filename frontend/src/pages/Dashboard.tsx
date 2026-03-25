/**
 * Dashboard — Primary product grid with 8 filters, 12 sortable columns,
 * inline status dropdown, shortlist heart, pagination, and refresh.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  fetchDashboard, toggleShortlist, updateProductStatus,
  moveToNewStatus, refreshDashboard
} from '../api';
import { useSidebar } from '../contexts/SidebarContext';
import './Dashboard.css';

const PIPELINE_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: '__none__', label: 'No Status' },
  { value: 'New', label: 'New' },
  { value: 'Supplier Info', label: 'Supplier Info' },
  { value: 'Financial Review', label: 'Financial Review' },
  { value: 'Market Research', label: 'Market Research' },
  { value: 'Approved', label: 'Approved' },
  { value: 'Hold', label: 'Hold' },
  { value: 'Discarded', label: 'Discarded' },
];

const RANKING_OPTIONS = [
  { value: '', label: 'All Rankings' },
  { value: 'High', label: 'High' },
  { value: 'Good', label: 'Good' },
  { value: 'Slow', label: 'Slow' },
  { value: 'Poor', label: 'Poor' },
];

const STATUS_COLORS: Record<string, string> = {
  'New': 'badge-info',
  'Supplier Info': 'badge-neutral',
  'Financial Review': 'badge-warning',
  'Market Research': 'badge-info',
  'Approved': 'badge-healthy',
  'Hold': 'badge-warning',
  'Discarded': 'badge-error',
};

const RANK_COLORS: Record<string, string> = {
  High: 'badge-healthy',
  Good: 'badge-info',
  Slow: 'badge-warning',
  Poor: 'badge-error',
};

const GRADE_COLORS: Record<string, string> = {
  A: 'badge-healthy',
  B: 'badge-info',
  C: 'badge-warning',
  D: 'badge-error',
  F: 'badge-neutral',
};

const GRADE_OPTIONS = [
  { value: '', label: 'All Grades' },
  { value: 'A', label: 'A — Excellent' },
  { value: 'B', label: 'B — Good' },
  { value: 'C', label: 'C — Average' },
  { value: 'D', label: 'D — Weak' },
  { value: 'F', label: 'F — Skip' },
];

const SORTABLE_COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'parser_name', label: 'Store' },
  { key: 'vendor', label: 'Vendor' },
  { key: 'pipeline_status', label: 'Status' },
  { key: 'sales_ranking', label: 'Rank' },
  { key: 'stock', label: 'Stock' },
  { key: 'stock_diff', label: 'Sold' },
  { key: 'avg_1d', label: 'Avg 1D' },
  { key: 'avg_7d', label: 'Avg 7D' },
  { key: 'avg_30d', label: 'Avg 30D' },
  { key: 'price', label: 'Price' },
  { key: 'score', label: 'Score' },
  { key: 'last_updated', label: 'Updated' },
];

const UPDATED_WITHIN_OPTIONS = [
  { value: '', label: 'Any Time' },
  { value: '1', label: 'Last 24h' },
  { value: '3', label: 'Last 3 days' },
  { value: '7', label: 'Last 7 days' },
  { value: '14', label: 'Last 14 days' },
  { value: '30', label: 'Last 30 days' },
];

interface Product {
  id: number;
  name: string;
  url: string;
  image: string;
  vendor: string;
  parser_name: string;
  pipeline_status: string | null;
  sales_ranking: string | null;
  shortlisted: boolean;
  stock: number | null;
  stock_diff: number | null;
  price: number | null;
  avg_1d: number | null;
  avg_7d: number | null;
  avg_30d: number | null;
  is_stale: boolean;
  last_updated: string | null;
  score: number;
  grade: string;
  flags: {
    oscillating: boolean;
    liquidating: boolean;
    restocking: boolean;
    new_listing: boolean;
  };
}

function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function Dashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { refresh: refreshSidebar } = useSidebar();
  const navigate = useNavigate();
  const scrollRestoredRef = useRef(false);

  // Data
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // ─── Read applied filter/sort/page state from URL ───
  const parserId = searchParams.get('parser_id') || '';
  const isWatchlist = parserId === 'watchlist';
  const sortBy = searchParams.get('sort_by') || 'avg_30d';
  const sortDir = (searchParams.get('sort_dir') || 'desc') as 'asc' | 'desc';
  const page = parseInt(searchParams.get('page') || '1', 10) || 1;

  // Applied filters (from URL — these drive the API call)
  const appliedFilters = {
    name_filter: searchParams.get('name_filter') || '',
    vendor_filter: searchParams.get('vendor_filter') || '',
    pipeline_status_filter: searchParams.get('pipeline_status_filter') || '',
    sales_ranking_filter: searchParams.get('sales_ranking_filter') || '',
    min_price: searchParams.get('min_price') || '',
    max_price: searchParams.get('max_price') || '',
    min_stock: searchParams.get('min_stock') || '',
    max_stock: searchParams.get('max_stock') || '',
    exclude_stale: searchParams.get('exclude_stale') === 'true',
    min_avg_30d: searchParams.get('min_avg_30d') || '',
    max_avg_30d: searchParams.get('max_avg_30d') || '',
    min_sold: searchParams.get('min_sold') || '',
    max_sold: searchParams.get('max_sold') || '',
    updated_within_days: searchParams.get('updated_within_days') || '',
    min_score: searchParams.get('min_score') || '',
    grade_filter: searchParams.get('grade_filter') || '',
  };

  // ─── Local form state (user edits these, applied on button click) ───
  const [form, setForm] = useState(appliedFilters);
  const [advancedOpen, setAdvancedOpen] = useState(
    !!(form.min_avg_30d || form.max_avg_30d || form.min_sold || form.max_sold || form.updated_within_days || form.min_score)
  );

  // Sync form state when URL params change externally (e.g. sidebar store click)
  useEffect(() => {
    setForm(appliedFilters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.toString()]);

  const updateField = (key: string, value: string | boolean) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  // ─── Apply all filters at once ───
  const applyFilters = () => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      // Reset page to 1
      next.set('page', '1');
      // Set all filter values
      const filterKeys = [
        'name_filter', 'vendor_filter', 'pipeline_status_filter', 'sales_ranking_filter',
        'min_price', 'max_price', 'min_stock', 'max_stock',
        'min_avg_30d', 'max_avg_30d', 'min_sold', 'max_sold',
        'updated_within_days', 'min_score', 'grade_filter',
      ];
      for (const k of filterKeys) {
        const v = (form as any)[k];
        if (v && String(v).trim()) {
          next.set(k, String(v).trim());
        } else {
          next.delete(k);
        }
      }
      // Handle exclude_stale (default is false / unchecked)
      if (form.exclude_stale) {
        next.set('exclude_stale', 'true');
      } else {
        next.delete('exclude_stale'); // false is default
      }
      return next;
    }, { replace: true });
  };

  const clearFilters = () => {
    const empty = {
      name_filter: '', vendor_filter: '', pipeline_status_filter: '', sales_ranking_filter: '',
      min_price: '', max_price: '', min_stock: '', max_stock: '', exclude_stale: false,
      min_avg_30d: '', max_avg_30d: '', min_sold: '', max_sold: '',
      updated_within_days: '', min_score: '', grade_filter: '',
    };
    setForm(empty);
    setSearchParams(prev => {
      const next = new URLSearchParams();
      // Keep only parser_id, sort, page
      const pid = prev.get('parser_id');
      if (pid) next.set('parser_id', pid);
      next.set('sort_by', sortBy);
      next.set('sort_dir', sortDir);
      next.set('page', '1');
      return next;
    }, { replace: true });
  };

  // ─── Helper to update URL params for sort/page (instant) ───
  const updateParams = useCallback((updates: Record<string, string | number | boolean>) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(updates)) {
        const str = String(v);
        if (str === '') { next.delete(k); } else { next.set(k, str); }
      }
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const setPage = useCallback((p: number | ((prev: number) => number)) => {
    const newPage = typeof p === 'function' ? p(page) : p;
    updateParams({ page: String(newPage) });
  }, [updateParams, page]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = {
        page,
        sort_by: sortBy,
        sort_dir: sortDir,
        exclude_stale: appliedFilters.exclude_stale,
      };
      if (appliedFilters.name_filter) params.name_filter = appliedFilters.name_filter;
      if (appliedFilters.vendor_filter) params.vendor_filter = appliedFilters.vendor_filter;
      if (appliedFilters.pipeline_status_filter) params.pipeline_status_filter = appliedFilters.pipeline_status_filter;
      if (appliedFilters.sales_ranking_filter) params.sales_ranking_filter = appliedFilters.sales_ranking_filter;
      if (appliedFilters.min_price) params.min_price = parseFloat(appliedFilters.min_price);
      if (appliedFilters.max_price) params.max_price = parseFloat(appliedFilters.max_price);
      if (appliedFilters.min_stock) params.min_stock = parseInt(appliedFilters.min_stock);
      if (appliedFilters.max_stock) params.max_stock = parseInt(appliedFilters.max_stock);
      if (appliedFilters.min_avg_30d) params.min_avg_30d = parseFloat(appliedFilters.min_avg_30d);
      if (appliedFilters.max_avg_30d) params.max_avg_30d = parseFloat(appliedFilters.max_avg_30d);
      if (appliedFilters.min_sold) params.min_sold = parseFloat(appliedFilters.min_sold);
      if (appliedFilters.max_sold) params.max_sold = parseFloat(appliedFilters.max_sold);
      if (appliedFilters.updated_within_days) params.updated_within_days = parseInt(appliedFilters.updated_within_days);
      if (appliedFilters.min_score) params.min_score = parseInt(appliedFilters.min_score);
      if (appliedFilters.grade_filter) params.grade_filter = appliedFilters.grade_filter;
      if (parserId && !isWatchlist) params.parser_id = parserId;
      if (isWatchlist) params.parser_id = 'watchlist';

      const res = await fetchDashboard(params);
      setProducts(res.data.products || []);
      setTotal(res.data.total || 0);
      setTotalPages(res.data.total_pages || 1);
    } catch (err) {
      console.error('Dashboard load failed:', err);
    } finally {
      setLoading(false);
    }
  }, [page, sortBy, sortDir, parserId, isWatchlist, searchParams.toString()]);

  useEffect(() => { loadData(); }, [loadData]);

  // Restore scroll position after data loads
  useEffect(() => {
    if (!loading && products.length > 0 && !scrollRestoredRef.current) {
      const saved = sessionStorage.getItem('dashboard_scroll');
      if (saved) {
        requestAnimationFrame(() => {
          window.scrollTo(0, parseInt(saved, 10));
          sessionStorage.removeItem('dashboard_scroll');
        });
      }
      scrollRestoredRef.current = true;
    }
  }, [loading, products]);

  /** Save scroll position before navigating to a product */
  const navigateToProduct = (path: string) => {
    sessionStorage.setItem('dashboard_scroll', String(window.scrollY));
    navigate(path);
  };

  const handleSort = (key: string) => {
    if (sortBy === key) {
      updateParams({ sort_dir: sortDir === 'asc' ? 'desc' : 'asc', page: '1' });
    } else {
      updateParams({ sort_by: key, sort_dir: 'desc', page: '1' });
    }
  };

  const handleToggleShortlist = async (product: Product) => {
    setProducts(prev => prev.map(p => p.id === product.id ? { ...p, shortlisted: !p.shortlisted } : p));
    try {
      await toggleShortlist(product.id);
      refreshSidebar();
    } catch {
      setProducts(prev => prev.map(p => p.id === product.id ? { ...p, shortlisted: product.shortlisted } : p));
    }
  };

  const handleStatusChange = async (productId: number, newStatus: string) => {
    setProducts(prev => prev.map(p => p.id === productId ? { ...p, pipeline_status: newStatus } : p));
    try {
      await updateProductStatus(productId, newStatus);
      refreshSidebar();
    } catch {
      loadData();
    }
  };

  const handleAddToPipeline = async (productId: number) => {
    setProducts(prev => prev.map(p => p.id === productId ? { ...p, pipeline_status: 'New' } : p));
    try {
      await moveToNewStatus(productId);
      refreshSidebar();
    } catch {
      loadData();
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshDashboard();
      await loadData();
      refreshSidebar();
    } finally {
      setRefreshing(false);
    }
  };

  // Pagination helpers
  const [goToPage, setGoToPage] = useState('');

  const renderPagination = () => {
    if (totalPages <= 1) return null;
    const pages: (number | string)[] = [];
    const range = 3; // show ±3 pages around current
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= page - range && i <= page + range)) {
        pages.push(i);
      } else if (pages[pages.length - 1] !== '...') {
        pages.push('...');
      }
    }

    const handleGoTo = () => {
      const target = parseInt(goToPage, 10);
      if (target >= 1 && target <= totalPages) {
        setPage(target);
        setGoToPage('');
      }
    };

    return (
      <div className="dash-pagination">
        <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
        <div className="dash-pagination-pages">
          {pages.map((p, i) => (
            typeof p === 'number' ? (
              <button key={i} className={`dash-page-btn ${p === page ? 'active' : ''}`} onClick={() => setPage(p)}>{p}</button>
            ) : (
              <span key={i} className="dash-page-ellipsis">…</span>
            )
          ))}
        </div>
        <span className="text-xs">Page {page} of {totalPages}</span>
        <div className="dash-goto">
          <input
            className="input" type="number" min={1} max={totalPages}
            placeholder="Go to"
            value={goToPage}
            onChange={e => setGoToPage(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleGoTo(); }}
            style={{ width: 64, fontSize: '0.75rem', padding: '4px 8px', minHeight: 28 }}
          />
          <button className="btn btn-ghost btn-sm" onClick={handleGoTo}>Go</button>
        </div>
        <button className="btn btn-ghost btn-sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
      </div>
    );
  };

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-4">
          <h1>{isWatchlist ? 'Watchlist' : 'All Products'}</h1>
          <span className="text-sm text-muted">{total.toLocaleString()} products</span>
        </div>
        <button className={`btn btn-ghost btn-sm ${refreshing ? 'animate-pulse' : ''}`} onClick={handleRefresh} disabled={refreshing}>
          ↻ Refresh
        </button>
      </div>

      {/* Filter Bar */}
      <div className="card dash-filter-bar">
        <div className="dash-filter-row">
          <input
            className="input" placeholder="Search name, vendor, or #ID..."
            value={form.name_filter} onChange={e => updateField('name_filter', e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') applyFilters(); }}
            style={{ maxWidth: 280 }}
          />
          <select className="select" value={form.vendor_filter} onChange={e => updateField('vendor_filter', e.target.value)} style={{ maxWidth: 180 }}>
            <option value="">All Vendors</option>
          </select>
          <select className="select" value={form.pipeline_status_filter} onChange={e => updateField('pipeline_status_filter', e.target.value)} style={{ maxWidth: 170 }}>
            {PIPELINE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select className="select" value={form.sales_ranking_filter} onChange={e => updateField('sales_ranking_filter', e.target.value)} style={{ maxWidth: 140 }}>
            {RANKING_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select className="select" value={form.grade_filter} onChange={e => updateField('grade_filter', e.target.value)} style={{ maxWidth: 150 }}>
            {GRADE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <label className="dash-checkbox-label">
            <input type="checkbox" checked={form.exclude_stale} onChange={e => updateField('exclude_stale', e.target.checked)} />
            <span>Hide stale</span>
          </label>
          <button className="btn btn-ghost btn-sm" onClick={() => setAdvancedOpen(p => !p)}>
            {advancedOpen ? '▲ Less' : '▼ More'}
          </button>
        </div>
        {advancedOpen && (
          <div className="dash-filter-row dash-filter-advanced animate-fade-in">
            <div className="dash-range-group">
              <span className="text-xs text-muted">Price</span>
              <input className="input" type="number" placeholder="Min" value={form.min_price} onChange={e => updateField('min_price', e.target.value)} onKeyDown={e => { if (e.key === 'Enter') applyFilters(); }} style={{ width: 80 }} />
              <span className="text-xs text-muted">–</span>
              <input className="input" type="number" placeholder="Max" value={form.max_price} onChange={e => updateField('max_price', e.target.value)} onKeyDown={e => { if (e.key === 'Enter') applyFilters(); }} style={{ width: 80 }} />
            </div>
            <div className="dash-range-group">
              <span className="text-xs text-muted">Stock</span>
              <input className="input" type="number" placeholder="Min" value={form.min_stock} onChange={e => updateField('min_stock', e.target.value)} onKeyDown={e => { if (e.key === 'Enter') applyFilters(); }} style={{ width: 80 }} />
              <span className="text-xs text-muted">–</span>
              <input className="input" type="number" placeholder="Max" value={form.max_stock} onChange={e => updateField('max_stock', e.target.value)} onKeyDown={e => { if (e.key === 'Enter') applyFilters(); }} style={{ width: 80 }} />
            </div>
            <div className="dash-range-group">
              <span className="text-xs text-muted">Avg 30D</span>
              <input className="input" type="number" placeholder="Min" value={form.min_avg_30d} onChange={e => updateField('min_avg_30d', e.target.value)} onKeyDown={e => { if (e.key === 'Enter') applyFilters(); }} style={{ width: 80 }} />
              <span className="text-xs text-muted">–</span>
              <input className="input" type="number" placeholder="Max" value={form.max_avg_30d} onChange={e => updateField('max_avg_30d', e.target.value)} onKeyDown={e => { if (e.key === 'Enter') applyFilters(); }} style={{ width: 80 }} />
            </div>
            <div className="dash-range-group">
              <span className="text-xs text-muted">Sold</span>
              <input className="input" type="number" placeholder="Min" value={form.min_sold} onChange={e => updateField('min_sold', e.target.value)} onKeyDown={e => { if (e.key === 'Enter') applyFilters(); }} style={{ width: 80 }} />
              <span className="text-xs text-muted">–</span>
              <input className="input" type="number" placeholder="Max" value={form.max_sold} onChange={e => updateField('max_sold', e.target.value)} onKeyDown={e => { if (e.key === 'Enter') applyFilters(); }} style={{ width: 80 }} />
            </div>
            <select className="select" value={form.updated_within_days} onChange={e => updateField('updated_within_days', e.target.value)} style={{ maxWidth: 140 }}>
              {UPDATED_WITHIN_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <div className="dash-range-group">
              <span className="text-xs text-muted">Min Score</span>
              <input className="input" type="number" placeholder="0" min="0" max="100" value={form.min_score} onChange={e => updateField('min_score', e.target.value)} onKeyDown={e => { if (e.key === 'Enter') applyFilters(); }} style={{ width: 70 }} />
            </div>
          </div>
        )}
        <div className="dash-filter-row" style={{ justifyContent: 'flex-end', gap: 'var(--spacing-2)', paddingTop: 'var(--spacing-2)' }}>
          <button className="btn btn-ghost btn-sm" onClick={clearFilters}>✕ Clear</button>
          <button className="btn btn-primary btn-sm" onClick={applyFilters}>🔍 Apply Filters</button>
        </div>
      </div>

      {/* Product Table */}
      <div className="card dash-table-card">
        <div className="dash-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 58 }}></th>
                {SORTABLE_COLUMNS.map(col => (
                  <th
                    key={col.key}
                    className={sortBy === col.key ? 'sorted' : ''}
                    onClick={() => handleSort(col.key)}
                  >
                    {col.label}
                    {sortBy === col.key && (
                      <span className="dash-sort-indicator">{sortDir === 'asc' ? ' ↑' : ' ↓'}</span>
                    )}
                  </th>
                ))}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={14}><div className="skeleton skeleton-text" style={{ width: `${60 + Math.random() * 30}%` }} /></td>
                  </tr>
                ))
              ) : products.length === 0 ? (
                <tr><td colSpan={14} style={{ textAlign: 'center', padding: 'var(--spacing-12)' }} className="text-muted">No products found</td></tr>
              ) : products.map(product => (
                <tr key={product.id}>
                  {/* Image */}
                  <td>
                    <div className="dash-thumb">
                      {product.image ? (
                        <img src={product.image} alt="" loading="lazy" />
                      ) : (
                        <div className="dash-thumb-empty">?</div>
                      )}
                    </div>
                  </td>
                  {/* Name */}
                  <td>
                    <a className="dash-product-link" onClick={() => navigateToProduct(`/product/${product.id}`)} style={{ cursor: 'pointer' }}>
                      {product.name}
                    </a>
                  </td>
                  {/* Store */}
                  <td className="text-sm text-muted">{product.parser_name}</td>
                  {/* Vendor */}
                  <td className="text-sm text-muted">{product.vendor || '—'}</td>
                  {/* Status */}
                  <td>
                    <select
                      className={`dash-status-select ${STATUS_COLORS[product.pipeline_status || ''] || ''}`}
                      value={product.pipeline_status || ''}
                      onChange={e => handleStatusChange(product.id, e.target.value)}
                    >
                      <option value="">None</option>
                      {PIPELINE_OPTIONS.slice(1).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </td>
                  {/* Rank */}
                  <td>
                    {product.sales_ranking ? (
                      <span className={`badge ${RANK_COLORS[product.sales_ranking] || 'badge-neutral'}`}>
                        {product.sales_ranking}
                      </span>
                    ) : '—'}
                  </td>
                  {/* Stock */}
                  <td className="text-mono">{product.stock?.toLocaleString() ?? '—'}</td>
                  {/* Sold */}
                  <td>
                    {product.stock_diff != null ? (
                      <span className={`text-mono ${product.stock_diff > 0 ? 'text-success' : product.stock_diff < 0 ? 'text-error' : ''}`}>
                        {product.stock_diff > 0 ? '+' : ''}{product.stock_diff}
                      </span>
                    ) : '—'}
                  </td>
                  {/* Avg 1D */}
                  <td className="text-mono">{product.avg_1d?.toFixed(1) ?? '—'}</td>
                  {/* Avg 7D */}
                  <td className="text-mono">{product.avg_7d?.toFixed(1) ?? '—'}</td>
                  {/* Avg 30D */}
                  <td className="text-mono" style={{ fontWeight: 600 }}>{product.avg_30d?.toFixed(1) ?? '—'}</td>
                  {/* Price */}
                  <td className="text-mono">{product.price ? `${product.price.toFixed(2)}` : '—'}</td>
                  {/* Score */}
                  <td>
                    <span className={`badge ${GRADE_COLORS[product.grade] || 'badge-neutral'}`}
                      title={`Score: ${product.score}/100`}
                    >
                      {product.grade} {product.score}
                    </span>
                  </td>
                  {/* Last Updated */}
                  <td className="text-xs text-muted" title={product.last_updated || ''}>
                    {relativeTime(product.last_updated)}
                  </td>
                  {/* Actions */}
                  <td>
                    <div className="dash-actions">
                      <button
                        className={`dash-heart-btn ${product.shortlisted ? 'active' : ''}`}
                        onClick={() => handleToggleShortlist(product)}
                        title={product.shortlisted ? 'Remove from watchlist' : 'Add to watchlist'}
                      >
                        {product.shortlisted ? '♥' : '♡'}
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => navigateToProduct(`/product/${product.id}`)} title="View details">
                        👁
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => navigateToProduct(`/product/${product.id}/pipeline-details`)} title="Pipeline details">
                        📋
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => handleAddToPipeline(product.id)} title="Add to pipeline (New)">
                          +
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {renderPagination()}
      </div>
    </div>
  );
}
