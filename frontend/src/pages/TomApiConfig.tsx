/**
 * TomApiConfig — UI to manage TOM API integration credentials stored in DB.
 * Mirrors the pattern from the user's reference screenshot:
 *   - top "Active configuration" read-only summary (DB or env-fallback)
 *   - editable form below with Save / Test connection / Clear buttons
 */
import { useEffect, useState } from 'react';
import {
  fetchTomConfig,
  updateTomConfig,
  clearTomSecret,
  clearTomConfig,
  testTomConnection,
} from '../api';

interface ActiveConfig {
  base_url: string;
  api_key_id: string;
  api_secret_masked: string;
  source_code: string;
  configured: boolean;
}

interface DbConfig {
  base_url: string;
  api_key_id: string;
  api_secret_masked: string;
  api_secret_set: boolean;
  source_code: string;
  updated_at: string | null;
}

interface EnvFallback {
  base_url: string;
  api_key_id: string;
  api_secret_set: boolean;
  source_code: string;
}

interface TestResult {
  ok: boolean;
  status: number;
  elapsed_ms: number;
  diagnosis: string;
  message: string;
  body: any;
}

const cardStyle: React.CSSProperties = {
  padding: 'var(--spacing-5)',
  marginBottom: 'var(--spacing-4)',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.7rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--color-text-muted)',
  marginBottom: 4,
};

const sourceTagStyle = (source: 'DB' | 'ENV' | 'EMPTY'): React.CSSProperties => ({
  display: 'inline-block',
  padding: '2px 6px',
  borderRadius: 4,
  fontSize: '0.65rem',
  fontWeight: 700,
  letterSpacing: '0.04em',
  background:
    source === 'DB'
      ? 'rgba(34, 197, 94, 0.18)'
      : source === 'ENV'
      ? 'rgba(59, 130, 246, 0.18)'
      : 'rgba(148, 163, 184, 0.18)',
  color:
    source === 'DB' ? '#16a34a' : source === 'ENV' ? '#3b82f6' : '#94a3b8',
  marginRight: 6,
});

export default function TomApiConfig() {
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<ActiveConfig | null>(null);
  const [dbCfg, setDbCfg] = useState<DbConfig | null>(null);
  const [envCfg, setEnvCfg] = useState<EnvFallback | null>(null);

  // Form state
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKeyId, setApiKeyId] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [sourceCode, setSourceCode] = useState('');
  const [showSecret, setShowSecret] = useState(false);

  // Action state
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const res = await fetchTomConfig();
      const d = res.data;
      setActive(d.active);
      setDbCfg(d.db);
      setEnvCfg(d.env_fallback);
      setBaseUrl(d.db.base_url || '');
      setApiKeyId(d.db.api_key_id || '');
      setSourceCode(d.db.source_code || '');
      setApiSecret(''); // never pre-populate the secret
    } catch (err: any) {
      setMessage({
        kind: 'err',
        text: 'Failed to load config: ' + (err?.response?.data?.detail || err.message),
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const body: any = {
        base_url: baseUrl.trim() || null,
        api_key_id: apiKeyId.trim() || null,
        source_code: sourceCode.trim() || null,
      };
      if (apiSecret.trim()) body.api_secret = apiSecret.trim();
      await updateTomConfig(body);
      setApiSecret('');
      setMessage({ kind: 'ok', text: 'Configuration saved.' });
      await loadConfig();
    } catch (err: any) {
      setMessage({
        kind: 'err',
        text: 'Save failed: ' + (err?.response?.data?.detail || err.message),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      // If user typed new credentials in the form, test those (without saving).
      // Otherwise test the active config.
      const overrides: any = {};
      if (baseUrl.trim()) overrides.base_url = baseUrl.trim();
      if (apiKeyId.trim()) overrides.api_key_id = apiKeyId.trim();
      if (sourceCode.trim()) overrides.source_code = sourceCode.trim();
      if (apiSecret.trim()) overrides.api_secret = apiSecret.trim();
      const res = await testTomConnection(
        Object.keys(overrides).length > 0 ? overrides : undefined,
      );
      setTestResult(res.data);
    } catch (err: any) {
      setTestResult({
        ok: false,
        status: 0,
        elapsed_ms: 0,
        diagnosis: 'request_failed',
        message: err?.response?.data?.detail || err.message || 'Request failed',
        body: {},
      });
    } finally {
      setTesting(false);
    }
  };

  const handleClearSecret = async () => {
    if (!confirm('Clear the saved API Secret?')) return;
    try {
      await clearTomSecret();
      setMessage({ kind: 'ok', text: 'API Secret cleared.' });
      await loadConfig();
    } catch (err: any) {
      setMessage({
        kind: 'err',
        text: 'Failed: ' + (err?.response?.data?.detail || err.message),
      });
    }
  };

  const handleClearAll = async () => {
    if (
      !confirm(
        'Clear ALL TOM API credentials from the database? Env fallback (if any) will still be used.',
      )
    )
      return;
    try {
      await clearTomConfig();
      setMessage({ kind: 'ok', text: 'All TOM API config cleared.' });
      await loadConfig();
    } catch (err: any) {
      setMessage({
        kind: 'err',
        text: 'Failed: ' + (err?.response?.data?.detail || err.message),
      });
    }
  };

  if (loading) {
    return (
      <div className="animate-fade-in">
        <div className="skeleton skeleton-heading" />
        <div className="card skeleton" style={{ height: 200 }} />
      </div>
    );
  }

  // Decide which source each active field came from
  const fieldSource = (
    field: 'base_url' | 'api_key_id' | 'api_secret' | 'source_code',
  ): 'DB' | 'ENV' | 'EMPTY' => {
    if (!active || !dbCfg || !envCfg) return 'EMPTY';
    const dbHas =
      field === 'api_secret' ? dbCfg.api_secret_set : !!(dbCfg as any)[field];
    if (dbHas) return 'DB';
    const envHas =
      field === 'api_secret' ? envCfg.api_secret_set : !!(envCfg as any)[field];
    if (envHas) return 'ENV';
    return 'EMPTY';
  };

  return (
    <div className="animate-fade-in" style={{ maxWidth: 960 }}>
      <div className="page-header">
        <h1>TOM API Config</h1>
      </div>

      <p style={{ color: 'var(--color-text-muted)', marginBottom: 'var(--spacing-5)' }}>
        Credentials for the TOM (centralized PO) integration. Values saved here take
        precedence over <code>TOM_*</code> environment variables. Leave fields empty to
        fall back to env.
      </p>

      {message && (
        <div
          className="card"
          style={{
            ...cardStyle,
            background:
              message.kind === 'ok'
                ? 'rgba(34, 197, 94, 0.10)'
                : 'rgba(239, 68, 68, 0.10)',
            border:
              message.kind === 'ok'
                ? '1px solid rgba(34,197,94,0.4)'
                : '1px solid rgba(239,68,68,0.4)',
          }}
        >
          {message.text}
        </div>
      )}

      {/* Active configuration */}
      <div className="card" style={cardStyle}>
        <h3 style={{ marginBottom: 'var(--spacing-4)' }}>Active configuration</h3>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 'var(--spacing-4)',
          }}
        >
          <div>
            <span style={labelStyle}>Base URL</span>
            <div>
              <span style={sourceTagStyle(fieldSource('base_url'))}>
                {fieldSource('base_url')}
              </span>
              <code>{active?.base_url || <em style={{ color: 'var(--color-text-muted)' }}>not set</em>}</code>
            </div>
          </div>
          <div>
            <span style={labelStyle}>API Key ID</span>
            <div>
              <span style={sourceTagStyle(fieldSource('api_key_id'))}>
                {fieldSource('api_key_id')}
              </span>
              <code>{active?.api_key_id || <em style={{ color: 'var(--color-text-muted)' }}>not set</em>}</code>
            </div>
          </div>
          <div>
            <span style={labelStyle}>API Secret</span>
            <div>
              <span style={sourceTagStyle(fieldSource('api_secret'))}>
                {fieldSource('api_secret')}
              </span>
              <code>
                {active?.api_secret_masked || (
                  <em style={{ color: 'var(--color-text-muted)' }}>not set</em>
                )}
              </code>
            </div>
          </div>
          <div>
            <span style={labelStyle}>Source Code</span>
            <div>
              <span style={sourceTagStyle(fieldSource('source_code'))}>
                {fieldSource('source_code')}
              </span>
              <code>{active?.source_code || <em style={{ color: 'var(--color-text-muted)' }}>not set</em>}</code>
            </div>
          </div>
        </div>
        <div
          style={{
            marginTop: 'var(--spacing-4)',
            paddingTop: 'var(--spacing-3)',
            borderTop: '1px solid var(--color-border)',
            fontSize: '0.85rem',
          }}
        >
          Status:{' '}
          <strong style={{ color: active?.configured ? '#16a34a' : '#ef4444' }}>
            {active?.configured ? 'Configured ✓' : 'Not configured ✗'}
          </strong>
          {dbCfg?.updated_at && (
            <span style={{ color: 'var(--color-text-muted)', marginLeft: 12 }}>
              (DB last updated: {new Date(dbCfg.updated_at).toLocaleString()})
            </span>
          )}
        </div>
      </div>

      {/* Edit form */}
      <div className="card" style={cardStyle}>
        <h3 style={{ marginBottom: 'var(--spacing-4)' }}>Edit configuration</h3>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 'var(--spacing-4)',
          }}
        >
          <div>
            <label style={labelStyle}>Base URL</label>
            <input
              className="input"
              style={{ width: '100%' }}
              placeholder="https://tom.arona.ro"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          </div>
          <div>
            <label style={labelStyle}>Source Code</label>
            <input
              className="input"
              style={{ width: '100%' }}
              placeholder="ARONA_BI"
              value={sourceCode}
              onChange={(e) => setSourceCode(e.target.value)}
            />
            <div
              style={{
                fontSize: '0.7rem',
                color: 'var(--color-text-muted)',
                marginTop: 4,
              }}
            >
              Must match the source registered with the API key on TOM.
            </div>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>API Key ID</label>
            <input
              className="input"
              style={{ width: '100%' }}
              placeholder="tom_live_arona_bi_..."
              value={apiKeyId}
              onChange={(e) => setApiKeyId(e.target.value)}
            />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>API Secret — leave empty to keep current</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="input"
                style={{ flex: 1 }}
                type={showSecret ? 'text' : 'password'}
                placeholder={dbCfg?.api_secret_set ? '•••••••• (saved)' : 'Paste secret here'}
                value={apiSecret}
                onChange={(e) => setApiSecret(e.target.value)}
              />
              <button
                className="btn btn-ghost btn-sm"
                type="button"
                onClick={() => setShowSecret((v) => !v)}
              >
                {showSecret ? 'Hide' : 'Show'}
              </button>
              {dbCfg?.api_secret_set && (
                <button
                  className="btn btn-sm"
                  style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}
                  type="button"
                  onClick={handleClearSecret}
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 'var(--spacing-3)',
            marginTop: 'var(--spacing-5)',
            flexWrap: 'wrap',
          }}
        >
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            className="btn btn-ghost"
            onClick={handleTest}
            disabled={testing}
          >
            {testing ? 'Testing…' : 'Test connection'}
          </button>
          <div style={{ flex: 1 }} />
          <button
            className="btn btn-ghost btn-sm"
            onClick={handleClearAll}
            style={{ color: '#ef4444' }}
          >
            Clear all DB credentials
          </button>
        </div>
      </div>

      {/* Test result */}
      {testResult && (
        <div
          className="card"
          style={{
            ...cardStyle,
            border: `1px solid ${testResult.ok ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)'}`,
            background: testResult.ok
              ? 'rgba(34,197,94,0.06)'
              : 'rgba(239,68,68,0.06)',
          }}
        >
          <h3 style={{ marginBottom: 'var(--spacing-3)' }}>
            Test result —{' '}
            <span style={{ color: testResult.ok ? '#16a34a' : '#ef4444' }}>
              {testResult.ok ? 'OK ✓' : 'FAIL ✗'}
            </span>
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <span style={labelStyle}>HTTP status</span>
              <div>
                <code>{testResult.status || '—'}</code>
              </div>
            </div>
            <div>
              <span style={labelStyle}>Latency</span>
              <div>
                <code>{testResult.elapsed_ms} ms</code>
              </div>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <span style={labelStyle}>Diagnosis</span>
              <div>
                <code>{testResult.diagnosis}</code>
              </div>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <span style={labelStyle}>Message</span>
              <div>{testResult.message}</div>
            </div>
            {testResult.body && Object.keys(testResult.body).length > 0 && (
              <div style={{ gridColumn: '1 / -1' }}>
                <span style={labelStyle}>Upstream response body</span>
                <pre
                  style={{
                    background: 'rgba(0,0,0,0.06)',
                    padding: 12,
                    borderRadius: 6,
                    overflow: 'auto',
                    fontSize: '0.8rem',
                  }}
                >
                  {JSON.stringify(testResult.body, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
