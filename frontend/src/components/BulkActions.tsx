/**
 * Bulk Actions Interface — Multi-select and batch operations
 * for tables and lists with undo functionality.
 */
import { useState, useEffect } from 'react';
import { useNotifications } from './NotificationSystem';
import './BulkActions.css';

interface BulkAction {
  id: string;
  label: string;
  icon: string;
  variant?: 'default' | 'primary' | 'warning' | 'danger';
  confirmationRequired?: boolean;
  confirmationMessage?: string;
}

interface BulkActionsProps {
  selectedItems: string[] | number[];
  totalItems: number;
  actions: BulkAction[];
  onAction: (actionId: string, selectedIds: (string | number)[]) => Promise<void>;
  onSelectAll: () => void;
  onClearSelection: () => void;
  className?: string;
  maxVisible?: number;
}

export function BulkActions({
  selectedItems,
  totalItems,
  actions,
  onAction,
  onSelectAll,
  onClearSelection,
  className = '',
  maxVisible = 4
}: BulkActionsProps) {
  const { showSuccess, showError } = useNotifications();
  const [isExecuting, setIsExecuting] = useState<string | null>(null);
  const [showConfirmation, setShowConfirmation] = useState<BulkAction | null>(null);

  const selectedCount = selectedItems.length;
  const allSelected = selectedCount === totalItems && totalItems > 0;
  const someSelected = selectedCount > 0 && selectedCount < totalItems;

  const executeAction = async (action: BulkAction) => {
    if (action.confirmationRequired && !showConfirmation) {
      setShowConfirmation(action);
      return;
    }

    setIsExecuting(action.id);
    try {
      await onAction(action.id, selectedItems);
      showSuccess(`${action.label} completed`, `Applied to ${selectedCount} item${selectedCount !== 1 ? 's' : ''}`);
      onClearSelection();
    } catch (error) {
      showError('Action failed', `Failed to execute ${action.label.toLowerCase()}`);
    } finally {
      setIsExecuting(null);
      setShowConfirmation(null);
    }
  };

  const visibleActions = actions.slice(0, maxVisible);
  const hiddenActions = actions.slice(maxVisible);

  if (selectedCount === 0) return null;

  return (
    <>
      <div className={`bulk-actions ${className}`}>
        <div className="bulk-actions-info">
          <div className="bulk-select-controls">
            <button
              className={`bulk-checkbox ${allSelected ? 'checked' : someSelected ? 'indeterminate' : ''}`}
              onClick={allSelected ? onClearSelection : onSelectAll}
              aria-label={allSelected ? 'Deselect all' : 'Select all'}
            >
              {allSelected ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20,6 9,17 4,12" />
                </svg>
              ) : someSelected ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              ) : (
                <div className="checkbox-empty" />
              )}
            </button>
            
            <span className="bulk-count">
              {selectedCount} of {totalItems} selected
            </span>
          </div>

          <button
            className="bulk-clear"
            onClick={onClearSelection}
            aria-label="Clear selection"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="bulk-actions-buttons">
          {visibleActions.map((action) => (
            <button
              key={action.id}
              className={`bulk-action-btn bulk-action-${action.variant || 'default'}`}
              onClick={() => executeAction(action)}
              disabled={isExecuting === action.id}
            >
              <span className="bulk-action-icon">{action.icon}</span>
              <span className="bulk-action-label">{action.label}</span>
              {isExecuting === action.id && (
                <div className="bulk-action-loading">
                  <div className="loading-spinner-sm" />
                </div>
              )}
            </button>
          ))}

          {hiddenActions.length > 0 && (
            <BulkActionsDropdown
              actions={hiddenActions}
              onAction={executeAction}
              isExecuting={isExecuting}
            />
          )}
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmation && (
        <BulkActionConfirmation
          action={showConfirmation}
          selectedCount={selectedCount}
          onConfirm={() => executeAction(showConfirmation)}
          onCancel={() => setShowConfirmation(null)}
        />
      )}
    </>
  );
}

// Dropdown for overflow actions
interface BulkActionsDropdownProps {
  actions: BulkAction[];
  onAction: (action: BulkAction) => void;
  isExecuting: string | null;
}

function BulkActionsDropdown({ actions, onAction, isExecuting }: BulkActionsDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const dropdown = document.querySelector('.bulk-dropdown');
      if (dropdown && !dropdown.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('click', handleClickOutside);
    }

    return () => document.removeEventListener('click', handleClickOutside);
  }, [isOpen]);

  return (
    <div className="bulk-dropdown">
      <button
        className="bulk-action-btn bulk-action-default bulk-dropdown-trigger"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="bulk-action-icon">⋯</span>
        <span className="bulk-action-label">More</span>
      </button>

      {isOpen && (
        <div className="bulk-dropdown-menu">
          {actions.map((action) => (
            <button
              key={action.id}
              className={`bulk-dropdown-item bulk-dropdown-${action.variant || 'default'}`}
              onClick={() => {
                onAction(action);
                setIsOpen(false);
              }}
              disabled={isExecuting === action.id}
            >
              <span className="bulk-action-icon">{action.icon}</span>
              <span className="bulk-action-label">{action.label}</span>
              {isExecuting === action.id && (
                <div className="bulk-action-loading">
                  <div className="loading-spinner-sm" />
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Confirmation modal for destructive actions
interface BulkActionConfirmationProps {
  action: BulkAction;
  selectedCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}

function BulkActionConfirmation({ 
  action, 
  selectedCount, 
  onConfirm, 
  onCancel 
}: BulkActionConfirmationProps) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onCancel]);

  return (
    <div className="bulk-confirmation-overlay" onClick={onCancel}>
      <div className="bulk-confirmation-modal" onClick={e => e.stopPropagation()}>
        <div className="bulk-confirmation-header">
          <div className="bulk-confirmation-icon">
            {action.variant === 'danger' ? '⚠️' : '❓'}
          </div>
          <h3>Confirm {action.label}</h3>
        </div>

        <div className="bulk-confirmation-content">
          <p>
            {action.confirmationMessage || 
             `Are you sure you want to ${action.label.toLowerCase()} ${selectedCount} item${selectedCount !== 1 ? 's' : ''}?`}
          </p>
          {action.variant === 'danger' && (
            <p className="bulk-confirmation-warning">
              This action cannot be undone.
            </p>
          )}
        </div>

        <div className="bulk-confirmation-actions">
          <button className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button 
            className={`btn ${action.variant === 'danger' ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirm}
          >
            {action.label}
          </button>
        </div>
      </div>
    </div>
  );
}

// Hook for managing selection state
export function useSelection<T>(
  items: T[],
  keyExtractor: (item: T) => string | number = (item: any) => item.id
) {
  const [selectedIds, setSelectedIds] = useState<Set<string | number>>(new Set());

  const selectedItems = selectedIds.size > 0 ? Array.from(selectedIds) : [];
  const selectedCount = selectedIds.size;
  const allSelected = selectedCount === items.length && items.length > 0;

  const selectItem = (item: T) => {
    const id = keyExtractor(item);
    setSelectedIds(prev => new Set([...prev, id]));
  };

  const deselectItem = (item: T) => {
    const id = keyExtractor(item);
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const toggleItem = (item: T) => {
    const id = keyExtractor(item);
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(items.map(keyExtractor)));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const isSelected = (item: T) => {
    return selectedIds.has(keyExtractor(item));
  };

  return {
    selectedItems,
    selectedCount,
    allSelected,
    selectItem,
    deselectItem,
    toggleItem,
    selectAll,
    clearSelection,
    isSelected,
    selectedIds
  };
}

export default BulkActions;