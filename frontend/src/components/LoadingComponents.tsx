/**
 * Enhanced Loading Components — Modern loading states with
 * skeleton screens, spinners, and progress indicators.
 */
import './LoadingComponents.css';

// Enhanced Skeleton with shimmer effect
interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  className?: string;
  variant?: 'text' | 'rectangular' | 'circular';
}

export function Skeleton({ 
  width, 
  height, 
  className = '', 
  variant = 'rectangular' 
}: SkeletonProps) {
  const style: React.CSSProperties = {};
  if (width) style.width = typeof width === 'number' ? `${width}px` : width;
  if (height) style.height = typeof height === 'number' ? `${height}px` : height;

  return (
    <div 
      className={`skeleton-enhanced ${variant === 'text' ? 'skeleton-text' : ''} ${variant === 'circular' ? 'skeleton-circular' : ''} ${className}`}
      style={style}
    />
  );
}

// Skeleton table for data grids
interface SkeletonTableProps {
  rows?: number;
  columns?: number;
}

export function SkeletonTable({ rows = 5, columns = 6 }: SkeletonTableProps) {
  return (
    <div className="skeleton-table">
      <div className="skeleton-table-header">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} height={12} width={`${60 + Math.random() * 40}%`} />
        ))}
      </div>
      <div className="skeleton-table-body">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={rowIndex} className="skeleton-table-row">
            {Array.from({ length: columns }).map((_, colIndex) => (
              <Skeleton 
                key={colIndex} 
                height={14} 
                width={colIndex === 0 ? '80%' : `${40 + Math.random() * 50}%`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// Skeleton card grid
interface SkeletonCardsProps {
  count?: number;
  columns?: number;
}

export function SkeletonCards({ count = 6, columns = 3 }: SkeletonCardsProps) {
  return (
    <div className={`skeleton-cards skeleton-cards-${columns}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton-card">
          <Skeleton height={120} className="skeleton-card-image" />
          <div className="skeleton-card-content">
            <Skeleton height={16} width="80%" />
            <Skeleton height={12} width="60%" />
            <div className="skeleton-card-actions">
              <Skeleton height={10} width="30%" />
              <Skeleton height={10} width="25%" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Modern loading spinner
interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function LoadingSpinner({ size = 'md', className = '' }: LoadingSpinnerProps) {
  return (
    <div className={`loading-spinner loading-spinner-${size} ${className}`}>
      <div className="spinner-circle" />
    </div>
  );
}

// Loading dots
export function LoadingDots({ className = '' }: { className?: string }) {
  return (
    <div className={`loading-dots ${className}`}>
      <span></span>
      <span></span>
      <span></span>
    </div>
  );
}

// Progress bar with animation
interface ProgressBarProps {
  progress: number; // 0-100
  showLabel?: boolean;
  className?: string;
  variant?: 'default' | 'success' | 'warning' | 'error';
}

export function ProgressBar({ 
  progress, 
  showLabel = false, 
  className = '', 
  variant = 'default' 
}: ProgressBarProps) {
  return (
    <div className={`progress-bar-container ${className}`}>
      <div className="progress-bar">
        <div 
          className={`progress-bar-fill progress-bar-${variant}`}
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
        />
      </div>
      {showLabel && (
        <span className="progress-label">{Math.round(progress)}%</span>
      )}
    </div>
  );
}

// Full page loading overlay
interface LoadingOverlayProps {
  message?: string;
  showProgress?: boolean;
  progress?: number;
}

export function LoadingOverlay({ 
  message = 'Loading...', 
  showProgress = false, 
  progress = 0 
}: LoadingOverlayProps) {
  return (
    <div className="loading-overlay">
      <div className="loading-overlay-content">
        <LoadingSpinner size="lg" />
        <p className="loading-message">{message}</p>
        {showProgress && (
          <ProgressBar progress={progress} showLabel className="loading-progress" />
        )}
      </div>
    </div>
  );
}

// Inline loading indicator
interface InlineLoadingProps {
  text?: string;
  size?: 'sm' | 'md';
  className?: string;
}

export function InlineLoading({ 
  text = 'Loading...', 
  size = 'md', 
  className = '' 
}: InlineLoadingProps) {
  return (
    <div className={`inline-loading inline-loading-${size} ${className}`}>
      <LoadingSpinner size="sm" />
      <span>{text}</span>
    </div>
  );
}

// Empty state with illustration
interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ 
  icon = '📭', 
  title, 
  description, 
  action, 
  className = '' 
}: EmptyStateProps) {
  return (
    <div className={`empty-state ${className}`}>
      <div className="empty-state-icon">{icon}</div>
      <h3 className="empty-state-title">{title}</h3>
      {description && <p className="empty-state-description">{description}</p>}
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  );
}

// Pulsing placeholder for loading content
interface PulsePlaceholderProps {
  children: React.ReactNode;
  isLoading: boolean;
  className?: string;
}

export function PulsePlaceholder({ 
  children, 
  isLoading, 
  className = '' 
}: PulsePlaceholderProps) {
  return (
    <div className={`pulse-placeholder ${isLoading ? 'is-loading' : ''} ${className}`}>
      {children}
    </div>
  );
}

export default {
  Skeleton,
  SkeletonTable,
  SkeletonCards,
  LoadingSpinner,
  LoadingDots,
  ProgressBar,
  LoadingOverlay,
  InlineLoading,
  EmptyState,
  PulsePlaceholder
};