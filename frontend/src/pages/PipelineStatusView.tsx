/**
 * PipelineStatusView — Products at a specific pipeline stage with
 * status tabs, comprehensive filters, financial KPIs, and Excel export.
 */
import { useState, useCallback, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { fetchPipelineStatus, exportPipelineExcel, fetchConfig } from '../api';

const STATUSES = [
  { slug: 'new', label: 'New' },
  { slug: 'supplier-info', label: 'Supplier Info' },
  { slug: 'financial-review', label: 'Financial Review' },
  { slug: 'market-research', label: 'Market Research' },
  { slug: 'approved', label: 'Approved' },
  { slug: 'hold', label: 'Hold' },
  { slug: 'discarded', label: 'Discarded' },
];

const RANKING_OPTIONS = [
  { value: '', label: 'All Rankings' },
  { value: 'High', label: 'High' },
  { value: 'Good', label: 'Good' },
  { value: 'Slow', label: 'Slow' },
  { value: 'Poor', label: 'Poor' },
];

const MARGIN_OPTIONS = [
  { value: '', label: 'All Margins' },
  { value: 'Healthy', label: 'Healthy (≥50%)' },
  { value: 'Average', label: 'Average (30-50%)' },
  { value: 'Low', label: 'Low (<30%)' },
];

interface PipelineProduct {
  id: number;
  image: string;
  title: string;
  parser_name: string;
  group_name: string | null;
  sales_ranking: string | null;
  retail_price: number | null;
  cogs_usd: number | null;
  gross_margin: number | null;
  margin_health: string | null;
  suggested_quantity_min: number | null;
  suggested_quantity_max: number | null;
}

interface FilterOption { id: number; name: string; }

const emptyForm = {
  title: '',
  parser_id: '',
  group_id: '',
  sales_ranking: '',
  margin_health: '',
  min_price: '',
  max_price: '',
  min_cogs: '',
  max_cogs: '',
};

/** Sortable columns config */
const SORT_COLUMNS: { key: string; label: string; sortable: boolean }[] = [
  { key: 'id', label: 'ID', sortable: true },
  { key: 'title', label: 'Title', sortable: true },
  { key: 'parser', label: 'Store', sortable: true },
  { key: 'group', label: 'Group', sortable: true },
  { key: 'retail_price', label: 'Retail', sortable: true },
  { key: 'cogs_usd', label: 'COGS', sortable: true },
  { key: 'margin', label: 'Margin', sortable: true },
];

export default function PipelineStatusView() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const [products, setProducts] = useState<PipelineProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // Filter dropdown options
  const [parsers, setParsers] = useState<FilterOption[]>([]);
  const [groups, setGroups] = useState<FilterOption[]>([]);

  const [form, setForm] = useState(emptyForm);
  const [appliedFilters, setAppliedFilters] = useState(emptyForm);
  const [showFilters, setShowFilters] = useState(false);

  const [sortBy, setSortBy] = useState('id');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [goToPage, setGoToPage] = useState('');

  // Load filter options once
  useEffect(() => {
    fetchConfig().then(res => {
      setParsers((res.data.parsers || []).map((p: any) => ({ id: p.id, name: p.name })));
      setGroups((res.data.groups || []).map((g: any) => ({ id: g.id, name: g.name })));
    }).catch(() => {});
  }, []);

  const updateField = (key: string, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const applyFilters = () => {
    setAppliedFilters({ ...form });
    setPage(1);
  };

  const clearFilters = () => {
    setForm(emptyForm);
    setAppliedFilters(emptyForm);
    setPage(1);
  };

  useEffect(() => { setPage(1); setForm(emptyForm); setAppliedFilters(emptyForm); }, [slug]);

  const loadData = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    try {
      const params: Record<string, any> = { page, sort_by: sortBy, sort_dir: sortDir };
      if (appliedFilters.title) params.title = appliedFilters.title;
      if (appliedFilters.parser_id) params.parser_id = parseInt(appliedFilters.parser_id);
      if (appliedFilters.group_id) params.group_id = parseInt(appliedFilters.group_id);
      if (appliedFilters.sales_ranking) params.sales_ranking = appliedFilters.sales_ranking;
      if (appliedFilters.margin_health) params.margin_health = appliedFilters.margin_health;
      if (appliedFilters.min_price) params.min_price = parseFloat(appliedFilters.min_price);
      if (appliedFilters.max_price) params.max_price = parseFloat(appliedFilters.max_price);
      if (appliedFilters.min_cogs) params.min_cogs = parseFloat(appliedFilters.min_cogs);
      if (appliedFilters.max_cogs) params.max_cogs = parseFloat(appliedFilters.max_cogs);
      const res = await fetchPipelineStatus(slug, params);
      setProducts(res.data.products || []);
      setTotal(res.data.total || 0);
      setTotalPages(res.data.total_pages || 1);
    } catch (err) {
      console.error('Pipeline status load failed:', err);
    } finally {
      setLoading(false);
    }
  }, [slug, page, sortBy, sortDir, appliedFilters]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSort = (key: string) => {
    if (sortBy === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(key); setSortDir('desc'); }
    setPage(1);
  };

  const sortIndicator = (key: string) => {
    if (sortBy !== key) return null;
    return <span style={{ marginLeft: 4 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

  const handleExport = async () => {
    if (!slug) return;
    setExporting(true);
    try {
      const res = await exportPipelineExcel(slug);
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pipeline-${slug}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const handleGoTo = () => {
    const target = parseInt(goToPage, 10);
    if (target >= 1 && target <= totalPages) {
      setPage(target);
      setGoToPage('');
    }
  };

  const currentLabel = STATUSES.find(s => s.slug === slug)?.label || slug;
  const activeCount = Object.values(appliedFilters).filter(v => v !== '').length;

  const renderPagination = () => {
    if (totalPages <= 1) return null;
    const pages: (number | string)[] = [];
    const range = 3;
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= page - range && i <= page + range)) {
        pages.push(i);
      } else if (pages[pages.length - 1] !== '...') {
        pages.push('...');
      }
    }
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 'var(--spacing-4)', justifyContent: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
        <div style={{ display: 'flex', gap: 2 }}>
          {pages.map((p, i) => (
            typeof p === 'number' ? (
              <button key={i} className={`btn btn-sm ${p === page ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setPage(p)} style={{ minWidth: 32, padding: '4px 8px' }}>{p}</button>
            ) : (
              <span key={i} style={{ padding: '0 4px', color: 'var(--color-text-muted)' }}>…</span>
            )
          ))}
        </div>
        <span style={{ fontSize: '0.75rem' }}>Page {page} of {totalPages}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input className="input" type="number" min={1} max={totalPages}
            placeholder="Go to" value={goToPage}
            onChange={e => setGoToPage(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleGoTo(); }}
            style={{ width: 64, fontSize: '0.75rem', padding: '4px 8px', minHeight: 28 }} />
          <button className="btn btn-ghost btn-sm" onClick={handleGoTo}>Go</button>
        </div>
        <button className="btn btn-ghost btn-sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
      </div>
    );
  };

  const thStyle: React.CSSProperties = {
    cursor: 'pointer', whiteSpace: 'nowrap', padding: '8px 6px',
    fontSize: '0.7rem', fontWeight: 600, userSelect: 'none',
    borderBottom: '2px solid var(--color-border-default)',
    textAlign: 'left', background: 'var(--color-bg-subtle)',
  };
  const tdStyle: React.CSSProperties = {
    padding: '6px 6px', fontSize: '0.8rem', whiteSpace: 'nowrap',
    borderBottom: '1px solid var(--color-border-default)',
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div className="flex items-center gap-4">
          <h1>{currentLabel}</h1>
          <span className="text-sm" style={{ opacity: 0.7 }}>{total} products</span>
        </div>
        <div className="flex items-center gap-3">
          <button className="btn btn-ghost btn-sm" onClick={() => setShowFilters(!showFilters)}>
            {showFilters ? '▲ Filters' : '▼ Filters'}{activeCount > 0 ? ` (${activeCount})` : ''}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={handleExport} disabled={exporting}>📊 Export Excel</button>
        </div>
      </div>

      {/* Status Tabs */}
      <div className="flex gap-1" style={{ marginBottom: 'var(--spacing-6)', overflowX: 'auto' }}>
        {STATUSES.map(s => (
          <button key={s.slug} className={`btn btn-sm ${s.slug === slug ? 'btn-primary' : 'btn-ghost'}`} onClick={() => navigate(`/pipeline/${s.slug}`)}>
            {s.label}
          </button>
        ))}
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="card animate-fade-in" style={{ marginBottom: 'var(--spacing-6)', padding: 'var(--spacing-4) var(--spacing-5)' }}>
          {/* Row 1: Text + Dropdowns */}
          <div className="flex items-center gap-3 flex-wrap">
            <input className="input" placeholder="Search name, title, or #ID..." value={form.title}
              onChange={e => updateField('title', e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') applyFilters(); }}
              style={{ maxWidth: 220 }} />
            <select className="select" value={form.parser_id} onChange={e => updateField('parser_id', e.target.value)} style={{ maxWidth: 160 }}>
              <option value="">All Stores</option>
              {parsers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select className="select" value={form.group_id} onChange={e => updateField('group_id', e.target.value)} style={{ maxWidth: 160 }}>
              <option value="">All Groups</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <select className="select" value={form.sales_ranking} onChange={e => updateField('sales_ranking', e.target.value)} style={{ maxWidth: 140 }}>
              {RANKING_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select className="select" value={form.margin_health} onChange={e => updateField('margin_health', e.target.value)} style={{ maxWidth: 150 }}>
              {MARGIN_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          {/* Row 2: Price + COGS ranges */}
          <div className="flex items-center gap-3 flex-wrap" style={{ marginTop: 'var(--spacing-3)' }}>
            <div className="flex items-center gap-2">
              <span style={{ fontSize: '0.75rem' }}>Price (RON)</span>
              <input className="input" type="number" placeholder="Min" value={form.min_price}
                onChange={e => updateField('min_price', e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') applyFilters(); }}
                style={{ width: 80 }} />
              <span style={{ fontSize: '0.75rem' }}>–</span>
              <input className="input" type="number" placeholder="Max" value={form.max_price}
                onChange={e => updateField('max_price', e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') applyFilters(); }}
                style={{ width: 80 }} />
            </div>
            <div className="flex items-center gap-2">
              <span style={{ fontSize: '0.75rem' }}>COGS (USD)</span>
              <input className="input" type="number" placeholder="Min" value={form.min_cogs}
                onChange={e => updateField('min_cogs', e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') applyFilters(); }}
                style={{ width: 80 }} />
              <span style={{ fontSize: '0.75rem' }}>–</span>
              <input className="input" type="number" placeholder="Max" value={form.max_cogs}
                onChange={e => updateField('max_cogs', e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') applyFilters(); }}
                style={{ width: 80 }} />
            </div>
          </div>
          {/* Row 3: Actions */}
          <div className="flex items-center gap-2" style={{ marginTop: 'var(--spacing-3)', justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost btn-sm" onClick={clearFilters}>✕ Clear</button>
            <button className="btn btn-primary btn-sm" onClick={applyFilters}>🔍 Apply</button>
          </div>
        </div>
      )}

      {/* Data Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: 42, cursor: 'default' }}></th>
              {SORT_COLUMNS.map(col => (
                <th key={col.key} style={{ ...thStyle, background: sortBy === col.key ? 'var(--color-bg-hover)' : thStyle.background }} onClick={() => handleSort(col.key)}>
                  {col.label}{sortIndicator(col.key)}
                </th>
              ))}
              <th style={{ ...thStyle, cursor: 'default' }}>Rank</th>
              <th style={{ ...thStyle, cursor: 'default' }}>Health</th>
              <th style={{ ...thStyle, cursor: 'default' }}>Qty</th>
              <th style={{ ...thStyle, width: 60, cursor: 'default' }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}><td colSpan={11} style={tdStyle}><div className="skeleton skeleton-text" style={{ width: `${50 + Math.random() * 40}%` }} /></td></tr>
              ))
            ) : products.length === 0 ? (
              <tr><td colSpan={11} style={{ ...tdStyle, textAlign: 'center', padding: 'var(--spacing-12)', color: 'var(--color-text-muted)' }}>No products at this status</td></tr>
            ) : products.map(p => (
              <tr key={p.id} style={{ transition: 'background 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--color-bg-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = ''}>
                <td style={tdStyle}>
                  <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-sm)', overflow: 'hidden', background: 'var(--color-bg-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {p.image ? <img src={p.image} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '0.6rem', color: 'var(--color-text-muted)' }}>?</span>}
                  </div>
                </td>
                <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>{p.id}</td>
                <td style={{ ...tdStyle, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  <Link style={{ color: 'var(--color-text-primary)', textDecoration: 'none', fontWeight: 500, fontSize: '0.8rem' }} to={`/product/${p.id}/pipeline-details`}>{p.title || `Product #${p.id}`}</Link>
                </td>
                <td style={{ ...tdStyle, fontSize: '0.75rem' }}>{p.parser_name}</td>
                <td style={{ ...tdStyle, fontSize: '0.75rem' }}>{p.group_name || '—'}</td>
                <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{p.retail_price?.toFixed(2) ?? '—'}</td>
                <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{p.cogs_usd?.toFixed(2) ?? '—'}</td>
                <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)', fontWeight: 600, textAlign: 'right', color: p.gross_margin != null ? (p.gross_margin >= 50 ? 'var(--color-success)' : p.gross_margin >= 30 ? 'var(--color-warning)' : 'var(--color-error)') : undefined }}>
                  {p.gross_margin != null ? `${p.gross_margin.toFixed(1)}%` : '—'}
                </td>
                <td style={tdStyle}>
                  {p.sales_ranking ? (
                    <span className={`badge ${p.sales_ranking === 'High' ? 'badge-healthy' : p.sales_ranking === 'Good' ? 'badge-info' : p.sales_ranking === 'Slow' ? 'badge-warning' : 'badge-error'}`} style={{ fontSize: '0.65rem' }}>
                      {p.sales_ranking}
                    </span>
                  ) : '—'}
                </td>
                <td style={tdStyle}>
                  {p.margin_health ? (
                    <span className={`badge ${p.margin_health === 'Healthy' ? 'badge-healthy' : p.margin_health === 'Average' ? 'badge-warning' : 'badge-error'}`} style={{ fontSize: '0.65rem' }}>
                      {p.margin_health}
                    </span>
                  ) : '—'}
                </td>
                <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
                  {p.suggested_quantity_min || p.suggested_quantity_max ? `${p.suggested_quantity_min ?? '?'}-${p.suggested_quantity_max ?? '?'}` : '—'}
                </td>
                <td style={tdStyle}>
                  <Link className="btn btn-ghost btn-sm" to={`/product/${p.id}/pipeline-details`} style={{ padding: '2px 8px', fontSize: '0.7rem' }}>Open →</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {renderPagination()}
      </div>
    </div>
  );
}
