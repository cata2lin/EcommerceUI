/**
 * Opportunities — Shortlisted / New products with seasonality bars,
 * batch AI generation, Excel export, and pipeline actions.
 */
import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchOpportunities, batchGenerateSeasonality, exportOpportunitiesExcel, toggleShortlist, moveToNewStatus } from '../api';
import { useSidebar } from '../contexts/SidebarContext';

interface Opportunity {
  id: number;
  name: string;
  image: string;
  url: string;
  parser_name: string;
  pipeline_status: string | null;
  shortlisted: boolean;
  avg_30d: number | null;
  avg_7d: number | null;
  stock: number | null;
  price: number | null;
  seasonality: number[] | null;
  has_seasonality: boolean;
}

const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

function SeasonalityBars({ data }: { data: number[] | null }) {
  if (!data || data.length !== 12) return <span className="text-muted text-xs">—</span>;
  const max = Math.max(...data, 1);
  return (
    <div className="opp-seasonality" title={data.map((v, i) => `${MONTHS[i]}: ${v}`).join(', ')}>
      {data.map((v, i) => (
        <div key={i} className="opp-bar-wrap">
          <div
            className={`opp-bar ${v >= 50 ? 'high' : ''}`}
            style={{ height: `${(v / max) * 100}%` }}
          />
        </div>
      ))}
    </div>
  );
}

export default function Opportunities() {
  const navigate = useNavigate();
  const { refresh } = useSidebar();
  const [products, setProducts] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchOpportunities();
      setProducts(res.data.products || []);
    } catch (err) {
      console.error('Failed to load opportunities:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const withSeasonality = products.filter(p => p.has_seasonality).length;
  const withoutSeasonality = products.filter(p => !p.has_seasonality).length;

  const handleBatchSeasonality = async () => {
    setGenerating(true);
    try {
      await batchGenerateSeasonality();
      await loadData();
    } finally {
      setGenerating(false);
    }
  };

  const handleExportExcel = async () => {
    setExporting(true);
    try {
      const res = await exportOpportunitiesExcel();
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'opportunities.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const handleShortlist = async (p: Opportunity) => {
    setProducts(ps => ps.map(x => x.id === p.id ? { ...x, shortlisted: !x.shortlisted } : x));
    try { await toggleShortlist(p.id); refresh(); } catch { loadData(); }
  };

  const handleAddPipeline = async (id: number) => {
    setProducts(ps => ps.map(x => x.id === id ? { ...x, pipeline_status: 'New' } : x));
    try { await moveToNewStatus(id); refresh(); } catch { loadData(); }
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1>Opportunities</h1>
          <span className="text-sm text-muted">{products.length} products</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            className={`btn btn-ghost btn-sm ${generating ? 'animate-pulse' : ''}`}
            onClick={handleBatchSeasonality}
            disabled={generating || withoutSeasonality === 0}
          >
            ✨ Batch Seasonality ({withoutSeasonality} pending)
          </button>
          <button className="btn btn-ghost btn-sm" onClick={handleExportExcel} disabled={exporting}>
            📊 Export Excel
          </button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="flex gap-4" style={{ marginBottom: 'var(--spacing-6)' }}>
        <span className="badge badge-healthy">{withSeasonality} with seasonality</span>
        <span className="badge badge-neutral">{withoutSeasonality} without</span>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 50 }}></th>
                <th>Name</th>
                <th>Store</th>
                <th>Avg 30D</th>
                <th>Avg 7D</th>
                <th>Stock</th>
                <th>Price</th>
                <th style={{ width: 140 }}>Seasonality</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}><td colSpan={9}><div className="skeleton skeleton-text" style={{ width: `${50 + Math.random() * 40}%` }} /></td></tr>
                ))
              ) : products.length === 0 ? (
                <tr><td colSpan={9} className="text-muted" style={{ textAlign: 'center', padding: 'var(--spacing-12)' }}>No opportunities found</td></tr>
              ) : products.map(p => (
                <tr key={p.id}>
                  <td>
                    <div className="dash-thumb">
                      {p.image ? <img src={p.image} alt="" loading="lazy" /> : <div className="dash-thumb-empty">?</div>}
                    </div>
                  </td>
                  <td>
                    <button className="dash-product-link" onClick={() => navigate(`/product/${p.id}/pipeline-details`)}>{p.name}</button>
                  </td>
                  <td className="text-sm text-muted">{p.parser_name}</td>
                  <td className="text-mono text-success" style={{ fontWeight: 600 }}>{p.avg_30d?.toFixed(1) ?? '—'}</td>
                  <td className="text-mono">{p.avg_7d?.toFixed(1) ?? '—'}</td>
                  <td className="text-mono">{p.stock?.toLocaleString() ?? '—'}</td>
                  <td className="text-mono">{p.price ? `${p.price.toFixed(2)}` : '—'}</td>
                  <td><SeasonalityBars data={p.seasonality} /></td>
                  <td>
                    <div className="dash-actions">
                      <button className={`dash-heart-btn ${p.shortlisted ? 'active' : ''}`} onClick={() => handleShortlist(p)}>
                        {p.shortlisted ? '♥' : '♡'}
                      </button>
                      {!p.pipeline_status ? (
                        <button className="btn btn-primary btn-sm" onClick={() => handleAddPipeline(p.id)}>+ Pipeline</button>
                      ) : (
                        <span className="badge badge-info" style={{ fontSize: '0.625rem' }}>In Pipeline</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <style>{`
        .opp-seasonality {
          display: flex;
          align-items: flex-end;
          gap: 2px;
          height: 28px;
          cursor: help;
        }
        .opp-bar-wrap {
          flex: 1;
          height: 100%;
          display: flex;
          align-items: flex-end;
        }
        .opp-bar {
          width: 100%;
          min-height: 2px;
          border-radius: 1px;
          background: var(--color-indigo-500);
          transition: height var(--transition-base);
        }
        .opp-bar.high {
          background: var(--color-emerald-400);
        }
      `}</style>
    </div>
  );
}
