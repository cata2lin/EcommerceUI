/**
 * App — Root component with routing, providers, and auth guard.
 */
import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, ProtectedRoute } from './contexts/AuthContext';
import { SidebarProvider } from './contexts/SidebarContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { NotificationProvider } from './components/NotificationSystem';
import { useKeyboardShortcuts, KeyboardShortcutsHelp } from './components/KeyboardShortcuts';
import { CommandPalette } from './components/CommandPalette';
import Layout from './components/Layout/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ProductDetail from './pages/ProductDetail';
import ProductPipeline from './pages/ProductPipeline';
import PipelineStatusView from './pages/PipelineStatusView';
import Bestsellers from './pages/Bestsellers';
import Opportunities from './pages/Opportunities';
import Analytics from './pages/Analytics';
import ParserStatus from './pages/ParserStatus';
import Config from './pages/Config';
import SystemMonitoring from './pages/SystemMonitoring';
import Deployments from './pages/Deployments';
import ApprovedItems from './pages/ApprovedItems';
import PurchaseOrdersList from './pages/PurchaseOrdersList';
import PurchaseOrderDetail from './pages/PurchaseOrderDetail';

// Import enhanced styles
import './components/EnhancedUI.css';
import './components/KeyboardShortcuts.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

/**
 * Enhanced App Routes with keyboard shortcuts and command palette
 */
function AppRoutes() {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  
  const { shortcuts, showingHelp, setShowingHelp } = useKeyboardShortcuts({
    onToggleCommandPalette: () => setCommandPaletteOpen(prev => !prev)
  });

  return (
    <>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/product/:id" element={<ProductDetail />} />
          <Route path="/product/:id/pipeline-details" element={<ProductPipeline />} />
          <Route path="/pipeline/:slug" element={<PipelineStatusView />} />
          <Route path="/bestsellers" element={<Bestsellers />} />
          <Route path="/opportunities" element={<Opportunities />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/parser-status" element={<ParserStatus />} />
          <Route path="/config" element={<Config />} />
          <Route path="/system" element={<SystemMonitoring />} />
          <Route path="/deployments" element={<Deployments />} />
          <Route path="/purchase-orders/approved-items" element={<ApprovedItems />} />
          <Route path="/purchase-orders" element={<PurchaseOrdersList />} />
          <Route path="/purchase-orders/:id" element={<PurchaseOrderDetail />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>

      {/* Enhanced UI Components */}
      <CommandPalette 
        isOpen={commandPaletteOpen} 
        onClose={() => setCommandPaletteOpen(false)} 
      />
      
      <KeyboardShortcutsHelp 
        shortcuts={shortcuts}
        isOpen={showingHelp}
        onClose={() => setShowingHelp(false)}
      />
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <NotificationProvider>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route
                  path="/*"
                  element={
                    <ProtectedRoute>
                      <SidebarProvider>
                        <AppRoutes />
                      </SidebarProvider>
                    </ProtectedRoute>
                  }
                />
              </Routes>
            </NotificationProvider>
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
