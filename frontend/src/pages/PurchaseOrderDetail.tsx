/**
 * PurchaseOrderDetail — edit a PO's lines, approve/cancel, send to TOM, view sync log.
 */
import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  fetchPurchaseOrder, fetchPurchaseOrderSyncLogs,
  updatePurchaseOrder, deletePurchaseOrderItem,
  approvePurchaseOrder, cancelPurchaseOrder,
  sendPurchaseOrderToTom, refreshPurchaseOrderFromTom,
  deletePurchaseOrder,
} from '../api';

interface POItem {
  id: number;
  product_id: number;
  product_title: string;
  sku: string | null;
  barcode: string | null;
  image_url: string | null;
  quantity: number;
  unit_cost_usd: number | null;
  line_cost_usd: number | null;
  priority: string;
  notes: string | null;
  tom_status: string | null;
  tom_received_qty: number | null;
  tom_shipped_qty: number | null;
}

interface PO {
  id: number;
  number: number;
  display_number: string;
  title: string | null;
  priority: string;
  status: string;
  notes: string | null;
  total_cost_usd: number | null;
  items: POItem[];
  created_at: string;
  approved_at: string | null;
  cancelled_at: string | null;
  tom_number: string | null;
  tom_po_id: string | null;
  tom_status: string | null;
  tom_sent_at: string | null;
  tom_refreshed_at: string | null;
  tom_supplier_name: string | null;
  tom_supplier_url: string | null;
  tom_shipment_code: string | null;
  tom_shipment_mode: string | null;
  tom_shipment_eta: string | null;
}

interface SyncLog {
  id: number;
  direction: string;
  action: string;
  status: string;
  http_status: number | null;
  items_affected: number;
  error_message: string | null;
  details: any;
  created_at: string;
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    DRAFT:       { bg: '#F3F4F6', fg: '#6B7280', label: 'Draft' },
    APPROVED:    { bg: '#DBEAFE', fg: '#1E40AF', label: 'Approved' },
    SENT_TO_TOM: { bg: '#D1FAE5', fg: '#065F46', label: 'Sent to TOM' },
    CANCELLED:   { bg: '#FEE2E2', fg: '#991B1B', label: 'Cancelled' },
  };
  const s = map[status] || map.DRAFT;
  return (
    <span style={{
      display: 'inline-block', background: s.bg, color: s.fg, padding: '4px 10px',
      borderRadius: 12, fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.02em',
    }}>{s.label}</span>
  );
}

export default function PurchaseOrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const poId = Number(id);

  const [po, setPo] = useState<PO | null>(null);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [priority, setPriority] = useState('STANDARD');
  const [items, setItems] = useState<POItem[]>([]);
  const [selectedLogId, setSelectedLogId] = useState<number | null>(null);
  const [confirmDeleteItem, setConfirmDeleteItem] = useState<POItem | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchPurchaseOrder(poId);
      setPo(res.data);
      setTitle(res.data.title || '');
      setNotes(res.data.notes || '');
      setPriority(res.data.priority);
      setItems(res.data.items);
      const logs = await fetchPurchaseOrderSyncLogs(poId);
      setLogs(logs.data.logs);
    } finally {
      setLoading(false);
    }
  }, [poId]);

  useEffect(() => { load(); }, [load]);

  const isDraft = po?.status === 'DRAFT';
  const isApproved = po?.status === 'APPROVED';
  const isSent = po?.status === 'SENT_TO_TOM';
  const isCancelled = po?.status === 'CANCELLED';

  const updateItemLocal = (idx: number, patch: Partial<POItem>) => {
    setItems(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  };

  const totalCost = items.reduce((s, it) => s + (it.quantity || 0) * (it.unit_cost_usd || 0), 0);

  const handleSave = async () => {
    if (!po) return;
    setSaving(true);
    try {
      const payload: any = { title: title || null, notes: notes || null, priority };
      if (isDraft) {
        payload.items = items.map(it => ({
          id: it.id,
          product_id: it.product_id,
          product_title: it.product_title,
          quantity: it.quantity,
          unit_cost_usd: it.unit_cost_usd,
          priority: it.priority,
          notes: it.notes,
        }));
      }
      const res = await updatePurchaseOrder(po.id, payload);
      setPo(res.data);
      setItems(res.data.items);
    } catch (e: any) {
      alert(e?.response?.data?.detail || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const requestRemoveItem = (item: POItem) => {
    setConfirmDeleteItem(item);
  };

  const handleConfirmRemoveItem = async () => {
    if (!po || !confirmDeleteItem) return;
    const item = confirmDeleteItem;
    setDeletingItemId(item.id);
    try {
      await deletePurchaseOrderItem(po.id, item.id);
      // Optimistic local removal — no full reload, preserves scroll position.
      setItems(prev => prev.filter(x => x.id !== item.id));
      setConfirmDeleteItem(null);
    } catch (e: any) {
      alert(e?.response?.data?.detail || 'Failed to remove');
    } finally {
      setDeletingItemId(null);
    }
  };

  const handleApprove = async () => {
    if (!po) return;
    if (!confirm('Approve this PO? You will then be able to send it to TOM.')) return;
    try { await approvePurchaseOrder(po.id); await load(); }
    catch (e: any) { alert(e?.response?.data?.detail || 'Approve failed'); }
  };
  const handleCancel = async () => {
    if (!po) return;
    if (!confirm('Cancel this PO? All product locks will be released.')) return;
    try { await cancelPurchaseOrder(po.id); await load(); }
    catch (e: any) { alert(e?.response?.data?.detail || 'Cancel failed'); }
  };
  const handleDelete = async () => {
    if (!po) return;
    if (!confirm('Delete this DRAFT PO permanently? All product locks will be released.')) return;
    try {
      await deletePurchaseOrder(po.id);
      navigate('/purchase-orders');
    } catch (e: any) { alert(e?.response?.data?.detail || 'Delete failed'); }
  };
  const handleSendTom = async () => {
    if (!po) return;
    // Client-side guard: every line must have an SKU before sending.
    const missingSku = items.filter(it => !(it.sku || '').trim());
    if (missingSku.length > 0) {
      const sample = missingSku.slice(0, 5).map(it => it.product_title || `#${it.id}`).join('\n• ');
      const suffix = missingSku.length > 5 ? `\n… and ${missingSku.length - 5} more` : '';
      alert(
        `Cannot send to TOM — ${missingSku.length} line(s) are missing an SKU:\n\n• ${sample}${suffix}\n\nAdd SKUs to every product before sending.`
      );
      return;
    }
    if (!confirm(`Send ${po.display_number} to TOM?`)) return;
    try {
      const res = await sendPurchaseOrderToTom(po.id);
      if (!res.data.ok) alert(`TOM rejected: ${res.data.error_message}`);
      await load();
    } catch (e: any) { alert(e?.response?.data?.detail || 'Send failed'); }
  };
  const handleRefreshTom = async () => {
    if (!po) return;
    try { await refreshPurchaseOrderFromTom(po.id); await load(); }
    catch (e: any) { alert(e?.response?.data?.detail || 'Refresh failed'); }
  };

  if (loading) return <div className="animate-fade-in"><div className="skeleton skeleton-text" /></div>;
  if (!po) return <div>PO not found</div>;

  const fmtUsd = (v: number | null | undefined) => v == null ? '—' : `$${Number(v).toFixed(2)}`;

  const thStyle: React.CSSProperties = {
    padding: '8px 10px', fontSize: '0.7rem', fontWeight: 600, textAlign: 'left',
    background: 'var(--color-bg-subtle)', borderBottom: '2px solid var(--color-border-default)', whiteSpace: 'nowrap',
  };
  const tdStyle: React.CSSProperties = {
    padding: '8px 10px', fontSize: '0.8rem', borderBottom: '1px solid var(--color-border-default)', verticalAlign: 'middle',
  };

  const selectedLog = logs.find(l => l.id === selectedLogId);

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div className="flex items-center gap-4">
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/purchase-orders')}>← Back</button>
          <h1 style={{ fontFamily: 'var(--font-mono)' }}>{po.display_number}</h1>
          <StatusPill status={po.status} />
          {po.tom_number && (
            <span style={{
              background: '#D1FAE5', color: '#065F46', padding: '4px 10px', borderRadius: 12,
              fontSize: '0.7rem', fontWeight: 700, fontFamily: 'var(--font-mono)',
            }}>TOM: {po.tom_number}{po.tom_status ? ` · ${po.tom_status}` : ''}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isDraft && <button className="btn btn-ghost btn-sm" onClick={handleDelete} style={{ color: '#B91C1C' }}>🗑 Delete</button>}
          {isDraft && <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : '💾 Save'}</button>}
          {isDraft && items.length > 0 && <button className="btn btn-success btn-sm" onClick={handleApprove}>✓ Approve</button>}
          {(isApproved || isSent) && <button className="btn btn-primary btn-sm" onClick={handleSendTom}>🚀 {isSent ? 'Resend to TOM' : 'Send to TOM'}</button>}
          {isSent && <button className="btn btn-ghost btn-sm" onClick={handleRefreshTom}>🔄 Refresh from TOM</button>}
          {!isCancelled && !isDraft && <button className="btn btn-ghost btn-sm" onClick={handleCancel} style={{ color: '#B91C1C' }}>✕ Cancel PO</button>}
          {isDraft && <button className="btn btn-ghost btn-sm" onClick={handleCancel} style={{ color: '#B91C1C' }}>✕ Cancel</button>}
        </div>
      </div>

      {/* Header fields */}
      <div className="card" style={{ padding: 'var(--spacing-4)', marginBottom: 'var(--spacing-4)' }}>
        <div className="flex items-start gap-4" style={{ flexWrap: 'wrap' }}>
          <div style={{ flex: 2, minWidth: 240 }}>
            <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-text-muted)' }}>Title</label>
            <input className="input" value={title} onChange={e => setTitle(e.target.value)} disabled={!isDraft}
              style={{ width: '100%', marginTop: 4 }} placeholder="Optional title…" />
          </div>
          <div style={{ flex: 1, minWidth: 140 }}>
            <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-text-muted)' }}>Priority</label>
            <select className="select" value={priority} onChange={e => setPriority(e.target.value)} disabled={!isDraft}
              style={{ width: '100%', marginTop: 4 }}>
              <option value="STANDARD">Standard</option>
              <option value="HIGH">⚡ High</option>
            </select>
          </div>
          <div style={{ flex: 3, minWidth: 240 }}>
            <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-text-muted)' }}>Notes</label>
            <textarea className="input" value={notes} onChange={e => setNotes(e.target.value)} disabled={!isDraft}
              rows={2} style={{ width: '100%', marginTop: 4, resize: 'vertical' }} />
          </div>
        </div>
        {(po.tom_supplier_name || po.tom_shipment_code) && (
          <div style={{ marginTop: 'var(--spacing-3)', padding: 'var(--spacing-3)', background: 'var(--color-bg-subtle)', borderRadius: 6, fontSize: '0.75rem' }}>
            <strong>TOM:</strong>{' '}
            {po.tom_supplier_name && <span>Supplier: <a href={po.tom_supplier_url || '#'} target="_blank" rel="noopener">{po.tom_supplier_name}</a>{' · '}</span>}
            {po.tom_shipment_code && <span>Shipment: {po.tom_shipment_code} ({po.tom_shipment_mode || '—'}){po.tom_shipment_eta ? ` · ETA ${new Date(po.tom_shipment_eta).toLocaleDateString()}` : ''}</span>}
          </div>
        )}
      </div>

      {/* Items */}
      <div className="card" style={{ padding: 0, marginBottom: 'var(--spacing-4)', overflow: 'hidden' }}>
        <div style={{ padding: 'var(--spacing-3) var(--spacing-4)', borderBottom: '1px solid var(--color-border-default)', display: 'flex', justifyContent: 'space-between' }}>
          <strong>Items ({items.length})</strong>
          <strong style={{ fontFamily: 'var(--font-mono)' }}>Total: {fmtUsd(isDraft ? totalCost : po.total_cost_usd)}</strong>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: 50 }}></th>
              <th style={thStyle}>Product</th>
              <th style={thStyle}>SKU</th>
              <th style={{ ...thStyle, width: 100, textAlign: 'right' }}>Qty</th>
              <th style={{ ...thStyle, width: 120, textAlign: 'right' }}>Unit $</th>
              <th style={{ ...thStyle, width: 120, textAlign: 'right' }}>Line $</th>
              <th style={{ ...thStyle, width: 120 }}>Priority</th>
              {isSent && <th style={thStyle}>TOM</th>}
              {isDraft && <th style={{ ...thStyle, width: 40 }}></th>}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={isDraft ? 8 : 7} style={{ ...tdStyle, textAlign: 'center', color: 'var(--color-text-muted)', padding: 'var(--spacing-8)' }}>
                No items yet. Add products from Approved Items or the product detail page.
              </td></tr>
            ) : items.map((it, idx) => (
              <tr key={it.id}>
                <td style={tdStyle}>
                  <div style={{ width: 40, height: 40, background: 'var(--color-bg-subtle)', borderRadius: 4, overflow: 'hidden' }}>
                    {it.image_url ? <img src={it.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
                  </div>
                </td>
                <td style={tdStyle}>
                  <Link to={`/product/${it.product_id}/pipeline-details`} style={{ fontWeight: 500 }}>{it.product_title}</Link>
                </td>
                <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>{it.sku || '—'}</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  {isDraft ? (
                    <input type="number" className="input" value={it.quantity} min={1}
                      onChange={e => updateItemLocal(idx, { quantity: parseInt(e.target.value || '1', 10) })}
                      style={{ width: 80, textAlign: 'right', fontFamily: 'var(--font-mono)' }} />
                  ) : <span style={{ fontFamily: 'var(--font-mono)' }}>{it.quantity}</span>}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  {isDraft ? (
                    <input type="number" step="0.01" className="input" value={it.unit_cost_usd ?? ''}
                      onChange={e => updateItemLocal(idx, { unit_cost_usd: e.target.value ? parseFloat(e.target.value) : null })}
                      style={{ width: 100, textAlign: 'right', fontFamily: 'var(--font-mono)' }} />
                  ) : <span style={{ fontFamily: 'var(--font-mono)' }}>{fmtUsd(it.unit_cost_usd)}</span>}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                  {fmtUsd((it.quantity || 0) * (it.unit_cost_usd || 0))}
                </td>
                <td style={tdStyle}>
                  {isDraft ? (
                    <select className="select" value={it.priority}
                      onChange={e => updateItemLocal(idx, { priority: e.target.value })}
                      style={{ width: 110 }}>
                      <option value="STANDARD">Standard</option>
                      <option value="HIGH">⚡ High</option>
                    </select>
                  ) : it.priority === 'HIGH' ? <span style={{ color: '#B91C1C', fontWeight: 600 }}>⚡ HIGH</span> : <span style={{ color: 'var(--color-text-muted)' }}>Standard</span>}
                </td>
                {isSent && (
                  <td style={{ ...tdStyle, fontSize: '0.7rem' }}>
                    {it.tom_status || '—'}
                    {it.tom_received_qty != null && <div style={{ color: 'var(--color-text-muted)' }}>Recv: {it.tom_received_qty}/{it.quantity}</div>}
                  </td>
                )}
                {isDraft && (
                  <td style={tdStyle}>
                    <button className="btn btn-ghost btn-sm" onClick={() => requestRemoveItem(it)} title="Remove">✕</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Sync Log */}
      <div className="card" style={{ padding: 0, marginBottom: 'var(--spacing-4)', overflow: 'hidden' }}>
        <div style={{ padding: 'var(--spacing-3) var(--spacing-4)', borderBottom: '1px solid var(--color-border-default)' }}>
          <strong>TOM Sync Log ({logs.length})</strong>
        </div>
        {logs.length === 0 ? (
          <div style={{ padding: 'var(--spacing-6)', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>
            No sync attempts yet.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>When</th>
                <th style={thStyle}>Action</th>
                <th style={thStyle}>Dir</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>HTTP</th>
                <th style={thStyle}>Items</th>
                <th style={thStyle}>Error</th>
                <th style={{ ...thStyle, width: 60 }}></th>
              </tr>
            </thead>
            <tbody>
              {logs.map(lg => (
                <tr key={lg.id}>
                  <td style={{ ...tdStyle, fontSize: '0.7rem' }}>{new Date(lg.created_at).toLocaleString()}</td>
                  <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>{lg.action}</td>
                  <td style={{ ...tdStyle, fontSize: '0.7rem' }}>{lg.direction}</td>
                  <td style={{ ...tdStyle }}>
                    <span style={{
                      display: 'inline-block', padding: '2px 6px', borderRadius: 8, fontSize: '0.65rem', fontWeight: 700,
                      background: lg.status === 'SUCCESS' ? '#D1FAE5' : '#FEE2E2',
                      color: lg.status === 'SUCCESS' ? '#065F46' : '#991B1B',
                    }}>{lg.status}</span>
                  </td>
                  <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>{lg.http_status ?? '—'}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{lg.items_affected}</td>
                  <td style={{ ...tdStyle, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '0.7rem', color: '#991B1B' }}>{lg.error_message || ''}</td>
                  <td style={tdStyle}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setSelectedLogId(lg.id === selectedLogId ? null : lg.id)}>{lg.id === selectedLogId ? 'Hide' : 'View'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {selectedLog && (
          <div style={{ padding: 'var(--spacing-3) var(--spacing-4)', borderTop: '1px solid var(--color-border-default)', background: 'var(--color-bg-subtle)' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, marginBottom: 4 }}>Details</div>
            <pre style={{ fontSize: '0.65rem', maxHeight: 400, overflow: 'auto', background: '#fff', padding: 8, borderRadius: 4, border: '1px solid var(--color-border-default)' }}>
{JSON.stringify({ details: selectedLog.details }, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {confirmDeleteItem && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => deletingItemId === null && setConfirmDeleteItem(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: 'var(--spacing-4)',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--color-bg-default, #fff)',
              borderRadius: 8,
              boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
              maxWidth: 460, width: '100%',
              padding: 'var(--spacing-5)',
            }}
          >
            <h3 style={{ margin: '0 0 var(--spacing-2)', fontSize: '1rem' }}>Remove product from PO?</h3>
            <p style={{ margin: '0 0 var(--spacing-3)', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
              The product will be unlinked from this PO.
            </p>
            <div style={{
              background: 'var(--color-bg-subtle)',
              border: '1px solid var(--color-border-default)',
              borderRadius: 6,
              padding: 'var(--spacing-3)',
              fontSize: '0.8rem',
              marginBottom: 'var(--spacing-4)',
              display: 'flex', gap: 10, alignItems: 'center',
            }}>
              {confirmDeleteItem.image_url && (
                <img src={confirmDeleteItem.image_url} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {confirmDeleteItem.product_title}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                  #{confirmDeleteItem.product_id} · qty {confirmDeleteItem.quantity}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setConfirmDeleteItem(null)}
                disabled={deletingItemId !== null}
              >Cancel</button>
              <button
                className="btn btn-sm"
                onClick={handleConfirmRemoveItem}
                disabled={deletingItemId !== null}
                style={{ background: '#B91C1C', color: '#fff' }}
              >{deletingItemId !== null ? 'Removing…' : 'Remove'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
