/**
 * PurchaseOrdersList — list, filter, search, create POs.
 * Grandia-style: stats cards, status pills, pagination, quick-filter chips.
 */
import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchPurchaseOrders, fetchPurchaseOrderStats, createPurchaseOrder } from '../api';

interface PO {
  id: number;
  number: number;
  display_number: string;
  title: string | null;
  priority: string;
  status: string;
  total_cost_usd: number | null;
  items_count: number;
  created_at: string;
  tom_number: string | null;
  tom_status: string | null;
}

interface Stats {
  total: number;
  total_cost_usd: number;
  by_status: Record<string, { count: number; cost_usd: number }>;
}

const STATUS_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'SENT_TO_TOM', label: 'Sent to TOM' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    DRAFT:       { bg: 'var(--color-bg-subtle)',  fg: 'var(--color-text-muted)',  label: 'Draft' },
    APPROVED:    { bg: '#DBEAFE',                 fg: '#1E40AF',                  label: 'Approved' },
    SENT_TO_TOM: { bg: '#D1FAE5',                 fg: '#065F46',                  label: 'Sent to TOM' },
    CANCELLED:   { bg: '#FEE2E2',                 fg: '#991B1B',                  label: 'Cancelled' },
  };
  const s = map[status] || map.DRAFT;
  return (
    <span style={{
      display: 'inline-block', background: s.bg, color: s.fg, padding: '2px 8px',
      borderRadius: 10, fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.02em',
    }}>{s.label}</span>
  );
}

export default function PurchaseOrdersList() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<PO[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page, page_size: 25, sort_by: 'created_at', sort_dir: 'desc' };
      if (statusFilter) params.status = statusFilter;
      if (search) params.search = search;
      const res = await fetchPurchaseOrders(params);
      setRows(res.data.purchase_orders);
      setTotal(res.data.total);
      setTotalPages(res.data.total_pages);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, search]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { fetchPurchaseOrderStats().then(r => setStats(r.data)).catch(() => {}); }, [rows]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const res = await createPurchaseOrder({ title: null, priority: 'STANDARD', items: [] });
      navigate(`/purchase-orders/${res.data.id}`);
    } catch (e: any) {
      alert(e?.response?.data?.detail || 'Failed to create PO');
    } finally {
      setCreating(false);
    }
  };

  const statCard = (label: string, value: string | number, sub?: string, color?: string) => (
    <div className="card" style={{ padding: 'var(--spacing-4)', flex: 1, minWidth: 140 }}>
      <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: 4, color: color || 'var(--color-text-primary)' }}>{value}</div>
      {sub && <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  );

  const fmtUsd = (v: number) => `$${v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  const thStyle: React.CSSProperties = {
    whiteSpace: 'nowrap', padding: '8px 10px', fontSize: '0.7rem', fontWeight: 600,
    textAlign: 'left', background: 'var(--color-bg-subtle)',
    borderBottom: '2px solid var(--color-border-default)',
  };
  const tdStyle: React.CSSProperties = {
    padding: '8px 10px', fontSize: '0.8rem', whiteSpace: 'nowrap',
    borderBottom: '1px solid var(--color-border-default)',
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div className="flex items-center gap-4">
          <h1>📦 Purchase Orders</h1>
          <span className="text-sm" style={{ opacity: 0.7 }}>{total} total</span>
        </div>
        <div className="flex items-center gap-3">
          <button className="btn btn-primary btn-sm" onClick={handleCreate} disabled={creating}>
            {creating ? 'Creating…' : '+ New Purchase Order'}
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div style={{ display: 'flex', gap: 'var(--spacing-3)', marginBottom: 'var(--spacing-5)', flexWrap: 'wrap' }}>
          {statCard('Total', stats.total, fmtUsd(stats.total_cost_usd))}
          {statCard('Draft',       stats.by_status.DRAFT?.count       || 0, fmtUsd(stats.by_status.DRAFT?.cost_usd       || 0), 'var(--color-text-muted)')}
          {statCard('Approved',    stats.by_status.APPROVED?.count    || 0, fmtUsd(stats.by_status.APPROVED?.cost_usd    || 0), '#1E40AF')}
          {statCard('Sent to TOM', stats.by_status.SENT_TO_TOM?.count || 0, fmtUsd(stats.by_status.SENT_TO_TOM?.cost_usd || 0), '#065F46')}
          {statCard('Cancelled',   stats.by_status.CANCELLED?.count   || 0, fmtUsd(stats.by_status.CANCELLED?.cost_usd   || 0), '#991B1B')}
        </div>
      )}

      {/* Filters */}
      <div className="card" style={{ padding: 'var(--spacing-3) var(--spacing-4)', marginBottom: 'var(--spacing-4)' }}>
        <div className="flex items-center gap-3 flex-wrap">
          <input className="input" placeholder="Search # / title / TOM #..." value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { setSearch(searchInput); setPage(1); } }}
            style={{ maxWidth: 240 }} />
          <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(searchInput); setPage(1); }}>🔍</button>
          <select className="select" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} style={{ maxWidth: 160 }}>
            {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {(search || statusFilter) && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setSearchInput(''); setStatusFilter(''); setPage(1); }}>✕ Clear</button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>#</th>
              <th style={thStyle}>Title</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Priority</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Items</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Total</th>
              <th style={thStyle}>TOM</th>
              <th style={thStyle}>Created</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}><td colSpan={8} style={tdStyle}><div className="skeleton skeleton-text" /></td></tr>
              ))
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} style={{ ...tdStyle, textAlign: 'center', padding: 'var(--spacing-12)', color: 'var(--color-text-muted)' }}>No purchase orders yet</td></tr>
            ) : rows.map(po => (
              <tr key={po.id}
                style={{ cursor: 'pointer' }}
                onClick={() => navigate(`/purchase-orders/${po.id}`)}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--color-bg-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = ''}>
                <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{po.display_number}</td>
                <td style={tdStyle}>{po.title || <span style={{ color: 'var(--color-text-muted)' }}>—</span>}</td>
                <td style={tdStyle}><StatusPill status={po.status} /></td>
                <td style={tdStyle}>{po.priority === 'HIGH' ? <span style={{ color: '#B91C1C', fontWeight: 600 }}>⚡ HIGH</span> : <span style={{ color: 'var(--color-text-muted)' }}>Standard</span>}</td>
                <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{po.items_count}</td>
                <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{fmtUsd(po.total_cost_usd || 0)}</td>
                <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>{po.tom_number || '—'}</td>
                <td style={{ ...tdStyle, fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                  {new Date(po.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {totalPages > 1 && (
          <div style={{ padding: 'var(--spacing-3)', display: 'flex', justifyContent: 'center', gap: 8 }}>
            <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
            <span style={{ fontSize: '0.75rem', alignSelf: 'center' }}>Page {page} of {totalPages}</span>
            <button className="btn btn-ghost btn-sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
          </div>
        )}
      </div>
    </div>
  );
}
