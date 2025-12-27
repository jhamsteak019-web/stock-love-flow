import { useState } from 'react';
import { Outlet, useLocation, Navigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useAuth } from '@/contexts/AuthContext';

const pageTitles: Record<string, string> = {
  '/inventory': 'Inventory',
  '/release': 'OUT WAREHOUSE DELIVERY',
  '/deliveries': 'Deliveries',
  '/history': 'Transaction History',
  '/import': 'Bucket',
  '/users': 'Manage Users',
  '/notes': 'Reminder',
};

// Routes restricted from viewers - they can only access /deliveries, /dashboard, /history, /summary
const viewerRestrictedRoutes = ['/release', '/import', '/users', '/notes', '/inventory'];

export const DashboardLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const { user, loading, userRole } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Redirect viewers to deliveries if they try to access restricted routes
  if (userRole === 'viewer' && viewerRestrictedRoutes.includes(location.pathname)) {
    return <Navigate to="/deliveries" replace />;
  }

  const title = pageTitles[location.pathname] || 'MONITORING DELIVERY';

  return (
    <div className="min-h-screen bg-background">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      
      <div className="lg:pl-64">
        <Header 
          onMenuClick={() => setSidebarOpen(true)} 
          title={title}
        />
        
        <main className="p-4 lg:p-6">
          <div className="page-transition">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};
