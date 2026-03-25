/**
 * ProductPipeline — Full sourcing workbench with progressive status sections,
 * stock/price charts, seasonality, financials, and status transitions.
 * Adapted from V2 structure with V3 design system.
 */
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, Filler, Tooltip, Legend,
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import {
  fetchPipelineDetails, savePipelineDetails,
  generateSeasonality, autofillTaric
} from '../api';
import { useSidebar } from '../contexts/SidebarContext';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Filler, Tooltip, Legend);

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const PIPELINE_STATUSES = [
  'None', 'New', 'Waiting for Supplier Info', 'Financial Review',
  'Market Research', 'Approved', 'Hold', 'Discarded',
];

type DatePeriod = 'all' | '7d' | '30d' | '90d' | 'custom';
interface DateRange { start: string | null; end: string | null; }

function filterByPeriod<T extends { timestamp: string }>(
  data: T[], period: DatePeriod, customRange: DateRange
): T[] {
  if (period === 'all') return data;
  const now = new Date();
  let startDate: Date;
  let endDate: Date = now;

  if (period === 'custom') {
    if (!customRange.start && !customRange.end) return data;
    startDate = customRange.start ? new Date(customRange.start) : new Date(0);
    endDate = customRange.end ? new Date(customRange.end) : now;
    endDate.setHours(23, 59, 59, 999);
  } else {
    const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
    startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  }
  return data.filter((item) => {
    const d = new Date(item.timestamp);
    return d >= startDate && d <= endDate;
  });
}

function shouldShowSection(sectionStatus: string, currentStatus: string): boolean {
  const currentIndex = PIPELINE_STATUSES.indexOf(currentStatus);
  const sectionIndex = PIPELINE_STATUSES.indexOf(sectionStatus);
  if (['Hold', 'Discarded'].includes(sectionStatus)) return currentStatus === sectionStatus;
  return sectionIndex >= 0 && sectionIndex <= currentIndex;
}

export default function ProductPipeline() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { refresh: refreshSidebar } = useSidebar();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [genSeasonality, setGenSeasonality] = useState(false);
  const [genTaric, setGenTaric] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [form, setForm] = useState<any>({});

  // Chart modal
  const [showChartModal, setShowChartModal] = useState(false);
  const [chartPeriod, setChartPeriod] = useState<DatePeriod>('30d');
  const [chartCustomRange, setChartCustomRange] = useState<DateRange>({ start: null, end: null });

  useEffect(() => { window.scrollTo(0, 0); }, [id]);

  const loadData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await fetchPipelineDetails(parseInt(id));
      setData(res.data);
      const pd = res.data.pipeline_detail || {};
      setForm({
        ...pd,
        retail_price: pd.retail_price ?? res.data.metrics?.current_price,
        selectedCategories: res.data.assigned_category_ids || [],
        groupId: res.data.product?.group_id,
        status: res.data.product?.pipeline_status || 'New',
      });
    } catch {
      navigate('/');
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => { loadData(); }, [loadData]);

  const updateField = (key: string, value: any) => {
    setForm((prev: any) => ({ ...prev, [key]: value }));
  };

  // ─── Save ────────────────────────────────────────────────────
  const handleSave = useCallback(async (action: 'save' | 'process' | 'approve' | 'discard' = 'save') => {
    if (!data || !id) return;
    setSaving(true);
    setMessage(null);

    let targetStatus = form.status || 'New';
    if (action === 'process') {
      const idx = PIPELINE_STATUSES.indexOf(targetStatus);
      if (idx > -1 && idx < PIPELINE_STATUSES.length - 1 && !['Market Research', 'Approved', 'Hold', 'Discarded'].includes(targetStatus)) {
        targetStatus = PIPELINE_STATUSES[idx + 1];
      }
    } else if (action === 'approve') {
      targetStatus = 'Approved';
    } else if (action === 'discard') {
      targetStatus = 'Discarded';
    }

    try {
      const payload = {
        title: form.title,
        specs: form.specs,
        retail_price: form.retail_price ? parseFloat(form.retail_price) : null,
        cogs_usd: form.cogs_usd ? parseFloat(form.cogs_usd) : null,
        transport_usd: form.transport_usd ? parseFloat(form.transport_usd) : null,
        customs_rate_percentage: form.customs_rate_percentage ? parseFloat(form.customs_rate_percentage) : null,
        hs_code: form.hs_code,
        cubic_meters: form.cubic_meters ? parseFloat(form.cubic_meters) : null,
        dimension_width_cm: form.dimension_width_cm ? parseFloat(form.dimension_width_cm) : null,
        dimension_length_cm: form.dimension_length_cm ? parseFloat(form.dimension_length_cm) : null,
        dimension_height_cm: form.dimension_height_cm ? parseFloat(form.dimension_height_cm) : null,
        factory_link_url: form.factory_link_url,
        top_keywords: form.top_keywords,
        keyword_difficulty: form.keyword_difficulty,
        main_competitors: form.main_competitors,
        market_research_insights: form.market_research_insights,
        suggested_quantity_min: form.suggested_quantity_min ? parseInt(form.suggested_quantity_min) : null,
        suggested_quantity_max: form.suggested_quantity_max ? parseInt(form.suggested_quantity_max) : null,
        first_order_cost_estimate: form.first_order_cost_estimate ? parseFloat(form.first_order_cost_estimate) : null,
        launch_notes: form.launch_notes,
        monthly_sales_index: form.monthly_sales_index,
        assigned_category_ids: form.selectedCategories || [],
        group_id: form.groupId,
        new_pipeline_status: targetStatus,
      };

      const res = await savePipelineDetails(parseInt(id), payload);
      const result = res.data;
      setMessage({ type: 'success', text: result.message || 'Saved successfully!' });

      if (result.updated_status && result.updated_status !== form.status) {
        setForm((prev: any) => ({ ...prev, status: result.updated_status }));
        if (data) setData({ ...data, product: { ...data.product, pipeline_status: result.updated_status } });
        refreshSidebar();
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Failed to save' });
    } finally {
      setSaving(false);
    }
  }, [data, form, id, refreshSidebar]);

  // ─── AI Seasonality ──────────────────────────────────────────
  const handleGenerateSeasonality = async () => {
    if (!id) return;
    setGenSeasonality(true);
    setMessage(null);
    try {
      const res = await generateSeasonality(parseInt(id));
      setForm((prev: any) => ({ ...prev, monthly_sales_index: res.data.monthly_sales_index }));
      setMessage({ type: 'success', text: res.data.message || 'Seasonality generated!' });
    } catch (err: any) {
      const detail = err?.response?.data?.detail || 'Failed to generate seasonality. Check server logs.';
      setMessage({ type: 'error', text: detail });
    } finally {
      setGenSeasonality(false);
    }
  };

  // ─── AI TARIC ────────────────────────────────────────────────
  const handleAutofillTARIC = async () => {
    if (!id) return;
    setGenTaric(true);
    try {
      const res = await autofillTaric(parseInt(id));
      setForm((prev: any) => ({
        ...prev,
        hs_code: res.data.hs_code,
        customs_rate_percentage: res.data.customs_rate_percentage,
      }));
      setMessage({ type: 'success', text: res.data.message });
    } catch {
      setMessage({ type: 'error', text: 'Failed to autofill TARIC data' });
    } finally {
      setGenTaric(false);
    }
  };

  const calculateLandedCost = () => {
    const cogs = parseFloat(form.cogs_usd) || 0;
    const transport = parseFloat(form.transport_usd) || 0;
    const customs = parseFloat(form.customs_rate_percentage) || 0;
    if (cogs > 0) return ((cogs + transport) * (1 + customs / 100)).toFixed(2);
    return 'N/A';
  };

  // ─── Loading state ──────────────────────────────────────────
  if (loading) {
    return (
      <div className="animate-fade-in" style={{ padding: 'var(--spacing-8)' }}>
        <div className="skeleton skeleton-heading" />
        <div className="skeleton" style={{ height: 400, marginTop: 'var(--spacing-6)', borderRadius: 'var(--radius-lg)' }} />
      </div>
    );
  }
  if (!data) return <div style={{ padding: 'var(--spacing-8)', color: 'var(--color-text-error)' }}>Product not found</div>;

  const { product, metrics, stock_history = [], price_history = [], all_groups = [], all_categories: all_product_categories = [] } = data;
  const currentStatus = form.status || 'New';

  // Chart filtering
  const filteredStock = filterByPeriod(stock_history, chartPeriod, chartCustomRange);
  const filteredPrice = filterByPeriod(price_history, chartPeriod, chartCustomRange);

  // Seasonality high-demand months
  const highDemandMonths = (form.monthly_sales_index || [])
    .map((val: number, idx: number) => (val || 0) > 50 ? MONTH_LABELS[idx] : null)
    .filter(Boolean);

  return (
    <div className="animate-fade-in" style={{ paddingBottom: 'var(--spacing-16)' }}>
      {/* ─── Breadcrumb & Actions ── */}
      <div className="page-header">
        <div className="flex items-center gap-3" style={{ fontSize: '0.875rem' }}>
          <Link to="/" style={{ color: 'var(--color-text-muted)', textDecoration: 'none' }}>Products</Link>
          <span style={{ color: 'var(--color-text-muted)' }}>/</span>
          <span>Pipeline: {product.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn btn-primary btn-sm" onClick={() => handleSave('save')} disabled={saving}>
            {saving && <span className="spinner-sm" />}
            💾 Save
          </button>
          {currentStatus === 'Market Research' ? (
            <>
              <button className="btn btn-sm" style={{ background: 'var(--color-success)', color: '#fff' }} onClick={() => handleSave('approve')}>✓ Approve</button>
              <button className="btn btn-sm" style={{ background: 'var(--color-error)', color: '#fff' }} onClick={() => handleSave('discard')}>✗ Discard</button>
            </>
          ) : !['Approved', 'Hold', 'Discarded', 'None'].includes(currentStatus) && (
            <button className="btn btn-sm" style={{ background: 'var(--color-indigo-600)', color: '#fff' }} onClick={() => handleSave('process')}>
              Save & Process →
            </button>
          )}
        </div>
      </div>

      {/* ─── Status Message ── */}
      {message && (
        <div className="animate-fade-in" style={{
          padding: 'var(--spacing-3) var(--spacing-4)',
          borderRadius: 'var(--radius-md)',
          marginBottom: 'var(--spacing-4)',
          fontSize: '0.875rem',
          background: message.type === 'success' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
          color: message.type === 'success' ? 'var(--color-success)' : 'var(--color-error)',
          border: `1px solid ${message.type === 'success' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
        }}>
          {message.text}
        </div>
      )}

      {/* ─── Product Header Card ── */}
      <div className="card" style={{ marginBottom: 'var(--spacing-4)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--spacing-4)', alignItems: 'start' }}>
          {/* Left: Image + Info */}
          <div className="flex gap-4">
            <div style={{
              width: 80, height: 80, borderRadius: 'var(--radius-md)', overflow: 'hidden', flexShrink: 0,
              background: 'var(--color-bg-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {product.image ? <img src={product.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <span style={{ color: 'var(--color-text-muted)' }}>?</span>}
            </div>
            <div>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>{form.title || product.name}</h2>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
                <p style={{ margin: '2px 0' }}>SKU: <span className="text-mono" style={{ color: 'var(--color-text-default)' }}>{form.sku || 'N/A'}</span></p>
                <p style={{ margin: '2px 0' }}>Barcode: <span className="text-mono" style={{ color: 'var(--color-text-default)' }}>{form.barcode || 'N/A'}</span></p>
                {product.url && (
                  <a href={product.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-indigo-400)', fontSize: '0.75rem' }}>View on Site →</a>
                )}
              </div>
            </div>
          </div>

          {/* Center: Live Metrics */}
          <div style={{ fontSize: '0.875rem' }}>
            <p style={{ color: 'var(--color-text-muted)', margin: '4px 0' }}>Price: <span style={{ color: 'var(--color-success)', fontWeight: 700 }}>{metrics?.current_price?.toFixed(2) || 'N/A'} RON</span></p>
            <p style={{ color: 'var(--color-text-muted)', margin: '4px 0' }}>Stock: <span style={{ fontWeight: 700, color: 'var(--color-text-default)' }}>{metrics?.current_stock?.toLocaleString() ?? '—'}</span></p>
            <p style={{ color: 'var(--color-text-muted)', margin: '4px 0' }}>Avg Daily Sales: <span style={{ color: 'var(--color-indigo-400)', fontWeight: 700 }}>{metrics?.avg_daily_sales_30d?.toFixed(1) ?? '—'}</span></p>
            {metrics?.gross_margin != null && (
              <p style={{ color: 'var(--color-text-muted)', margin: '4px 0' }}>Gross Margin: <span style={{ color: metrics.gross_margin >= 50 ? 'var(--color-success)' : metrics.gross_margin >= 30 ? 'var(--color-warning)' : 'var(--color-error)', fontWeight: 700 }}>{metrics.gross_margin}%</span></p>
            )}
          </div>

          {/* Right: Mini Stock Chart */}
          <div
            onClick={() => setShowChartModal(true)}
            style={{
              height: 96, cursor: 'pointer', borderRadius: 'var(--radius-md)', overflow: 'hidden',
              position: 'relative', transition: 'opacity 0.2s',
            }}
            title="Click to expand chart"
          >
            {stock_history.length > 0 ? (
              <div style={{ width: '100%', height: '100%', pointerEvents: 'none' }}>
                <Line
                  data={{
                    labels: stock_history.slice(-60).map(() => ''),
                    datasets: [{
                      data: stock_history.slice(-60).map((h: any) => h.quantity),
                      borderColor: '#818cf8',
                      backgroundColor: 'rgba(129, 140, 248, 0.15)',
                      fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2,
                    }],
                  }}
                  options={{
                    responsive: true, maintainAspectRatio: false,
                    animation: { duration: 800, easing: 'easeOutQuart' },
                    plugins: { legend: { display: false }, tooltip: { enabled: false } },
                    scales: { x: { display: false }, y: { display: false } },
                  }}
                />
              </div>
            ) : (
              <p className="text-sm text-muted" style={{ textAlign: 'center', paddingTop: 'var(--spacing-8)' }}>No stock history</p>
            )}
            <div style={{
              position: 'absolute', top: 4, right: 4,
              background: 'var(--color-bg-overlay)', borderRadius: 'var(--radius-sm)', padding: 2,
              fontSize: '0.65rem', color: 'var(--color-text-muted)',
            }}>⇱ Expand</div>
          </div>
        </div>
      </div>

      {/* ─── Key Financials & Seasonality ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-4)', marginBottom: 'var(--spacing-4)' }}>
        {/* Financials Panel */}
        <div className="card">
          <div className="flex items-center justify-between" style={{ marginBottom: 'var(--spacing-3)' }}>
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>Key Financials</h3>
            <select
              className="select"
              value={currentStatus}
              onChange={e => setForm((prev: any) => ({ ...prev, status: e.target.value }))}
              style={{ maxWidth: 200, fontSize: '0.8rem' }}
            >
              {PIPELINE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-3)' }}>
            <div className="form-group">
              <label className="form-label" style={{ fontSize: '0.75rem' }}>Est. Retail (RON)</label>
              <div className="flex gap-1">
                <input className="input" type="number" step="0.01" value={form.retail_price || ''} onChange={e => updateField('retail_price', e.target.value)} style={{ fontSize: '0.85rem' }} />
                <button className="btn btn-ghost btn-sm" onClick={() => updateField('retail_price', metrics?.current_price)} title="Use live price" style={{ padding: '0 8px' }}>↓</button>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label" style={{ fontSize: '0.75rem' }}>Group</label>
              <select className="select" value={form.groupId || ''} onChange={e => updateField('groupId', e.target.value ? Number(e.target.value) : null)} style={{ fontSize: '0.85rem' }}>
                <option value="">No Group</option>
                {all_groups.map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginTop: 'var(--spacing-2)' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Landed Cost (USD): </span>
            <span style={{ color: 'var(--color-indigo-400)', fontWeight: 700 }}>${calculateLandedCost()}</span>
          </div>
        </div>

        {/* Seasonality Panel */}
        <div className="card">
          <div className="flex items-center justify-between" style={{ marginBottom: 'var(--spacing-2)' }}>
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>Seasonality Analysis</h3>
            <button className="btn btn-ghost btn-sm" onClick={handleGenerateSeasonality} disabled={genSeasonality}>
              {genSeasonality ? '⏳ Generating...' : '✨ Generate'}
            </button>
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: 'var(--spacing-2)' }}>
            High Demand (&gt;50): <span style={{ color: 'var(--color-success)', fontWeight: 700 }}>{highDemandMonths.length > 0 ? highDemandMonths.join(', ') : 'None'}</span>
          </p>
          <div style={{ height: 160 }}>
            <Bar
              data={{
                labels: MONTH_LABELS,
                datasets: [{
                  label: 'Demand Index',
                  data: form.monthly_sales_index?.length === 12 ? form.monthly_sales_index : Array(12).fill(0),
                  backgroundColor: (form.monthly_sales_index || Array(12).fill(0)).map((v: number) =>
                    v > 50 ? 'rgba(34, 197, 94, 0.7)' : 'rgba(99, 102, 241, 0.6)'
                  ),
                  borderColor: (form.monthly_sales_index || Array(12).fill(0)).map((v: number) =>
                    v > 50 ? '#22c55e' : '#6366f1'
                  ),
                  borderWidth: 1,
                  borderRadius: 4,
                }],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 800, easing: 'easeOutQuart' },
                plugins: {
                  legend: { display: false },
                  tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    titleColor: '#f9fafb',
                    bodyColor: '#f9fafb',
                    padding: 10,
                    cornerRadius: 6,
                    displayColors: false,
                    callbacks: {
                      label: (ctx: any) => `Demand: ${ctx.parsed.y}/100`,
                    },
                  },
                },
                scales: {
                  x: { grid: { display: false }, ticks: { color: '#334155', font: { size: 11 } } },
                  y: { min: 0, max: 100, grid: { color: 'rgba(148,163,184,0.08)' }, ticks: { color: '#334155', stepSize: 25, font: { size: 10 } } },
                },
              }}
            />
          </div>
        </div>
      </div>

      {/* ─── Status Sections ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-4)' }}>

        {/* New */}
        {shouldShowSection('New', currentStatus) && (
          <div className="card" style={{ borderLeft: '4px solid var(--color-text-muted)', background: 'var(--color-bg-subtle)' }}>
            <h4 style={{ fontSize: '0.85rem', fontWeight: 600, borderBottom: '1px solid var(--color-border-default)', paddingBottom: 'var(--spacing-2)', marginBottom: 'var(--spacing-3)' }}>
              Status: New
            </h4>
            <div className="form-group">
              <label className="form-label" style={{ fontSize: '0.75rem' }}>Product Specs</label>
              <textarea className="textarea" rows={3} value={form.specs || ''} onChange={e => updateField('specs', e.target.value)} />
            </div>
            <div className="form-group" style={{ position: 'relative' }}>
              <label className="form-label" style={{ fontSize: '0.75rem' }}>Categories</label>
              {/* Searchable multi-select dropdown */}
              {(() => {
                const selectedIds: number[] = form.selectedCategories || [];
                const selectedCats = all_product_categories.filter((c: any) => selectedIds.includes(c.id));
                return (
                  <>
                    {/* Trigger button */}
                    <button
                      type="button"
                      className="input"
                      onClick={(e) => {
                        const dropdown = (e.currentTarget.nextElementSibling as HTMLElement);
                        if (dropdown) dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
                      }}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        cursor: 'pointer', fontSize: '0.8125rem', width: '100%', textAlign: 'left',
                        color: selectedCats.length > 0 ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                      }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {selectedCats.length > 0 ? `${selectedCats.length} selected` : 'Select categories...'}
                      </span>
                      <span style={{ fontSize: '0.65rem', opacity: 0.6 }}>▼</span>
                    </button>

                    {/* Dropdown panel */}
                    <div style={{
                      display: 'none', position: 'absolute', top: '100%', left: 0, right: 0,
                      zIndex: 50, marginTop: 4,
                      background: 'var(--color-bg-card)', border: '1px solid var(--color-border-default)',
                      borderRadius: 'var(--radius-md)', boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                      maxHeight: 240, overflow: 'hidden',
                    }}>
                      {/* Search input */}
                      <div style={{ padding: '8px', borderBottom: '1px solid var(--color-border-default)' }}>
                        <input
                          className="input"
                          placeholder="Search categories..."
                          style={{ fontSize: '0.8125rem', width: '100%' }}
                          onChange={(e) => {
                            const term = e.target.value.toLowerCase();
                            const items = e.target.closest('div')?.nextElementSibling?.querySelectorAll('[data-cat-item]');
                            items?.forEach((item: any) => {
                              item.style.display = item.dataset.catName?.toLowerCase().includes(term) ? 'flex' : 'none';
                            });
                          }}
                        />
                      </div>
                      {/* Category list */}
                      <div style={{ maxHeight: 180, overflowY: 'auto', padding: '4px 0' }}>
                        {all_product_categories.map((cat: any) => (
                          <label
                            key={cat.id}
                            data-cat-item=""
                            data-cat-name={cat.name}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 8,
                              padding: '6px 12px', cursor: 'pointer',
                              fontSize: '0.8125rem', color: 'var(--color-text-primary)',
                              transition: 'background 0.1s',
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
                            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                          >
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(cat.id)}
                              onChange={() => {
                                const ids = form.selectedCategories || [];
                                updateField('selectedCategories', ids.includes(cat.id) ? ids.filter((i: number) => i !== cat.id) : [...ids, cat.id]);
                              }}
                              style={{ accentColor: 'var(--color-indigo-500)', width: 14, height: 14 }}
                            />
                            <span>{cat.name}</span>
                            {cat.code && <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', marginLeft: 'auto' }}>{cat.code}</span>}
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Selected tags */}
                    {selectedCats.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                        {selectedCats.map((cat: any) => (
                          <span key={cat.id} style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            fontSize: '0.7rem', padding: '2px 8px',
                            borderRadius: 'var(--radius-full)',
                            background: 'var(--color-indigo-600)', color: '#fff',
                          }}>
                            {cat.name}
                            <span
                              style={{ cursor: 'pointer', opacity: 0.7, fontSize: '0.8rem', lineHeight: 1 }}
                              onClick={() => {
                                const ids = form.selectedCategories || [];
                                updateField('selectedCategories', ids.filter((i: number) => i !== cat.id));
                              }}
                            >×</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        )}

        {/* Waiting for Supplier Info */}
        {shouldShowSection('Waiting for Supplier Info', currentStatus) && (
          <div className="card" style={{ borderLeft: '4px solid var(--color-warning)', background: 'rgba(251,191,36,0.05)' }}>
            <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-warning)', borderBottom: '1px solid rgba(251,191,36,0.2)', paddingBottom: 'var(--spacing-2)', marginBottom: 'var(--spacing-3)' }}>
              Status: Waiting for Supplier Info
            </h4>
            <div className="form-group">
              <label className="form-label" style={{ fontSize: '0.75rem' }}>Factory Link URL</label>
              <input className="input" type="url" value={form.factory_link_url || ''} onChange={e => updateField('factory_link_url', e.target.value)} placeholder="https://..." />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-3)' }}>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: '0.75rem' }}>COGS (USD)</label>
                <input className="input" type="number" step="0.01" value={form.cogs_usd || ''} onChange={e => updateField('cogs_usd', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: '0.75rem' }}>Transport (USD/unit)</label>
                <input className="input" type="number" step="0.01" value={form.transport_usd || ''} onChange={e => updateField('transport_usd', e.target.value)} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 'var(--spacing-2)' }}>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: '0.7rem' }}>Width (cm)</label>
                <input className="input" type="number" step="0.1" value={form.dimension_width_cm || ''} onChange={e => updateField('dimension_width_cm', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: '0.7rem' }}>Length (cm)</label>
                <input className="input" type="number" step="0.1" value={form.dimension_length_cm || ''} onChange={e => updateField('dimension_length_cm', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: '0.7rem' }}>Height (cm)</label>
                <input className="input" type="number" step="0.1" value={form.dimension_height_cm || ''} onChange={e => updateField('dimension_height_cm', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: '0.7rem' }}>Volume (m³)</label>
                <input className="input" type="number" step="0.001" value={form.cubic_meters || ''} onChange={e => updateField('cubic_meters', e.target.value)} />
              </div>
            </div>
          </div>
        )}

        {/* Financial Review */}
        {shouldShowSection('Financial Review', currentStatus) && (
          <div className="card" style={{ borderLeft: '4px solid var(--color-indigo-500)', background: 'rgba(99,102,241,0.05)' }}>
            <div className="flex items-center justify-between" style={{ borderBottom: '1px solid rgba(99,102,241,0.2)', paddingBottom: 'var(--spacing-2)', marginBottom: 'var(--spacing-3)' }}>
              <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-indigo-400)', margin: 0 }}>Status: Financial Review</h4>
              <button className="btn btn-ghost btn-sm" onClick={handleAutofillTARIC} disabled={genTaric}>
                {genTaric ? '⏳...' : '✨ Autofill TARIC'}
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--spacing-3)' }}>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: '0.75rem' }}>Customs (%)</label>
                <input className="input" type="number" step="0.1" value={form.customs_rate_percentage || ''} onChange={e => updateField('customs_rate_percentage', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: '0.75rem' }}>HS Code</label>
                <input className="input text-mono" value={form.hs_code || ''} onChange={e => updateField('hs_code', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: '0.75rem' }}>Landed Cost</label>
                <p style={{ color: 'var(--color-indigo-400)', fontWeight: 700, fontSize: '0.95rem', marginTop: 6 }}>${calculateLandedCost()}</p>
              </div>
            </div>
          </div>
        )}

        {/* Market Research */}
        {shouldShowSection('Market Research', currentStatus) && (
          <div className="card" style={{ borderLeft: '4px solid var(--color-success)', background: 'rgba(34,197,94,0.05)' }}>
            <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-success)', borderBottom: '1px solid rgba(34,197,94,0.2)', paddingBottom: 'var(--spacing-2)', marginBottom: 'var(--spacing-3)' }}>
              Status: Market Research
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-3)' }}>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: '0.75rem' }}>Top Keywords</label>
                <textarea className="textarea" rows={3} value={form.top_keywords || ''} onChange={e => updateField('top_keywords', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: '0.75rem' }}>Main Competitors</label>
                <textarea className="textarea" rows={3} value={form.main_competitors || ''} onChange={e => updateField('main_competitors', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label" style={{ fontSize: '0.75rem' }}>Market Insights</label>
              <textarea className="textarea" rows={2} value={form.market_research_insights || ''} onChange={e => updateField('market_research_insights', e.target.value)} />
            </div>
          </div>
        )}

        {/* Approved */}
        {shouldShowSection('Approved', currentStatus) && (
          <div className="card" style={{ borderLeft: '4px solid var(--color-text-muted)', background: 'var(--color-bg-subtle)' }}>
            <h4 style={{ fontSize: '0.85rem', fontWeight: 600, borderBottom: '1px solid var(--color-border-default)', paddingBottom: 'var(--spacing-2)', marginBottom: 'var(--spacing-3)' }}>
              Status: Approved
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--spacing-3)' }}>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: '0.75rem' }}>Min Qty</label>
                <input className="input" type="number" value={form.suggested_quantity_min || ''} onChange={e => updateField('suggested_quantity_min', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: '0.75rem' }}>Max Qty</label>
                <input className="input" type="number" value={form.suggested_quantity_max || ''} onChange={e => updateField('suggested_quantity_max', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: '0.75rem' }}>1st Order Cost (USD)</label>
                <input className="input" type="number" step="0.01" value={form.first_order_cost_estimate || ''} onChange={e => updateField('first_order_cost_estimate', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label" style={{ fontSize: '0.75rem' }}>Launch Notes</label>
              <textarea className="textarea" rows={2} value={form.launch_notes || ''} onChange={e => updateField('launch_notes', e.target.value)} />
            </div>
          </div>
        )}

        {/* Hold */}
        {currentStatus === 'Hold' && (
          <div className="card" style={{ borderLeft: '4px solid #f97316', background: 'rgba(249,115,22,0.05)' }}>
            <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f97316', borderBottom: '1px solid rgba(249,115,22,0.2)', paddingBottom: 'var(--spacing-2)', marginBottom: 'var(--spacing-3)' }}>
              Status: On Hold
            </h4>
            <div className="form-group">
              <label className="form-label" style={{ fontSize: '0.75rem' }}>Hold Notes / Reason</label>
              <textarea className="textarea" rows={3} value={form.launch_notes || ''} onChange={e => updateField('launch_notes', e.target.value)} />
            </div>
          </div>
        )}

        {/* Discarded */}
        {currentStatus === 'Discarded' && (
          <div className="card" style={{ borderLeft: '4px solid var(--color-error)', background: 'rgba(239,68,68,0.05)' }}>
            <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-error)', borderBottom: '1px solid rgba(239,68,68,0.2)', paddingBottom: 'var(--spacing-2)', marginBottom: 'var(--spacing-3)' }}>
              Status: Discarded
            </h4>
            <div className="form-group">
              <label className="form-label" style={{ fontSize: '0.75rem' }}>Reason for Discarding</label>
              <textarea className="textarea" rows={3} value={form.launch_notes || ''} onChange={e => updateField('launch_notes', e.target.value)} />
            </div>
          </div>
        )}
      </div>

      {/* ─── Chart Popup Modal ── */}
      {showChartModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 'var(--spacing-4)',
        }} onClick={() => setShowChartModal(false)}>
          <div className="card" style={{ width: '100%', maxWidth: 900, maxHeight: '90vh', overflow: 'auto', padding: 0 }} onClick={e => e.stopPropagation()}>
            {/* Modal Header */}
            <div style={{
              position: 'sticky', top: 0, background: 'var(--color-bg-default)', borderBottom: '1px solid var(--color-border-default)',
              padding: 'var(--spacing-4)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 1,
            }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Stock & Price History</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowChartModal(false)}>✕ Close</button>
            </div>

            {/* Date Filters */}
            <div style={{ padding: 'var(--spacing-3) var(--spacing-4)', borderBottom: '1px solid var(--color-border-default)' }}>
              <div className="flex items-center gap-2 flex-wrap">
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Period:</span>
                {(['all', '7d', '30d', '90d', 'custom'] as DatePeriod[]).map(p => (
                  <button
                    key={p}
                    className={`btn btn-sm ${chartPeriod === p ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setChartPeriod(p)}
                    style={{ fontSize: '0.75rem', padding: '4px 12px' }}
                  >
                    {p === 'all' ? 'All' : p === 'custom' ? 'Custom' : p.toUpperCase()}
                  </button>
                ))}
                {chartPeriod === 'custom' && (
                  <div className="flex items-center gap-2" style={{ marginLeft: 'var(--spacing-2)' }}>
                    <input className="input" type="date" value={chartCustomRange.start || ''} onChange={e => setChartCustomRange(prev => ({ ...prev, start: e.target.value || null }))} style={{ fontSize: '0.75rem', padding: '4px 8px' }} />
                    <span style={{ color: 'var(--color-text-muted)' }}>to</span>
                    <input className="input" type="date" value={chartCustomRange.end || ''} onChange={e => setChartCustomRange(prev => ({ ...prev, end: e.target.value || null }))} style={{ fontSize: '0.75rem', padding: '4px 8px' }} />
                  </div>
                )}
              </div>
            </div>

            {/* Charts */}
            <div style={{ padding: 'var(--spacing-4)' }}>
              {/* Stock Chart */}
              <div style={{ marginBottom: 'var(--spacing-6)' }}>
                <h4 style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--color-text-muted)', marginBottom: 'var(--spacing-2)' }}>
                  Stock History ({filteredStock.length} data points)
                </h4>
                <div style={{ height: 280, background: 'var(--color-bg-subtle)', borderRadius: 'var(--radius-md)', padding: 'var(--spacing-3)', border: '1px solid var(--color-border-default)' }}>
                  {filteredStock.length > 0 ? (
                    <Line
                      data={{
                        labels: filteredStock.map((h: any) => new Date(h.timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })),
                        datasets: [{
                          label: 'Stock',
                          data: filteredStock.map((h: any) => h.quantity),
                          borderColor: '#818cf8',
                          backgroundColor: 'rgba(129, 140, 248, 0.12)',
                          fill: true, tension: 0.4, borderWidth: 2,
                          pointRadius: filteredStock.length > 80 ? 0 : 2,
                          pointHoverRadius: 6,
                          pointHoverBackgroundColor: '#818cf8',
                          pointHoverBorderColor: '#fff',
                          pointHoverBorderWidth: 2,
                        }],
                      }}
                      options={{
                        responsive: true, maintainAspectRatio: false,
                        animation: { duration: 1000, easing: 'easeOutQuart' },
                        interaction: { mode: 'index', intersect: false },
                        plugins: {
                          legend: { display: false },
                          tooltip: {
                            backgroundColor: 'rgba(15, 23, 42, 0.9)',
                            titleColor: '#f9fafb', bodyColor: '#f9fafb',
                            padding: 12, cornerRadius: 8, displayColors: false,
                            callbacks: { label: (ctx: any) => `Stock: ${ctx.parsed.y?.toLocaleString()} units` },
                          },
                        },
                        scales: {
                          x: { grid: { color: 'rgba(148,163,184,0.06)' }, ticks: { color: '#334155', maxRotation: 0, maxTicksLimit: 10, font: { size: 11 } } },
                          y: { grid: { color: 'rgba(148,163,184,0.06)' }, ticks: { color: '#334155', font: { size: 11 } } },
                        },
                      }}
                    />
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                      <p className="text-sm text-muted">No stock history for selected period</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Price Chart */}
              <div>
                <h4 style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--color-text-muted)', marginBottom: 'var(--spacing-2)' }}>
                  Price History ({filteredPrice.length} data points)
                </h4>
                <div style={{ height: 280, background: 'var(--color-bg-subtle)', borderRadius: 'var(--radius-md)', padding: 'var(--spacing-3)', border: '1px solid var(--color-border-default)' }}>
                  {filteredPrice.length > 0 ? (
                    <Line
                      data={{
                        labels: filteredPrice.map((h: any) => new Date(h.timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })),
                        datasets: [{
                          label: 'Price',
                          data: filteredPrice.map((h: any) => h.value),
                          borderColor: '#34d399',
                          backgroundColor: 'rgba(52, 211, 153, 0.12)',
                          fill: true, tension: 0.4, borderWidth: 2,
                          pointRadius: filteredPrice.length > 80 ? 0 : 2,
                          pointHoverRadius: 6,
                          pointHoverBackgroundColor: '#34d399',
                          pointHoverBorderColor: '#fff',
                          pointHoverBorderWidth: 2,
                        }],
                      }}
                      options={{
                        responsive: true, maintainAspectRatio: false,
                        animation: { duration: 1000, easing: 'easeOutQuart' },
                        interaction: { mode: 'index', intersect: false },
                        plugins: {
                          legend: { display: false },
                          tooltip: {
                            backgroundColor: 'rgba(15, 23, 42, 0.9)',
                            titleColor: '#f9fafb', bodyColor: '#f9fafb',
                            padding: 12, cornerRadius: 8, displayColors: false,
                            callbacks: { label: (ctx: any) => `Price: ${ctx.parsed.y?.toFixed(2)} RON` },
                          },
                        },
                        scales: {
                          x: { grid: { color: 'rgba(148,163,184,0.06)' }, ticks: { color: '#334155', maxRotation: 0, maxTicksLimit: 10, font: { size: 11 } } },
                          y: { grid: { color: 'rgba(148,163,184,0.06)' }, ticks: { color: '#334155', font: { size: 11 } } },
                        },
                      }}
                    />
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                      <p className="text-sm text-muted">No price history for selected period</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
