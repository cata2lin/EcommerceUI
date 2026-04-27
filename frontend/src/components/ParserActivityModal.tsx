/**
 * ParserActivityModal — Health & activity log for a single parser.
 *
 * Shows: 24h price/stock measurement counters, 10-day per-day breakdown,
 * recent run logs, and aggregate health metrics (success rate, staleness).
 */
import { useEffect, useState } from 'react';
import { fetchParserActivity } from '../api';

interface Props {
  parserId: number;
  onClose: () => void;
}

interface ActivityData {
  parser: { id: number; name: string; category: string | null; total_products: number };
  last_24h: {
    price_entries: number;
    unique_products_priced: number;
    stock_entries: number;
    unique_products_stocked: number;
    last_price_ts: string | null;
    last_stock_ts: string | null;
    hours_since_last_price: number | null;
    hours_since_last_stock: number | null;
  };
  breakdown_10d: Array<{
    day: string;
    price_entries: number;
    unique_priced: number;
    stock_entries: number;
    unique_stocked: number;
  }>;
  recent_runs: Array<{
    id: number;
    status: string | null;
    started_at: string | null;
    finished_at: string | null;
    duration_seconds: number | null;
    products_found: number;
    products_parsed_success: number;
    products_parsed_failed: number;
    stock_entries_saved: number;
    price_entries_saved: number;
    error_message: string | null;
  }>;
  health: {
    runs_evaluated: number;
    success_count: number;
    error_count: number;
    success_rate_pct: number | null;
    avg_duration_seconds: number | null;
    stale_products_7d: number;
    stale_products_30d: number;
  };
}

function fmtTime(ts: string | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString();
}

function fmtAge(hours: number | null): string {
  if (hours == null) return '—';
  if (hours < 1) return `${Math.round(hours * 60)}m ago`;
  if (hours < 48) return `${hours.toFixed(1)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function fmtDuration(secs: number | null): string {
  if (secs == null) return '—';
  if (secs < 60) return `${secs.toFixed(0)}s`;
  return `${(secs / 60).toFixed(1)}m`;
}

function statusBadge(status: string | null): { cls: string; label: string } {
  if (!status) return { cls: 'badge-neutral', label: '—' };
  const s = status.toLowerCase();
  if (s === 'ok' || s === 'success' || s === 'completed') return { cls: 'badge-healthy', label: 'OK' };
  if (s === 'error' || s === 'failed') return { cls: 'badge-error', label: 'Error' };
  if (s === 'running') return { cls: 'badge-info', label: 'Running' };
  return { cls: 'badge-warning', label: status };
}

/** Health-rate color (green/amber/red). */
function rateColor(pct: number | null): string {
  if (pct == null) return 'var(--color-text-muted)';
  if (pct >= 95) return 'var(--color-emerald-400)';
  if (pct >= 80) return 'var(--color-amber-400)';
  return 'var(--color-red-400)';
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{
      padding: 'var(--spacing-3)',
      background: 'var(--color-bg-subtle)',
      borderRadius: 6,
      flex: 1,
      minWidth: 130,
    }}>
      <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </div>
      <div style={{ fontSize: '1.4rem', fontWeight: 700, marginTop: 4, fontFamily: 'var(--font-mono)' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export default function ParserActivityModal({ parserId, onClose }: Props) {
  const [data, setData] = useState<ActivityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetchParserActivity(parserId)
      .then(res => setData(res.data))
      .catch(e => setError(e?.response?.data?.detail || 'Failed to load activity'))
      .finally(() => setLoading(false));
  }, [parserId]);

  // ESC to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Compute max for sparkline-style bars in breakdown
  const maxStock = data ? Math.max(1, ...data.breakdown_10d.map(d => d.stock_entries)) : 1;
  const maxPrice = data ? Math.max(1, ...data.breakdown_10d.map(d => d.price_entries)) : 1;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 'var(--spacing-4)',
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ width: '100%', maxWidth: 980, maxHeight: '92vh', overflow: 'auto', padding: 0 }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 2,
          background: 'var(--color-bg-default)', borderBottom: '1px solid var(--color-border-default)',
          padding: 'var(--spacing-4)', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>
              📊 Parser Activity Log {data ? `— ${data.parser.name}` : ''}
            </h3>
            {data?.parser.category && (
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                {data.parser.category} · {data.parser.total_products.toLocaleString()} products
              </div>
            )}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕ Close</button>
        </div>

        <div style={{ padding: 'var(--spacing-4)' }}>
          {loading && <div style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-muted)' }}>Loading activity…</div>}
          {error && <div style={{ padding: 16, color: 'var(--color-red-400)' }}>⚠ {error}</div>}

          {data && (
            <>
              {/* ─── Last 24h summary ─── */}
              <section style={{ marginBottom: 'var(--spacing-5)' }}>
                <h4 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 'var(--spacing-3)', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Last 24 hours
                </h4>
                <div style={{ display: 'flex', gap: 'var(--spacing-3)', flexWrap: 'wrap' }}>
                  <StatCard
                    label="Price Entries"
                    value={data.last_24h.price_entries.toLocaleString()}
                    sub={`${data.last_24h.unique_products_priced.toLocaleString()} unique products`}
                  />
                  <StatCard
                    label="Stock Entries"
                    value={data.last_24h.stock_entries.toLocaleString()}
                    sub={`${data.last_24h.unique_products_stocked.toLocaleString()} unique products`}
                  />
                  <StatCard
                    label="Coverage 24h"
                    value={data.parser.total_products > 0
                      ? `${((data.last_24h.unique_products_stocked / data.parser.total_products) * 100).toFixed(1)}%`
                      : '—'}
                    sub={`${data.last_24h.unique_products_stocked.toLocaleString()} / ${data.parser.total_products.toLocaleString()}`}
                  />
                  <StatCard
                    label="Last Stock"
                    value={fmtAge(data.last_24h.hours_since_last_stock)}
                    sub={fmtTime(data.last_24h.last_stock_ts)}
                  />
                  <StatCard
                    label="Last Price"
                    value={fmtAge(data.last_24h.hours_since_last_price)}
                    sub={fmtTime(data.last_24h.last_price_ts)}
                  />
                </div>
              </section>

              {/* ─── 10-day breakdown ─── */}
              <section style={{ marginBottom: 'var(--spacing-5)' }}>
                <h4 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 'var(--spacing-3)', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  10-Day Breakdown
                </h4>
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table" style={{ width: '100%' }}>
                    <thead>
                      <tr>
                        <th>Day</th>
                        <th style={{ textAlign: 'right' }}>Stock entries</th>
                        <th style={{ textAlign: 'right' }}>Unique products (stock)</th>
                        <th>Stock activity</th>
                        <th style={{ textAlign: 'right' }}>Price entries</th>
                        <th style={{ textAlign: 'right' }}>Unique products (price)</th>
                        <th>Price activity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.breakdown_10d.map(d => (
                        <tr key={d.day}>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>{d.day}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{d.stock_entries.toLocaleString()}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{d.unique_stocked.toLocaleString()}</td>
                          <td style={{ minWidth: 80 }}>
                            <div style={{ height: 6, background: 'rgba(148,163,184,0.1)', borderRadius: 3, overflow: 'hidden' }}>
                              <div style={{
                                width: `${(d.stock_entries / maxStock) * 100}%`,
                                height: '100%',
                                background: d.stock_entries > 0 ? 'var(--color-emerald-400)' : 'transparent',
                              }} />
                            </div>
                          </td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{d.price_entries.toLocaleString()}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{d.unique_priced.toLocaleString()}</td>
                          <td style={{ minWidth: 80 }}>
                            <div style={{ height: 6, background: 'rgba(148,163,184,0.1)', borderRadius: 3, overflow: 'hidden' }}>
                              <div style={{
                                width: `${(d.price_entries / maxPrice) * 100}%`,
                                height: '100%',
                                background: d.price_entries > 0 ? 'var(--color-amber-400)' : 'transparent',
                              }} />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* ─── Health metrics ─── */}
              <section style={{ marginBottom: 'var(--spacing-5)' }}>
                <h4 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 'var(--spacing-3)', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Health (last {data.health.runs_evaluated} runs)
                </h4>
                <div style={{ display: 'flex', gap: 'var(--spacing-3)', flexWrap: 'wrap' }}>
                  <StatCard
                    label="Success Rate"
                    value={data.health.success_rate_pct != null ? `${data.health.success_rate_pct}%` : '—'}
                    sub={`${data.health.success_count} ok · ${data.health.error_count} err`}
                  />
                  <StatCard
                    label="Avg Duration"
                    value={fmtDuration(data.health.avg_duration_seconds)}
                  />
                  <StatCard
                    label="Stale > 7d"
                    value={data.health.stale_products_7d.toLocaleString()}
                    sub={data.parser.total_products > 0
                      ? `${((data.health.stale_products_7d / data.parser.total_products) * 100).toFixed(1)}% of catalog`
                      : ''}
                  />
                  <StatCard
                    label="Stale > 30d"
                    value={data.health.stale_products_30d.toLocaleString()}
                    sub={data.parser.total_products > 0
                      ? `${((data.health.stale_products_30d / data.parser.total_products) * 100).toFixed(1)}% of catalog`
                      : ''}
                  />
                </div>
                {data.health.success_rate_pct != null && (
                  <div style={{ marginTop: 'var(--spacing-3)', height: 6, background: 'rgba(148,163,184,0.1)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{
                      width: `${data.health.success_rate_pct}%`,
                      height: '100%',
                      background: rateColor(data.health.success_rate_pct),
                      transition: 'width var(--transition-slow)',
                    }} />
                  </div>
                )}
              </section>

              {/* ─── Recent run logs ─── */}
              <section>
                <h4 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 'var(--spacing-3)', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Recent Runs
                </h4>
                {data.recent_runs.length === 0 ? (
                  <div style={{ padding: 16, color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>No run logs.</div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="data-table" style={{ width: '100%' }}>
                      <thead>
                        <tr>
                          <th>Status</th>
                          <th>Started</th>
                          <th>Duration</th>
                          <th style={{ textAlign: 'right' }}>Found</th>
                          <th style={{ textAlign: 'right' }}>OK</th>
                          <th style={{ textAlign: 'right' }}>Failed</th>
                          <th style={{ textAlign: 'right' }}>Stock saved</th>
                          <th style={{ textAlign: 'right' }}>Price saved</th>
                          <th>Error</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.recent_runs.map(r => {
                          const b = statusBadge(r.status);
                          return (
                            <tr key={r.id}>
                              <td><span className={`badge ${b.cls}`}>{b.label}</span></td>
                              <td style={{ fontSize: '0.78rem' }}>{fmtTime(r.started_at)}</td>
                              <td style={{ fontFamily: 'var(--font-mono)' }}>{fmtDuration(r.duration_seconds)}</td>
                              <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{r.products_found.toLocaleString()}</td>
                              <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--color-emerald-400)' }}>{r.products_parsed_success.toLocaleString()}</td>
                              <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: r.products_parsed_failed > 0 ? 'var(--color-red-400)' : undefined }}>
                                {r.products_parsed_failed.toLocaleString()}
                              </td>
                              <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{r.stock_entries_saved.toLocaleString()}</td>
                              <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{r.price_entries_saved.toLocaleString()}</td>
                              <td style={{ fontSize: '0.7rem', color: 'var(--color-red-400)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.error_message || ''}>
                                {r.error_message || ''}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
