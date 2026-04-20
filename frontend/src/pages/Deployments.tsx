/**
 * Deployments — View deployment history, logs, errors, and trigger manual deploys.
 * Shows a timeline of all deployments with expandable details per entry.
 */
import { useState, useEffect, useCallback } from 'react';
import { fetchDeployments, fetchDeployLiveLog, triggerDeploy } from '../api';
import './Deployments.css';

interface DeployStep {
  number: number;
  description: string;
  timestamp: string | null;
}

interface Deployment {
  status: 'success' | 'failed' | 'rolled_back' | 'skipped' | 'unknown';
  started_at: string | null;
  finished_at: string | null;
  duration_seconds: number | null;
  commit_from: string | null;
  commit_to: string | null;
  steps: DeployStep[];
  log_lines: string[];
  errors: string[];
}

interface DeploymentData {
  deployments: Deployment[];
  summary: {
    total: number;
    successful: number;
    failed: number;
    skipped: number;
    success_rate: number;
  };
}

/** Classify a raw log line for syntax highlighting. */
function classifyLine(line: string): string {
  if (line.includes('═══') || line.includes('DEPLOY')) return 'header';
  if (line.includes('✅') || line.includes('COMPLETE')) return 'success';
  if (line.includes('❌') || line.includes('ERROR') || line.includes('FAILED')) return 'error';
  if (line.includes('[') && line.includes('/5]')) return 'info';
  return '';
}

/** Format a timestamp to a short display. */
function formatTime(ts: string | null): string {
  if (!ts) return '—';
  // ts format: "2026-04-20 12:28:20"
  const parts = ts.split(' ');
  if (parts.length === 2) {
    const [date, time] = parts;
    const [, month, day] = date.split('-');
    return `${day}/${month} ${time}`;
  }
  return ts;
}

/** Format duration in seconds to human-readable. */
function formatDuration(sec: number | null): string {
  if (sec === null || sec === undefined) return '—';
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

const STATUS_LABELS: Record<string, string> = {
  success: 'Success',
  failed: 'Failed',
  rolled_back: 'Rolled Back',
  skipped: 'No Changes',
  unknown: 'Unknown',
};

export default function Deployments() {
  const [data, setData] = useState<DeploymentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'timeline' | 'live-log'>('timeline');
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [liveLog, setLiveLog] = useState<string[]>([]);
  const [deploying, setDeploying] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const res = await fetchDeployments();
      setData(res.data);
    } catch (err) {
      console.error('Failed to load deployments:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadLiveLog = useCallback(async () => {
    try {
      const res = await fetchDeployLiveLog(200);
      setLiveLog(res.data.lines);
    } catch (err) {
      console.error('Failed to load live log:', err);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (activeTab === 'live-log') {
      loadLiveLog();
      // Auto-refresh every 5 seconds when viewing live log
      const interval = setInterval(loadLiveLog, 5000);
      return () => clearInterval(interval);
    }
  }, [activeTab, loadLiveLog]);

  const handleDeploy = async () => {
    if (deploying) return;
    setDeploying(true);
    try {
      await triggerDeploy();
      // Switch to live log to watch progress
      setActiveTab('live-log');
      loadLiveLog();
      // Refresh data after a delay
      setTimeout(() => {
        loadData();
        setDeploying(false);
      }, 15000);
    } catch (err) {
      console.error('Failed to trigger deploy:', err);
      setDeploying(false);
    }
  };

  const toggleExpand = (idx: number) => {
    setExpandedIndex(prev => (prev === idx ? null : idx));
  };

  // ─── Loading State ────────────────────────────────────────
  if (loading) {
    return (
      <div className="dep-page">
        <div className="dep-header">
          <h1>Deployments</h1>
        </div>
        <div className="dep-stats-row">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card dep-skeleton">
              <div className="skeleton skeleton-text" style={{ width: '60%' }} />
              <div className="skeleton skeleton-text" style={{ width: '40%' }} />
            </div>
          ))}
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card dep-skeleton" style={{ marginBottom: 'var(--spacing-3)' }}>
            <div className="skeleton skeleton-text" style={{ width: '80%' }} />
            <div className="skeleton skeleton-text" style={{ width: '50%' }} />
          </div>
        ))}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="dep-page">
        <div className="dep-header"><h1>Deployments</h1></div>
        <p className="text-muted">Failed to load deployment data.</p>
      </div>
    );
  }

  const { deployments, summary } = data;

  return (
    <div className="dep-page">
      {/* Header */}
      <div className="dep-header">
        <h1>Deployments</h1>
        <div className="dep-header-actions">
          <button className="btn btn-ghost" onClick={() => { loadData(); if (activeTab === 'live-log') loadLiveLog(); }}>
            ↻ Refresh
          </button>
          <button
            className="btn btn-primary"
            onClick={handleDeploy}
            disabled={deploying}
          >
            {deploying ? '⏳ Deploying...' : '🚀 Deploy Now'}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="dep-stats-row">
        <div className="card dep-stat-card">
          <div className="dep-stat-label">Total Deploys</div>
          <div className="dep-stat-value">{summary.total}</div>
        </div>
        <div className="card dep-stat-card">
          <div className="dep-stat-label">Successful</div>
          <div className="dep-stat-value success">{summary.successful}</div>
        </div>
        <div className="card dep-stat-card">
          <div className="dep-stat-label">Failed</div>
          <div className="dep-stat-value failed">{summary.failed}</div>
        </div>
        <div className="card dep-stat-card">
          <div className="dep-stat-label">Success Rate</div>
          <div className="dep-stat-value rate">{summary.success_rate}%</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="dep-tabs">
        <button
          className={`dep-tab ${activeTab === 'timeline' ? 'active' : ''}`}
          onClick={() => setActiveTab('timeline')}
        >
          📋 Timeline
        </button>
        <button
          className={`dep-tab ${activeTab === 'live-log' ? 'active' : ''}`}
          onClick={() => setActiveTab('live-log')}
        >
          📟 Live Log
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'timeline' ? (
        <div className="dep-timeline">
          {deployments.length === 0 ? (
            <div className="dep-empty">
              <div className="dep-empty-icon">📦</div>
              <p>No deployments yet. Push to <code>main</code> to trigger one.</p>
            </div>
          ) : (
            deployments.map((deploy, idx) => (
              <div key={idx} className="dep-entry">
                <div className="dep-entry-header" onClick={() => toggleExpand(idx)}>
                  <div className="dep-entry-left">
                    <span className={`dep-status ${deploy.status}`}>
                      <span className="dep-status-dot" />
                      {STATUS_LABELS[deploy.status] || deploy.status}
                    </span>
                    {deploy.commit_from && deploy.commit_to && deploy.commit_from !== deploy.commit_to && (
                      <span className="dep-commits">
                        <span className="dep-commit-hash">{deploy.commit_from}</span>
                        <span className="dep-commit-arrow">→</span>
                        <span className="dep-commit-hash">{deploy.commit_to}</span>
                      </span>
                    )}
                    {deploy.commit_from && deploy.commit_to && deploy.commit_from === deploy.commit_to && (
                      <span className="dep-commits">
                        <span className="dep-commit-hash">{deploy.commit_from}</span>
                      </span>
                    )}
                  </div>
                  <div className="dep-entry-right">
                    {deploy.duration_seconds !== null && (
                      <span className="dep-duration">⏱ {formatDuration(deploy.duration_seconds)}</span>
                    )}
                    <span className="dep-time">{formatTime(deploy.started_at)}</span>
                    <span className={`dep-expand-icon ${expandedIndex === idx ? 'expanded' : ''}`}>▼</span>
                  </div>
                </div>

                {expandedIndex === idx && (
                  <div className="dep-details">
                    {/* Steps */}
                    {deploy.steps.length > 0 && (
                      <div className="dep-steps">
                        <div className="dep-steps-title">Deploy Steps</div>
                        {deploy.steps.map((step, si) => (
                          <div key={si} className="dep-step">
                            <span className="dep-step-number">{step.number}</span>
                            <span className="dep-step-text">{step.description}</span>
                            {step.timestamp && (
                              <span className="dep-step-time">{step.timestamp.split(' ')[1]}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Errors */}
                    {deploy.errors.length > 0 && (
                      <div className="dep-errors">
                        <div className="dep-errors-title">⚠ Errors ({deploy.errors.length})</div>
                        {deploy.errors.map((err, ei) => (
                          <div key={ei} className="dep-error-line">{err}</div>
                        ))}
                      </div>
                    )}

                    {/* Raw log (collapsed by default) */}
                    {deploy.log_lines.length > 0 && (
                      <details style={{ marginTop: 'var(--spacing-3)' }}>
                        <summary style={{ cursor: 'pointer', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                          Raw Log ({deploy.log_lines.length} lines)
                        </summary>
                        <div className="dep-live-log" style={{ marginTop: 'var(--spacing-2)', maxHeight: '300px' }}>
                          {deploy.log_lines.map((line, li) => (
                            <div key={li} className={`dep-log-line ${classifyLine(line)}`}>{line}</div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      ) : (
        /* Live Log Tab */
        <div className="dep-live-log">
          {liveLog.length === 0 ? (
            <div className="dep-log-line">No log data available.</div>
          ) : (
            liveLog.map((line, i) => (
              <div key={i} className={`dep-log-line ${classifyLine(line)}`}>{line}</div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
