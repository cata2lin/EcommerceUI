/**
 * App — Root component with routing, providers, and auth guard.
 */
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, ProtectedRoute } from './contexts/AuthContext';
import { SidebarProvider } from './contexts/SidebarContext';
import { ThemeProvider } from './contexts/ThemeContext';
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
 * All authenticated pages wrapped in Layout.
 */
function AppRoutes() {
  return (
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
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
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
