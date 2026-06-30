import { useState } from 'react';
import { Outlet, useLocation, Navigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useAuth } from '@/contexts/AuthContext';
import { TeamChatBox } from '@/components/chat/TeamChatBox';
import ErrorBoundary from '@/components/ErrorBoundary';
import { normalizeRoleKey } from '@/lib/roleUtils';

const pageTitles: Record<string, string> = {
  '/inventory': 'Inventory',
  '/release': 'OUT WAREHOUSE DELIVERY',
  '/deliveries': 'Deliveries',
  '/pending-allocation': 'Pending Allocation',
  '/history': 'Transaction History',
  '/summary': 'Summary Report',
  '/import': 'Bucket',
  '/users': 'Manage Users',
  '/notes': 'Reminder',
  '/collections': 'Collection Items',
  '/container': 'Container',
  '/repeat-order': 'Repeat Order',
  '/allocation': 'Allocation',
  '/team-overview': 'Team Overview',
  '/reports': 'Reports',
  '/damage-claims': 'Damage Claims',
  '/discrepancies': 'Discrepancy',
  '/notifications': 'Notifications',
  '/profile': 'User Profile',
};

// Role-based route restrictions
const limitedViewerRestrictedRoutes = [
  '/dashboard',
  '/import',
  '/users',
  '/notes',
  '/inventory',
  '/reports',
  '/collections',
  '/favorites',
  '/container',
  '/repeat-order',
  '/allocation',
  '/task-calendar',
  '/attendance',
  '/resume-to-work',
  '/manpower',
  '/renewal',
  '/store-visit-schedule',
  '/team-overview',
];

const roleRestrictedRoutes: Record<string, string[]> = {
  viewer: ['/release', '/import', '/users', '/notes', '/inventory', '/summary', '/collections', '/container', '/repeat-order', '/allocation'],
  teamleader: limitedViewerRestrictedRoutes,
  oic: limitedViewerRestrictedRoutes,
  warehouse: limitedViewerRestrictedRoutes,
  staff: ['/import', '/users', '/inventory', '/container'],
  uploader: ['/users'], // Can view everything except user management
  encoder: ['/import', '/users', '/notes', '/inventory', '/collections', '/container', '/repeat-order', '/allocation', '/attendance', '/resume-to-work', '/manpower', '/summary', '/task-calendar', '/store-visit-schedule'], // Only Dashboard, Monitoring (Deliveries), History
  assistant: ['/users'], // Full access except user management - can view and edit but not delete
};

export const DashboardLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const location = useLocation();
  const { user, loading, userRole } = useAuth();
  const normalizedUserRole = normalizeRoleKey(userRole);

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
  if (normalizedUserRole === 'pending') {
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

  // Redirect users to dashboard if they try to access restricted routes based on their role
  const restrictedRoutes = roleRestrictedRoutes[normalizedUserRole] || [];
  if (restrictedRoutes.includes(location.pathname)) {
    const fallbackPath = ['teamleader', 'oic', 'warehouse'].includes(normalizedUserRole) ? '/deliveries' : '/dashboard';
    return <Navigate to={fallbackPath} replace />;
  }

  const title = pageTitles[location.pathname] || 'MONITORING DELIVERY';

  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        isCollapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
      />
      
      <div className={`min-w-0 transition-[padding-left] duration-300 ${sidebarCollapsed ? 'lg:pl-16' : 'lg:pl-64'}`}>
        <Header 
          onMenuClick={() => {
            setSidebarCollapsed(false);
            setSidebarOpen(true);
          }}
          title={title}
        />
        
        <main className="min-w-0 max-w-full p-3 sm:p-4 lg:p-6">
          <ErrorBoundary>
            <div className="page-transition min-w-0 max-w-full">
              <Outlet />
            </div>
          </ErrorBoundary>
        </main>
      </div>
      
      {/* Team Chat - Available to all authenticated users */}
      <TeamChatBox />
    </div>
  );
};
