/**
 * Command Palette — Quick navigation and action execution
 * with fuzzy search, keyboard navigation, and recent commands.
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from './NotificationSystem';
import './CommandPalette.css';

interface Command {
  id: string;
  title: string;
  subtitle?: string;
  category: string;
  icon: string;
  action: () => void;
  keywords?: string[];
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

// Fuzzy search function
function fuzzySearch(query: string, text: string): { matches: boolean; score: number } {
  if (!query) return { matches: true, score: 0 };
  
  const queryLower = query.toLowerCase();
  const textLower = text.toLowerCase();
  
  // Exact match gets highest score
  if (textLower.includes(queryLower)) {
    return { matches: true, score: 100 };
  }
  
  // Character matching with gaps allowed
  let queryIndex = 0;
  let score = 0;
  
  for (let i = 0; i < textLower.length && queryIndex < queryLower.length; i++) {
    if (textLower[i] === queryLower[queryIndex]) {
      score += queryLower.length - queryIndex; // Bonus for earlier matches
      queryIndex++;
    }
  }
  
  const matches = queryIndex === queryLower.length;
  return { matches, score };
}

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const navigate = useNavigate();
  const { showSuccess, showInfo } = useNotifications();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentCommands, setRecentCommands] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Define all available commands
  const allCommands: Command[] = useMemo(() => [
    // Navigation Commands
    {
      id: 'nav-dashboard',
      title: 'Dashboard',
      subtitle: 'Main product overview',
      category: 'Navigation',
      icon: '🏠',
      action: () => { navigate('/'); onClose(); },
      keywords: ['dashboard', 'home', 'products', 'main']
    },
    {
      id: 'nav-bestsellers',
      title: 'Bestsellers',
      subtitle: 'Top performing products',
      category: 'Navigation',
      icon: '🏆',
      action: () => { navigate('/bestsellers'); onClose(); },
      keywords: ['bestsellers', 'top', 'ranking', 'performance']
    },
    {
      id: 'nav-opportunities',
      title: 'Opportunities',
      subtitle: 'Shortlisted products',
      category: 'Navigation', 
      icon: '⭐',
      action: () => { navigate('/opportunities'); onClose(); },
      keywords: ['opportunities', 'shortlist', 'favorites', 'watchlist']
    },
    {
      id: 'nav-analytics',
      title: 'Analytics',
      subtitle: 'Charts and insights',
      category: 'Navigation',
      icon: '📊',
      action: () => { navigate('/analytics'); onClose(); },
      keywords: ['analytics', 'charts', 'insights', 'data', 'stats']
    },
    {
      id: 'nav-parser-status',
      title: 'Parser Status',
      subtitle: 'Scraper monitoring',
      category: 'Navigation',
      icon: '🔍',
      action: () => { navigate('/parser-status'); onClose(); },
      keywords: ['parser', 'status', 'scraper', 'monitoring', 'health']
    },
    {
      id: 'nav-config',
      title: 'Configuration',
      subtitle: 'Settings and categories',
      category: 'Navigation',
      icon: '⚙️',
      action: () => { navigate('/config'); onClose(); },
      keywords: ['config', 'settings', 'configuration', 'categories']
    },
    {
      id: 'nav-system',
      title: 'System Monitoring',
      subtitle: 'Database and MV status',
      category: 'Navigation',
      icon: '🖥️',
      action: () => { navigate('/system'); onClose(); },
      keywords: ['system', 'monitoring', 'database', 'performance']
    },
    {
      id: 'nav-deployments',
      title: 'Deployments',
      subtitle: 'CI/CD history',
      category: 'Navigation',
      icon: '🚀',
      action: () => { navigate('/deployments'); onClose(); },
      keywords: ['deployments', 'deploy', 'cicd', 'history']
    },

    // Action Commands
    {
      id: 'action-refresh',
      title: 'Refresh Page',
      subtitle: 'Reload current data',
      category: 'Actions',
      icon: '🔄',
      action: () => { window.location.reload(); onClose(); },
      keywords: ['refresh', 'reload', 'update']
    },
    {
      id: 'action-focus-search',
      title: 'Focus Search',
      subtitle: 'Jump to search input',
      category: 'Actions',
      icon: '🔍',
      action: () => {
        const searchInput = document.querySelector('input[placeholder*="search"], input[placeholder*="Search"]') as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
          showInfo('Search focused');
        }
        onClose();
      },
      keywords: ['search', 'find', 'filter']
    },
    {
      id: 'action-toggle-theme',
      title: 'Toggle Theme',
      subtitle: 'Switch dark/light mode',
      category: 'Actions',
      icon: '🌙',
      action: () => {
        // Find theme toggle button and click it
        const themeBtn = document.querySelector('.sidebar-theme-toggle') as HTMLButtonElement;
        if (themeBtn) {
          themeBtn.click();
          showSuccess('Theme toggled');
        }
        onClose();
      },
      keywords: ['theme', 'dark', 'light', 'mode']
    },

    // Quick Actions
    {
      id: 'quick-export',
      title: 'Export Data',
      subtitle: 'Download current view',
      category: 'Quick Actions',
      icon: '📥',
      action: () => {
        const exportBtn = document.querySelector('button[class*="export"], button:contains("Export")') as HTMLButtonElement;
        if (exportBtn) {
          exportBtn.click();
          showInfo('Export initiated');
        }
        onClose();
      },
      keywords: ['export', 'download', 'excel', 'csv']
    },
    {
      id: 'quick-filters',
      title: 'Toggle Filters',
      subtitle: 'Show/hide filter panel',
      category: 'Quick Actions', 
      icon: '🔽',
      action: () => {
        const filterBtn = document.querySelector('button:contains("Filters"), button[class*="filter"]') as HTMLButtonElement;
        if (filterBtn) {
          filterBtn.click();
          showInfo('Filters toggled');
        }
        onClose();
      },
      keywords: ['filters', 'filter', 'toggle']
    }
  ], [navigate, onClose, showSuccess, showInfo]);

  // Filter and sort commands based on query
  const filteredCommands = useMemo(() => {
    if (!query.trim()) {
      // Show recent commands first when no query
      return allCommands.sort((a, b) => {
        const aRecent = recentCommands.indexOf(a.id);
        const bRecent = recentCommands.indexOf(b.id);
        if (aRecent !== -1 && bRecent !== -1) return aRecent - bRecent;
        if (aRecent !== -1) return -1;
        if (bRecent !== -1) return 1;
        return 0;
      });
    }

    return allCommands
      .map(command => {
        const titleMatch = fuzzySearch(query, command.title);
        const subtitleMatch = command.subtitle ? fuzzySearch(query, command.subtitle) : { matches: false, score: 0 };
        const keywordMatch = command.keywords?.some(keyword => fuzzySearch(query, keyword).matches) || false;
        
        const matches = titleMatch.matches || subtitleMatch.matches || keywordMatch;
        const score = Math.max(titleMatch.score, subtitleMatch.score) + (keywordMatch ? 10 : 0);
        
        return { command, matches, score };
      })
      .filter(({ matches }) => matches)
      .sort((a, b) => b.score - a.score)
      .map(({ command }) => command);
  }, [allCommands, query, recentCommands]);

  // Group commands by category
  const groupedCommands = useMemo(() => {
    const groups: Record<string, Command[]> = {};
    filteredCommands.forEach(command => {
      if (!groups[command.category]) {
        groups[command.category] = [];
      }
      groups[command.category].push(command);
    });
    return groups;
  }, [filteredCommands]);

  // Handle command execution
  const executeCommand = useCallback((command: Command) => {
    // Add to recent commands
    setRecentCommands(prev => {
      const updated = [command.id, ...prev.filter(id => id !== command.id)];
      return updated.slice(0, 10); // Keep only 10 recent
    });
    
    // Execute the command
    command.action();
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev => Math.min(prev + 1, filteredCommands.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev => Math.max(prev - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (filteredCommands[selectedIndex]) {
            executeCommand(filteredCommands[selectedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredCommands, selectedIndex, executeCommand, onClose]);

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current && isOpen) {
      const selectedElement = listRef.current.querySelector(
        `.command-item:nth-child(${selectedIndex + 1})`
      ) as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({ 
          block: 'nearest',
          behavior: 'smooth'
        });
      }
    }
  }, [selectedIndex, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="command-palette-overlay" onClick={onClose}>
      <div className="command-palette" onClick={e => e.stopPropagation()}>
        <div className="command-palette-header">
          <div className="command-search-wrapper">
            <svg className="command-search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input
              ref={inputRef}
              className="command-search-input"
              placeholder="Type a command or search..."
              value={query}
              onChange={e => {
                setQuery(e.target.value);
                setSelectedIndex(0);
              }}
              autoComplete="off"
              spellCheck="false"
            />
          </div>
        </div>

        <div className="command-palette-content" ref={listRef}>
          {Object.keys(groupedCommands).length === 0 ? (
            <div className="command-empty">
              <div className="command-empty-icon">🔍</div>
              <div className="command-empty-text">No commands found</div>
              <div className="command-empty-subtitle">Try a different search term</div>
            </div>
          ) : (
            Object.entries(groupedCommands).map(([category, commands], categoryIndex) => (
              <div key={category} className="command-group">
                <div className="command-group-title">{category}</div>
                <div className="command-group-items">
                  {commands.map((command, commandIndex) => {
                    const globalIndex = Object.entries(groupedCommands)
                      .slice(0, categoryIndex)
                      .reduce((acc, [, cmds]) => acc + cmds.length, 0) + commandIndex;
                    
                    return (
                      <div
                        key={command.id}
                        className={`command-item ${globalIndex === selectedIndex ? 'selected' : ''}`}
                        onClick={() => executeCommand(command)}
                      >
                        <div className="command-icon">{command.icon}</div>
                        <div className="command-content">
                          <div className="command-title">{command.title}</div>
                          {command.subtitle && (
                            <div className="command-subtitle">{command.subtitle}</div>
                          )}
                        </div>
                        {recentCommands.includes(command.id) && (
                          <div className="command-badge">Recent</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="command-palette-footer">
          <div className="command-hints">
            <span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span>
            <span><kbd>↵</kbd> Execute</span>
            <span><kbd>ESC</kbd> Close</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CommandPalette;