/**
 * Keyboard Shortcuts System — Global hotkeys for power user navigation,
 * with visual feedback and command palette integration.
 */
import { useEffect, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from './NotificationSystem';

interface Shortcut {
  key: string;
  description: string;
  action: () => void;
  category: string;
}

interface UseKeyboardShortcutsProps {
  onToggleCommandPalette?: () => void;
}

export function useKeyboardShortcuts({ onToggleCommandPalette }: UseKeyboardShortcutsProps = {}) {
  const navigate = useNavigate();
  
  // Try to use notifications, but don't crash if provider is not available
  let showInfo = () => {};
  try {
    const notifications = useNotifications();
    showInfo = notifications.showInfo;
  } catch (error) {
    // Notifications not available, use fallback
    console.log('Notifications not available, using fallback');
  }
  
  const [showingHelp, setShowingHelp] = useState(false);

  const shortcuts: Shortcut[] = [
    // Navigation
    {
      key: 'g+d',
      description: 'Go to Dashboard',
      action: () => navigate('/'),
      category: 'Navigation'
    },
    {
      key: 'g+b',
      description: 'Go to Bestsellers', 
      action: () => navigate('/bestsellers'),
      category: 'Navigation'
    },
    {
      key: 'g+o',
      description: 'Go to Opportunities',
      action: () => navigate('/opportunities'),
      category: 'Navigation'
    },
    {
      key: 'g+a',
      description: 'Go to Analytics',
      action: () => navigate('/analytics'),
      category: 'Navigation'
    },
    {
      key: 'g+p',
      description: 'Go to Parser Status',
      action: () => navigate('/parser-status'),
      category: 'Navigation'
    },
    {
      key: 'g+c',
      description: 'Go to Configuration',
      action: () => navigate('/config'),
      category: 'Navigation'
    },
    {
      key: 'g+s',
      description: 'Go to System Monitoring',
      action: () => navigate('/system'),
      category: 'Navigation'
    },
    
    // Actions
    {
      key: 'cmd+k',
      description: 'Open Command Palette',
      action: () => onToggleCommandPalette?.(),
      category: 'Actions'
    },
    {
      key: 'cmd+r',
      description: 'Refresh Current Page',
      action: () => window.location.reload(),
      category: 'Actions'
    },
    {
      key: '/',
      description: 'Focus Search Input',
      action: () => {
        const searchInput = document.querySelector('input[placeholder*="search"], input[placeholder*="Search"]') as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
      },
      category: 'Actions'
    },
    {
      key: 'esc',
      description: 'Close Modals / Clear Focus',
      action: () => {
        // Close any open modals
        const modals = document.querySelectorAll('[role="dialog"], .modal');
        modals.forEach(modal => {
          const closeBtn = modal.querySelector('[aria-label="close"], .close-btn') as HTMLElement;
          closeBtn?.click();
        });
        
        // Clear focus
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      },
      category: 'Actions'
    },
    
    // Help
    {
      key: '?',
      description: 'Show Keyboard Shortcuts',
      action: () => setShowingHelp(true),
      category: 'Help'
    }
  ];

  const handleKeyPress = useCallback((event: KeyboardEvent) => {
    // Don't trigger shortcuts when typing in inputs
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement ||
      event.target instanceof HTMLSelectElement ||
      (event.target instanceof HTMLElement && event.target.isContentEditable)
    ) {
      // Allow ESC to work in inputs
      if (event.key === 'Escape') {
        (event.target as HTMLElement).blur();
        event.preventDefault();
      }
      return;
    }

    // Handle modifier keys
    const isCmd = event.metaKey || event.ctrlKey;
    const isShift = event.shiftKey;
    
    // Create key combination string
    let keyCombo = '';
    if (isCmd) keyCombo += 'cmd+';
    if (isShift) keyCombo += 'shift+';
    keyCombo += event.key.toLowerCase();

    // Handle sequential shortcuts (like g+d)
    const handleSequentialShortcut = (prefix: string) => {
      let sequentialKeys = '';
      let timeoutId: number;
      
      return (key: string) => {
        clearTimeout(timeoutId);
        
        if (key === prefix && !sequentialKeys) {
          sequentialKeys = key;
          // Show visual feedback for sequence start
          showTemporaryIndicator(`Press next key...`);
          
          timeoutId = setTimeout(() => {
            sequentialKeys = '';
          }, 2000);
          
          return true; // Consumed
        } else if (sequentialKeys === prefix) {
          const fullCombo = `${prefix}+${key}`;
          sequentialKeys = '';
          
          const shortcut = shortcuts.find(s => s.key === fullCombo);
          if (shortcut) {
            event.preventDefault();
            shortcut.action();
            showInfo(`Executed: ${shortcut.description}`);
            return true;
          }
        }
        
        return false;
      };
    };

    const gSequence = handleSequentialShortcut('g');
    
    // Try sequential shortcuts first
    if (gSequence(event.key.toLowerCase())) {
      return;
    }

    // Try direct shortcuts
    const shortcut = shortcuts.find(s => s.key === keyCombo || s.key === event.key.toLowerCase());
    if (shortcut) {
      event.preventDefault();
      shortcut.action();
      
      if (shortcut.key !== '?') { // Don't show notification for help
        showInfo(`Executed: ${shortcut.description}`);
      }
    }
  }, [navigate, onToggleCommandPalette, shortcuts, showInfo]);

  const showTemporaryIndicator = (text: string) => {
    const indicator = document.createElement('div');
    indicator.textContent = text;
    indicator.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      z-index: 10000;
      box-shadow: 0 8px 25px rgba(0, 0, 0, 0.2);
      backdrop-filter: blur(12px);
      animation: fadeIn 0.2s ease;
    `;
    
    document.body.appendChild(indicator);
    setTimeout(() => {
      indicator.style.animation = 'fadeOut 0.2s ease forwards';
      setTimeout(() => indicator.remove(), 200);
    }, 1000);
  };

  useEffect(() => {
    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, [handleKeyPress]);

  return {
    shortcuts,
    showingHelp,
    setShowingHelp
  };
}

interface KeyboardShortcutsHelpProps {
  shortcuts: Shortcut[];
  isOpen: boolean;
  onClose: () => void;
}

export function KeyboardShortcutsHelp({ shortcuts, isOpen, onClose }: KeyboardShortcutsHelpProps) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const groupedShortcuts = shortcuts.reduce((acc, shortcut) => {
    if (!acc[shortcut.category]) {
      acc[shortcut.category] = [];
    }
    acc[shortcut.category].push(shortcut);
    return acc;
  }, {} as Record<string, Shortcut[]>);

  return (
    <div className="keyboard-help-overlay" onClick={onClose}>
      <div className="keyboard-help-modal" onClick={e => e.stopPropagation()}>
        <div className="keyboard-help-header">
          <h2>Keyboard Shortcuts</h2>
          <button className="keyboard-help-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        
        <div className="keyboard-help-content">
          {Object.entries(groupedShortcuts).map(([category, categoryShortcuts]) => (
            <div key={category} className="keyboard-help-section">
              <h3>{category}</h3>
              <div className="keyboard-help-list">
                {categoryShortcuts.map(shortcut => (
                  <div key={shortcut.key} className="keyboard-help-item">
                    <div className="keyboard-help-keys">
                      {shortcut.key.split('+').map((key, index, array) => (
                        <span key={index}>
                          <kbd>{key === 'cmd' ? '⌘' : key}</kbd>
                          {index < array.length - 1 && <span className="key-separator">+</span>}
                        </span>
                      ))}
                    </div>
                    <span className="keyboard-help-desc">{shortcut.description}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        
        <div className="keyboard-help-footer">
          <p>Press <kbd>ESC</kbd> to close this dialog</p>
        </div>
      </div>
    </div>
  );
}

export default useKeyboardShortcuts;