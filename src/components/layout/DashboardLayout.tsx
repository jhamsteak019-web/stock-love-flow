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
  '/collections': 'Collection Items',
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

  // Redirect pending users to a waiting page
  if (userRole === 'pending') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 text-center max-w-md px-4">
          <div className="h-16 w-16 rounded-full bg-amber-100 flex items-center justify-center">
            <svg className="h-8 w-8 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-foreground">Waiting for Approval</h1>
          <p className="text-muted-foreground">
            Your account is pending approval from an administrator. Please check back later or contact your admin.
          </p>
          <button 
            onClick={() => window.location.reload()} 
            className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            Refresh Status
          </button>
        </div>
      </div>
    );
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
