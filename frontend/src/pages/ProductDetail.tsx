/**
 * ProductDetail — Detailed product view with Chart.js stock/price charts,
 * KPI cards, date range filters, and Similar Products table.
 */
import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  Filler, Tooltip, Legend
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { fetchProduct, fetchSimilarProducts, moveToNewStatus, updateProductStatus, toggleShortlist } from '../api';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

type DateRange = 'all' | '7d' | '30d' | '90d';

function filterByRange<T extends { timestamp: string }>(data: T[], range: DateRange): T[] {
  if (range === 'all') return data;
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return data.filter(d => new Date(d.timestamp) >= cutoff);
}

const GRADE_COLORS: Record<string, string> = {
  A: '#22c55e', B: '#84cc16', C: '#eab308', D: '#f97316', F: '#ef4444',
};

interface SimilarProduct {
  id: number;
  name: string;
  image: string | null;
  url: string | null;
  vendor: string | null;
  pipeline_status: string | null;
  parser_name: string | null;
  current_stock: number | null;
  current_price: number | null;
  total_score: number;
  grade: string;
  similarity: number;
}

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [stockRange, setStockRange] = useState<DateRange>('all');
  const [priceRange, setPriceRange] = useState<DateRange>('all');
  const [showSimilar, setShowSimilar] = useState(false);
  const [shortlisted, setShortlisted] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['product', id],
    queryFn: () => fetchProduct(Number(id)),
    enabled: !!id,
  });

  const { data: similarData, isLoading: similarLoading } = useQuery({
    queryKey: ['similar-products', id],
    queryFn: () => fetchSimilarProducts(Number(id)),
    enabled: !!id && showSimilar,
  });

  const product = data?.data;
  const similarProducts: SimilarProduct[] = similarData?.data?.products || [];

  // Sync shortlisted state from product data
  useEffect(() => {
    if (product?.shortlisted != null) setShortlisted(product.shortlisted);
  }, [product?.shortlisted]);

  const filteredStock = useMemo(
    () => filterByRange(product?.stock_history || [], stockRange),
    [product?.stock_history, stockRange]
  );

  const filteredPrice = useMemo(
    () => filterByRange(product?.price_history || [], priceRange),
    [product?.price_history, priceRange]
  );

  const stockChartData = useMemo(() => ({
    labels: filteredStock.map((d: any) => new Date(d.timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })),
    datasets: [{
      label: 'Stock',
      data: filteredStock.map((d: any) => d.quantity),
      borderColor: '#34d399',
      backgroundColor: 'rgba(52, 211, 153, 0.1)',
      fill: true,
      tension: 0.4,
      pointRadius: filteredStock.length > 60 ? 0 : 2,
      pointHoverRadius: 5,
    }]
  }), [filteredStock]);

  const priceChartData = useMemo(() => ({
    labels: filteredPrice.map((d: any) => new Date(d.timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })),
    datasets: [{
      label: 'Price (RON)',
      data: filteredPrice.map((d: any) => d.value),
      borderColor: '#818cf8',
      backgroundColor: 'rgba(129, 140, 248, 0.1)',
      fill: true,
      tension: 0.4,
      pointRadius: filteredPrice.length > 60 ? 0 : 2,
      pointHoverRadius: 5,
    }]
  }), [filteredPrice]);

  const chartOptions = (unit: string) => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index' as const, intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        titleColor: '#f9fafb',
        bodyColor: '#f9fafb',
        padding: 12,
        cornerRadius: 8,
        callbacks: {
          label: (ctx: any) => `${ctx.dataset.label}: ${ctx.parsed.y?.toLocaleString()} ${unit}`,
        }
      }
    },
    scales: {
      x: {
        grid: { color: 'rgba(148, 163, 184, 0.06)' },
        ticks: { color: 'var(--color-text-muted)', maxRotation: 0, maxTicksLimit: 10 },
      },
      y: {
        grid: { color: 'rgba(148, 163, 184, 0.06)' },
        ticks: { color: 'var(--color-text-muted)' },
      }
    }
  });

  const RangeButtons = ({ value, onChange }: { value: DateRange; onChange: (r: DateRange) => void }) => (
    <div className="flex gap-1">
      {(['all', '7d', '30d', '90d'] as DateRange[]).map(r => (
        <button key={r} className={`btn btn-sm ${r === value ? 'btn-primary' : 'btn-ghost'}`} onClick={() => onChange(r)}>
          {r === 'all' ? 'All' : r.toUpperCase()}
        </button>
      ))}
    </div>
  );

  const handleAddToPipeline = async (productId: number) => {
    try {
      await moveToNewStatus(productId);
      queryClient.invalidateQueries({ queryKey: ['similar-products', id] });
    } catch (err) {
      console.error('Failed to add to pipeline:', err);
    }
  };

  const handleRemoveFromPipeline = async (productId: number) => {
    try {
      await updateProductStatus(productId, '');
      queryClient.invalidateQueries({ queryKey: ['similar-products', id] });
    } catch (err) {
      console.error('Failed to remove from pipeline:', err);
    }
  };

  if (isLoading) {
    return (
      <div className="animate-fade-in">
        <div className="skeleton skeleton-heading" />
        <div className="grid grid-cols-4 gap-4" style={{ marginBottom: 'var(--spacing-8)' }}>
          {[1,2,3,4].map(i => <div key={i} className="card skeleton" style={{ height: 100 }} />)}
        </div>
      </div>
    );
  }

  if (!product) {
    return <div className="text-muted" style={{ padding: 'var(--spacing-12)', textAlign: 'center' }}>Product not found</div>;
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-4">
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>← Back</button>
          <h1 style={{ fontSize: '1.25rem' }}>{product.name || `Product #${id}`}</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            className="btn btn-ghost btn-sm"
            onClick={async () => {
              setShortlisted(prev => !prev);
              try { await toggleShortlist(Number(id)); } catch { setShortlisted(prev => !prev); }
            }}
            title={shortlisted ? 'Remove from watchlist' : 'Add to watchlist'}
            style={{ fontSize: '1.1rem', color: shortlisted ? '#ef4444' : undefined }}
          >
            {shortlisted ? '♥' : '♡'}
          </button>
          <a href={product.url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">Visit Store ↗</a>
          <button className="btn btn-primary btn-sm" onClick={() => navigate(`/product/${id}/pipeline-details`)}>Pipeline Details →</button>
        </div>
      </div>

      {/* Product Hero — Large image + stats */}
      <div className="card flex gap-8" style={{ marginBottom: 'var(--spacing-8)', padding: 'var(--spacing-6)', alignItems: 'flex-start' }}>
        {/* Large Product Image */}
        <div style={{
          width: 300, minWidth: 300, height: 300,
          borderRadius: 'var(--radius-lg)', overflow: 'hidden',
          background: 'var(--color-bg-hover)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          {product.image ? (
            <img src={product.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          ) : (
            <span style={{ fontSize: '3rem', color: 'var(--color-text-muted)' }}>?</span>
          )}
        </div>

        {/* Product Stats — vertical list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)', paddingTop: 'var(--spacing-2)' }}>
          <div>
            <div className="text-xs" style={{ marginBottom: 2, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Current Stock</div>
            <div className="text-mono" style={{ fontSize: '1.5rem', fontWeight: 700 }}>{product.current_stock?.toLocaleString() ?? '—'}</div>
          </div>
          <div>
            <div className="text-xs" style={{ marginBottom: 2, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Current Price</div>
            <div className="text-mono" style={{ fontSize: '1.5rem', fontWeight: 700 }}>{product.current_price ? `${product.current_price.toFixed(2)} RON` : '—'}</div>
          </div>
          <div>
            <div className="text-xs" style={{ marginBottom: 2, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Store</div>
            <div style={{ fontWeight: 600 }}>{product.parser_name || '—'}</div>
            {product.vendor && <div className="text-xs">{product.vendor}</div>}
          </div>
          <div>
            <div className="text-xs" style={{ marginBottom: 2, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pipeline Status</div>
            <span className={`badge ${product.pipeline_status ? 'badge-info' : 'badge-neutral'}`}>
              {product.pipeline_status || 'None'}
            </span>
          </div>
          <div className="text-xs" style={{ marginTop: 'var(--spacing-2)' }}>
            {(product.stock_history?.length || 0)} stock records · {(product.price_history?.length || 0)} price records
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-2 gap-6">
        <div className="card">
          <div className="flex justify-between items-center" style={{ marginBottom: 'var(--spacing-4)' }}>
            <h3>Stock History</h3>
            <RangeButtons value={stockRange} onChange={setStockRange} />
          </div>
          <div style={{ height: 300 }}>
            {filteredStock.length > 0 ? (
              <Line data={stockChartData} options={chartOptions('units')} />
            ) : (
              <div className="flex items-center justify-center h-full text-muted">No stock data for this period</div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="flex justify-between items-center" style={{ marginBottom: 'var(--spacing-4)' }}>
            <h3>Price History</h3>
            <RangeButtons value={priceRange} onChange={setPriceRange} />
          </div>
          <div style={{ height: 300 }}>
            {filteredPrice.length > 0 ? (
              <Line data={priceChartData} options={chartOptions('RON')} />
            ) : (
              <div className="flex items-center justify-center h-full text-muted">No price data for this period</div>
            )}
          </div>
        </div>
      </div>

      {/* Similar Products — on demand */}
      <div className="card" style={{ marginTop: 'var(--spacing-8)', padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: 'var(--spacing-5) var(--spacing-6) var(--spacing-3)' }}>
          <div className="flex items-center gap-3">
            <h3 style={{ margin: 0 }}>Similar Products</h3>
            {!showSimilar ? (
              <button className="btn btn-primary btn-sm" onClick={() => setShowSimilar(true)}>
                🔍 Find Similar Products
              </button>
            ) : (
              <span className="text-sm">
                {similarLoading ? 'Searching...' : `${similarProducts.length} found by name similarity`}
              </span>
            )}
          </div>
        </div>
        {showSimilar && (
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 50 }}></th>
                <th>Name</th>
                <th>Store</th>
                <th>Stock</th>
                <th>Price</th>
                <th style={{ width: 80 }}>Score</th>
                <th style={{ width: 100 }}>Match</th>
                <th style={{ width: 120 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {similarLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}><td colSpan={8}><div className="skeleton skeleton-text" style={{ width: `${50 + Math.random() * 40}%` }} /></td></tr>
                ))
              ) : similarProducts.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 'var(--spacing-8)' }} className="text-muted">No similar products found</td></tr>
              ) : similarProducts.map(sp => (
                <tr key={sp.id}>
                  <td>
                    <div className="dash-thumb">
                      {sp.image ? <img src={sp.image} alt="" loading="lazy" /> : <div className="dash-thumb-empty">?</div>}
                    </div>
                  </td>
                  <td>
                    <Link to={`/product/${sp.id}`} className="dash-product-link"
                      style={{ display: 'block', maxWidth: 350, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {sp.name}
                    </Link>
                    {sp.vendor && <div className="text-xs text-muted">{sp.vendor}</div>}
                  </td>
                  <td className="text-sm text-muted">{sp.parser_name || '—'}</td>
                  <td className="text-mono">{sp.current_stock?.toLocaleString() ?? '—'}</td>
                  <td className="text-mono">{sp.current_price ? `${sp.current_price.toFixed(2)}` : '—'}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <span className="badge" style={{
                        background: GRADE_COLORS[sp.grade] || '#334155',
                        color: '#fff',
                        fontWeight: 700,
                        fontSize: '0.7rem',
                        minWidth: 24,
                        textAlign: 'center',
                      }}>
                        {sp.grade}
                      </span>
                      <span className="text-mono text-xs">{sp.total_score}</span>
                    </div>
                  </td>
                  <td>
                    <div className="flex items-center gap-1">
                      <div style={{
                        width: 40,
                        height: 6,
                        borderRadius: 3,
                        background: 'var(--color-border-default)',
                        overflow: 'hidden',
                      }}>
                        <div style={{
                          width: `${Math.min(sp.similarity * 100, 100)}%`,
                          height: '100%',
                          borderRadius: 3,
                          background: sp.similarity > 0.5 ? '#22c55e' : sp.similarity > 0.3 ? '#eab308' : '#64748b',
                        }} />
                      </div>
                      <span className="text-xs text-muted">{(sp.similarity * 100).toFixed(0)}%</span>
                    </div>
                  </td>
                  <td>
                    <div className="dash-actions">
                      {!sp.pipeline_status ? (
                        <button className="btn btn-ghost btn-sm" onClick={() => handleAddToPipeline(sp.id)} title="Add to Pipeline">+</button>
                      ) : (
                        <>
                          <span className="badge badge-info" style={{ fontSize: '0.6rem' }}>{sp.pipeline_status}</span>
                          <button className="btn btn-ghost btn-sm" onClick={() => handleRemoveFromPipeline(sp.id)}
                            title="Remove from Pipeline" style={{ color: 'var(--color-danger)' }}>✕</button>
                        </>
                      )}
                      <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/product/${sp.id}`)} title="View Details">→</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
