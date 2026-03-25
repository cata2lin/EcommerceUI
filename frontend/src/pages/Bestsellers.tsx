/**
 * Bestsellers — Ranked product performance with full-text search, 8 filters,
 * store/global rank badges, image hover preview, and shortlist actions.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchBestsellers, refreshBestsellers, toggleShortlist, moveToNewStatus } from '../api';
import { useSidebar } from '../contexts/SidebarContext';

interface Bestseller {
  id: number;
  name: string;
  image: string;
  url: string;
  vendor: string;
  parser_name: string;
  stock: number | null;
  price: number | null;
  ads7: number | null;
  ads30: number | null;
  global_rank: number | null;
  store_rank: number | null;
  last_sold: string | null;
  pipeline_status: string | null;
  shortlisted: boolean;
}

export default function Bestsellers() {
  const navigate = useNavigate();
  const { refresh } = useSidebar();

  const [products, setProducts] = useState<Bestseller[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // Filters
  const [keywords, setKeywords] = useState('');
  const [debouncedKeywords, setDebouncedKeywords] = useState('');
  const [topN, setTopN] = useState('');
  const [stockStatus, setStockStatus] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [minAds30, setMinAds30] = useState('');
  const [maxAds30, setMaxAds30] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Sort & Page
  const [sortBy, setSortBy] = useState('global_rank');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);

  // Image preview
  const [previewImage, setPreviewImage] = useState<{ src: string; x: number; y: number } | null>(null);
  const previewTimeout = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedKeywords(keywords); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [keywords]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = { page, sort_by: sortBy, sort_dir: sortDir };
      if (debouncedKeywords) params.keywords = debouncedKeywords;
      if (topN) params.top_n = parseInt(topN);
      if (stockStatus) params.stock_status = stockStatus;
      if (minPrice) params.min_price = parseFloat(minPrice);
      if (maxPrice) params.max_price = parseFloat(maxPrice);
      if (minAds30) params.min_ads30 = parseFloat(minAds30);
      if (maxAds30) params.max_ads30 = parseFloat(maxAds30);
      const res = await fetchBestsellers(params);
      setProducts(res.data.products || []);
      setTotal(res.data.total || 0);

    } catch (err) {
      console.error('Bestsellers load failed:', err);
    } finally {
      setLoading(false);
    }
  }, [page, sortBy, sortDir, debouncedKeywords, topN, stockStatus, minPrice, maxPrice, minAds30, maxAds30]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSort = (key: string) => {
    if (sortBy === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(key); setSortDir(key === 'global_rank' ? 'asc' : 'desc'); }
    setPage(1);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try { await refreshBestsellers(); await loadData(); setLastRefresh(new Date()); } finally { setRefreshing(false); }
  };

  const handleShortlist = async (p: Bestseller) => {
    setProducts(ps => ps.map(x => x.id === p.id ? { ...x, shortlisted: !x.shortlisted } : x));
    try { await toggleShortlist(p.id); refresh(); } catch { loadData(); }
  };

  const handleAddPipeline = async (id: number) => {
    setProducts(ps => ps.map(x => x.id === id ? { ...x, pipeline_status: 'New' } : x));
    try { await moveToNewStatus(id); refresh(); } catch { loadData(); }
  };

  const showPreview = (src: string, e: React.MouseEvent) => {
    if (previewTimeout.current) clearTimeout(previewTimeout.current);
    previewTimeout.current = setTimeout(() => {
      setPreviewImage({ src, x: e.clientX + 20, y: e.clientY - 60 });
    }, 200);
  };

  const hidePreview = () => {
    if (previewTimeout.current) clearTimeout(previewTimeout.current);
    setPreviewImage(null);
  };

  const rankBadgeClass = (rank: number | null) => {
    if (rank == null) return '';
    if (rank <= 3) return 'rank-gold';
    if (rank <= 10) return 'rank-silver';
    return '';
  };

  const timeAgo = (d: string | null) => {
    if (!d) return '—';
    const diff = Date.now() - new Date(d).getTime();
    const hrs = diff / 3600000;
    if (hrs < 1) return `${Math.round(diff / 60000)}m ago`;
    if (hrs < 24) return `${Math.round(hrs)}h ago`;
    return `${Math.round(hrs / 24)}d ago`;
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div className="flex items-center gap-4">
          <h1>Best Sellers</h1>
          <span className="text-sm text-muted">{total.toLocaleString()} products</span>
        </div>
        <div className="flex items-center gap-3">
          <input className="input" placeholder="Search name, vendor, or #ID..." value={keywords} onChange={e => setKeywords(e.target.value)} style={{ width: 260 }} />
          <button className={`btn btn-ghost btn-sm ${refreshing ? 'animate-pulse' : ''}`} onClick={handleRefresh} disabled={refreshing}>↻ Refresh</button>
          {lastRefresh && <span className="text-xs text-muted">Refreshed {timeAgo(lastRefresh.toISOString())}</span>}
          <button className="btn btn-ghost btn-sm" onClick={() => setShowFilters(!showFilters)}>
            {showFilters ? '▲ Filters' : '▼ Filters'}
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="card animate-fade-in" style={{ marginBottom: 'var(--spacing-6)', padding: 'var(--spacing-4) var(--spacing-5)' }}>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="dash-range-group">
              <span className="text-xs text-muted">Top N</span>
              <input className="input" type="number" placeholder="e.g. 100" value={topN} onChange={e => { setTopN(e.target.value); setPage(1); }} style={{ width: 80 }} />
            </div>
            <select className="select" value={stockStatus} onChange={e => { setStockStatus(e.target.value); setPage(1); }} style={{ maxWidth: 130 }}>
              <option value="">Stock: All</option>
              <option value="in_stock">In Stock</option>
              <option value="out_of_stock">Out of Stock</option>
            </select>
            <div className="dash-range-group">
              <span className="text-xs text-muted">Price</span>
              <input className="input" type="number" placeholder="Min" value={minPrice} onChange={e => { setMinPrice(e.target.value); setPage(1); }} style={{ width: 80 }} />
              <span className="text-xs text-muted">–</span>
              <input className="input" type="number" placeholder="Max" value={maxPrice} onChange={e => { setMaxPrice(e.target.value); setPage(1); }} style={{ width: 80 }} />
            </div>
            <div className="dash-range-group">
              <span className="text-xs text-muted">ADS 30D</span>
              <input className="input" type="number" placeholder="Min" value={minAds30} onChange={e => { setMinAds30(e.target.value); setPage(1); }} style={{ width: 80 }} />
              <span className="text-xs text-muted">–</span>
              <input className="input" type="number" placeholder="Max" value={maxAds30} onChange={e => { setMaxAds30(e.target.value); setPage(1); }} style={{ width: 80 }} />
            </div>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 70 }} className={sortBy === 'global_rank' ? 'sorted' : ''} onClick={() => handleSort('global_rank')}>Rank</th>
                <th style={{ width: 50 }}></th>
                <th className={sortBy === 'name' ? 'sorted' : ''} onClick={() => handleSort('name')}>Name</th>
                <th className={sortBy === 'parser_name' ? 'sorted' : ''} onClick={() => handleSort('parser_name')}>Store</th>
                <th className={sortBy === 'vendor' ? 'sorted' : ''} onClick={() => handleSort('vendor')}>Vendor</th>
                <th className={sortBy === 'stock' ? 'sorted' : ''} onClick={() => handleSort('stock')}>Stock</th>
                <th className={sortBy === 'price' ? 'sorted' : ''} onClick={() => handleSort('price')}>Price</th>
                <th className={sortBy === 'ads30' ? 'sorted' : ''} onClick={() => handleSort('ads30')} style={{ fontWeight: 700 }}>ADS 30D</th>
                <th className={sortBy === 'ads7' ? 'sorted' : ''} onClick={() => handleSort('ads7')}>ADS 7D</th>
                <th>Last Sold</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i}><td colSpan={11}><div className="skeleton skeleton-text" style={{ width: `${50 + Math.random() * 40}%` }} /></td></tr>
                ))
              ) : products.length === 0 ? (
                <tr><td colSpan={11} style={{ textAlign: 'center', padding: 'var(--spacing-12)' }} className="text-muted">No bestsellers found</td></tr>
              ) : products.map(p => (
                <tr key={p.id}>
                  <td>
                    <div className="flex items-center gap-2">
                      <span className={`text-mono rank-badge ${rankBadgeClass(p.global_rank)}`} style={{ fontWeight: 700 }}>
                        #{p.global_rank ?? '—'}
                      </span>
                      {p.store_rank && <span className="badge badge-info" style={{ fontSize: '0.625rem' }}>{p.store_rank}</span>}
                    </div>
                  </td>
                  <td>
                    <div
                      className="dash-thumb"
                      onMouseEnter={e => p.image && showPreview(p.image, e)}
                      onMouseLeave={hidePreview}
                    >
                      {p.image ? <img src={p.image} alt="" loading="lazy" /> : <div className="dash-thumb-empty">?</div>}
                    </div>
                  </td>
                  <td><button className="dash-product-link" onClick={() => navigate(`/product/${p.id}`)}>{p.name}</button></td>
                  <td className="text-sm text-muted">{p.parser_name}</td>
                  <td className="text-sm text-muted">{p.vendor || '—'}</td>
                  <td className="text-mono">{p.stock?.toLocaleString() ?? '—'}</td>
                  <td className="text-mono">{p.price ? `${p.price.toFixed(2)}` : '—'}</td>
                  <td className="text-mono text-success" style={{ fontWeight: 700 }}>{p.ads30?.toFixed(1) ?? '—'}</td>
                  <td className="text-mono">{p.ads7?.toFixed(1) ?? '—'}</td>
                  <td className="text-sm text-muted">{timeAgo(p.last_sold)}</td>
                  <td>
                    <div className="dash-actions">
                      <button className={`dash-heart-btn ${p.shortlisted ? 'active' : ''}`} onClick={() => handleShortlist(p)}>
                        {p.shortlisted ? '♥' : '♡'}
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/product/${p.id}/pipeline-details`)} title="Pipeline">📋</button>
                      {!p.pipeline_status ? (
                        <button className="btn btn-ghost btn-sm" onClick={() => handleAddPipeline(p.id)} title="Add to pipeline">+</button>
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

      {/* Image preview popup */}
      {previewImage && (
        <div className="bs-preview" style={{ left: previewImage.x, top: previewImage.y }}>
          <img src={previewImage.src} alt="" />
        </div>
      )}

      <style>{`
        .rank-badge { display: inline-block; min-width: 36px; text-align: center; }
        .rank-gold { color: #f59e0b; }
        .rank-silver { color: #64748b; }
        .bs-preview {
          position: fixed; z-index: 1000; pointer-events: none;
          width: 200px; height: 200px; border-radius: var(--radius-lg);
          overflow: hidden; box-shadow: 0 8px 32px rgba(0,0,0,0.3);
          border: 2px solid var(--color-border-default);
          background: var(--card-bg);
        }
        .bs-preview img { width: 100%; height: 100%; object-fit: contain; }
      `}</style>
    </div>
  );
}
