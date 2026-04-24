/**
 * AddToPoModal — choose an existing DRAFT PO or create a new one,
 * setting quantity/unit cost for the current product.
 */
import { useEffect, useState } from 'react';
import {
  fetchPurchaseOrders, addItemToPurchaseOrder, createPurchaseOrder,
} from '../api';

interface Product {
  id: number;
  title: string;
  image: string | null;
  sku: string | null;
  suggested_qty: number | null;
  unit_cost_usd: number | null;
}

interface DraftPo {
  id: number;
  display_number: string;
  title: string | null;
  priority: string;
  items_count: number;
  total_cost_usd: number | null;
}

interface Props {
  product: Product;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddToPoModal({ product, onClose, onSuccess }: Props) {
  const [drafts, setDrafts] = useState<DraftPo[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [selectedPoId, setSelectedPoId] = useState<number | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState('STANDARD');
  const [quantity, setQuantity] = useState<number>(product.suggested_qty || 1);
  const [unitCost, setUnitCost] = useState<number | null>(product.unit_cost_usd ?? null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchPurchaseOrders({ status: 'DRAFT', limit: 50 })
      .then(res => {
        const list = res.data.purchase_orders || [];
        setDrafts(list);
        if (list.length === 0) setMode('new');
        else setSelectedPoId(list[0].id);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async () => {
    if (!quantity || quantity < 1) { alert('Quantity must be ≥ 1'); return; }
    setSubmitting(true);
    try {
      if (mode === 'existing' && selectedPoId) {
        await addItemToPurchaseOrder(selectedPoId, {
          product_id: product.id,
          quantity,
          unit_cost_usd: unitCost,
        });
      } else {
        await createPurchaseOrder({
          title: newTitle || null,
          priority: newPriority,
          items: [{
            product_id: product.id,
            quantity,
            unit_cost_usd: unitCost,
          }],
        });
      }
      onSuccess();
    } catch (e: any) {
      alert(e?.response?.data?.detail || 'Failed to add to PO');
    } finally {
      setSubmitting(false);
    }
  };

  const lineTotal = (quantity || 0) * (unitCost || 0);

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 'var(--spacing-4)',
    }} onClick={onClose}>
      <div className="card" style={{ width: '100%', maxWidth: 640, maxHeight: '90vh', overflow: 'auto', padding: 0 }} onClick={e => e.stopPropagation()}>
        <div style={{
          position: 'sticky', top: 0, background: 'var(--color-bg-default)', borderBottom: '1px solid var(--color-border-default)',
          padding: 'var(--spacing-4)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 1,
        }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>📦 Add to Purchase Order</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕ Close</button>
        </div>

        <div style={{ padding: 'var(--spacing-4)' }}>
          {/* Product summary */}
          <div className="flex items-center gap-3" style={{ padding: 'var(--spacing-3)', background: 'var(--color-bg-subtle)', borderRadius: 6, marginBottom: 'var(--spacing-4)' }}>
            <div style={{ width: 56, height: 56, background: '#fff', borderRadius: 4, overflow: 'hidden', flexShrink: 0 }}>
              {product.image && <img src={product.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{product.title}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>SKU: {product.sku || '—'}</div>
            </div>
          </div>

          {/* Mode toggle */}
          <div className="flex gap-2" style={{ marginBottom: 'var(--spacing-4)' }}>
            <button
              className={`btn btn-sm ${mode === 'existing' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setMode('existing')}
              disabled={drafts.length === 0}
            >Existing DRAFT PO {drafts.length > 0 && `(${drafts.length})`}</button>
            <button
              className={`btn btn-sm ${mode === 'new' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setMode('new')}
            >+ Create New PO</button>
          </div>

          {mode === 'existing' && (
            <div style={{ marginBottom: 'var(--spacing-4)' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)' }}>Select a DRAFT Purchase Order</label>
              {loading ? (
                <div style={{ padding: 12, color: 'var(--color-text-muted)' }}>Loading…</div>
              ) : drafts.length === 0 ? (
                <div style={{ padding: 12, color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>No DRAFT POs. Create a new one →</div>
              ) : (
                <select className="select" value={selectedPoId ?? ''} onChange={e => setSelectedPoId(Number(e.target.value))} style={{ width: '100%', marginTop: 4 }}>
                  {drafts.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.display_number} · {d.title || 'Untitled'} · {d.items_count} items · ${(d.total_cost_usd || 0).toFixed(2)}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {mode === 'new' && (
            <div style={{ marginBottom: 'var(--spacing-4)', display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)' }}>PO Title (optional)</label>
                <input className="input" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="e.g. Q4 Restock" style={{ width: '100%', marginTop: 4 }} />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)' }}>Priority</label>
                <select className="select" value={newPriority} onChange={e => setNewPriority(e.target.value)} style={{ width: '100%', marginTop: 4 }}>
                  <option value="STANDARD">Standard</option>
                  <option value="HIGH">⚡ High</option>
                </select>
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, padding: 'var(--spacing-3)', background: 'var(--color-bg-subtle)', borderRadius: 6 }}>
            <div>
              <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-text-muted)' }}>Quantity</label>
              <input type="number" min={1} className="input" value={quantity} onChange={e => setQuantity(parseInt(e.target.value || '1', 10))}
                style={{ width: '100%', marginTop: 4, fontFamily: 'var(--font-mono)' }} />
            </div>
            <div>
              <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-text-muted)' }}>Unit Cost (USD)</label>
              <input type="number" step="0.01" className="input" value={unitCost ?? ''} onChange={e => setUnitCost(e.target.value ? parseFloat(e.target.value) : null)}
                style={{ width: '100%', marginTop: 4, fontFamily: 'var(--font-mono)' }} />
            </div>
            <div>
              <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-text-muted)' }}>Line Total</label>
              <div style={{ marginTop: 4, padding: '6px 10px', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                ${lineTotal.toFixed(2)}
              </div>
            </div>
          </div>
        </div>

        <div style={{
          position: 'sticky', bottom: 0, background: 'var(--color-bg-default)', borderTop: '1px solid var(--color-border-default)',
          padding: 'var(--spacing-3) var(--spacing-4)', display: 'flex', justifyContent: 'flex-end', gap: 8,
        }}>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={handleSubmit}
            disabled={submitting || (mode === 'existing' && !selectedPoId)}>
            {submitting ? 'Adding…' : (mode === 'existing' ? 'Add to PO' : 'Create PO')}
          </button>
        </div>
      </div>
    </div>
  );
}
