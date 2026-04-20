/**
 * Sidebar — Persistent navigation with live counts, collapsible parser groups,
 * pipeline status badges, and sign-out.
 */
import { useState, useMemo } from 'react';
import { NavLink, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useSidebar } from '../../contexts/SidebarContext';
import { useTheme } from '../../contexts/ThemeContext';
import './Sidebar.css';

// ─── SVG Icons (inline for zero dependencies) ──────────────
const Icons = {
  home: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  ),
  heart: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
    </svg>
  ),
  star: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  ),
  trophy: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9H4.5a2.5 2.5 0 010-5H6" /><path d="M18 9h1.5a2.5 2.5 0 000-5H18" />
      <path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0012 0V2z" />
    </svg>
  ),
  activity: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  ),
  settings: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  ),
  logout: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),
  chevron: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  ),
  store: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
    </svg>
  ),
  sparkles: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275L12 3z" />
    </svg>
  ),
  pipeline: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  ),
  barChart: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  ),
  sun: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  ),
  moon: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    </svg>
  ),
};

// Status slug mapping
const PIPELINE_SLUGS = [
  { slug: 'new', label: 'New' },
  { slug: 'supplier-info', label: 'Waiting for Supplier Info' },
  { slug: 'financial-review', label: 'Financial Review' },
  { slug: 'market-research', label: 'Market Research' },
  { slug: 'approved', label: 'Approved' },
  { slug: 'hold', label: 'Hold' },
  { slug: 'discarded', label: 'Discarded' },
];

export default function Sidebar() {
  const { logout } = useAuth();
  const { data, loading } = useSidebar();
  const { theme, toggleTheme } = useTheme();
  const [searchParams] = useSearchParams();
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const currentParserId = searchParams.get('parser_id');

  // Group parsers by category
  const parserGroups = useMemo(() => {
    if (!data?.parsers) return {};
    const groups: Record<string, typeof data.parsers> = {};
    for (const p of data.parsers) {
      const cat = p.category || 'Uncategorized';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(p);
    }
    return groups;
  }, [data?.parsers]);

  // Pipeline counts as a map
  const pipelineCounts = useMemo(() => {
    if (!data?.pipeline_statuses) return {};
    const map: Record<string, number> = {};
    data.pipeline_statuses.forEach((s) => {
      map[s.slug] = s.count;
    });
    return map;
  }, [data?.pipeline_statuses]);

  const toggleCategory = (cat: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  };

  return (
    <aside className="app-sidebar sidebar">
      {/* Logo */}
      <div className="sidebar-header">
        <div className="sidebar-logo">
          {Icons.sparkles}
          <span>E-commerce BI</span>
        </div>
        <button className="sidebar-theme-toggle" onClick={toggleTheme} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
          {theme === 'dark' ? Icons.sun : Icons.moon}
        </button>
      </div>

      <nav className="sidebar-nav">
        {/* All Products */}
        <NavLink to="/" end className={({ isActive }) => `sidebar-link ${isActive && !currentParserId ? 'active' : ''}`}>
          {Icons.home}
          <span>All Products</span>
        </NavLink>

        {/* ─── Parsers Section ─── */}
        <div className="sidebar-section">
          <div className="sidebar-section-title">Stores</div>

          {/* Watchlist */}
          <NavLink
            to="/?parser_id=watchlist"
            className={() => `sidebar-link sidebar-link-sm sidebar-link-nested ${currentParserId === 'watchlist' ? 'active' : ''}`}
          >
            {Icons.heart}
            <span>Watchlist</span>
          </NavLink>

          {/* Parser categories */}
          {loading && !data ? (
            <div className="sidebar-skeleton">
              {[1, 2, 3].map((i) => (
                <div key={i} className="skeleton skeleton-text" style={{ width: `${60 + i * 10}%` }} />
              ))}
            </div>
          ) : (
            Object.entries(parserGroups).map(([category, parsers]) => (
              <div key={category} className="sidebar-group">
                <button
                  className="sidebar-group-toggle"
                  onClick={() => toggleCategory(category)}
                  aria-expanded={expandedCategories.has(category)}
                >
                  <span className={`sidebar-chevron ${expandedCategories.has(category) ? 'expanded' : ''}`}>
                    {Icons.chevron}
                  </span>
                  <span className="sidebar-group-label">{category}</span>
                  <span className="sidebar-count">
                    {parsers.reduce((sum, p) => sum + p.product_count, 0)}
                  </span>
                </button>

                {expandedCategories.has(category) && (
                  <div className="sidebar-group-items animate-fade-in">
                    {parsers.map((parser) => (
                      <NavLink
                        key={parser.id}
                        to={`/?parser_id=${parser.id}`}
                        className={() => `sidebar-link sidebar-link-sm sidebar-link-nested ${
                          currentParserId === String(parser.id) ? 'active' : ''
                        }`}
                      >
                        {Icons.store}
                        <span className="truncate">{parser.name}</span>
                        <span className="sidebar-count">{parser.product_count}</span>
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* ─── Flow Section ─── */}
        <div className="sidebar-section">
          <div className="sidebar-section-title">Pipeline</div>

          <NavLink to="/opportunities" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
            {Icons.star}
            <span>Opportunities</span>
          </NavLink>

          {PIPELINE_SLUGS.map(({ slug, label }) => (
            <NavLink
              key={slug}
              to={`/pipeline/${slug}`}
              className={({ isActive }) => `sidebar-link sidebar-link-sm ${isActive ? 'active' : ''}`}
            >
              {Icons.pipeline}
              <span>{label}</span>
              {pipelineCounts[slug] != null && (
                <span className="sidebar-count">{pipelineCounts[slug]}</span>
              )}
            </NavLink>
          ))}
        </div>

        {/* ─── System Section ─── */}
        <div className="sidebar-section">
          <div className="sidebar-section-title">System</div>

          <NavLink to="/bestsellers" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
            {Icons.trophy}
            <span>Best Sellers</span>
          </NavLink>

          <NavLink to="/analytics" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
            {Icons.barChart}
            <span>Analytics</span>
          </NavLink>

          <NavLink to="/parser-status" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
            {Icons.activity}
            <span>Parser Status</span>
          </NavLink>

          <NavLink to="/config" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
            {Icons.settings}
            <span>Configuration</span>
          </NavLink>

          <NavLink to="/system" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
            <span>Monitoring</span>
          </NavLink>

          <NavLink to="/deployments" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
            <span>Deployments</span>
          </NavLink>
        </div>
      </nav>

      {/* Sign Out */}
      <div className="sidebar-footer">
        <button className="sidebar-link sidebar-logout" onClick={logout}>
          {Icons.logout}
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}
