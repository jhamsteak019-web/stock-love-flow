import { NavLink, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { 
  LayoutDashboard, 
  Package, 
  Truck, 
  FileSpreadsheet, 
  Users, 
  LogOut,
  PackagePlus,
  ClipboardList,
  Menu,
  ChevronLeft,
  BarChart3,
  Archive,
  StickyNote,
  FolderHeart,
  Heart
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar = ({ isOpen, onClose }: SidebarProps) => {
  const { userRole, signOut, user } = useAuth();
  const location = useLocation();
  const isAdmin = userRole === 'admin';
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  const handleToggleCollapse = () => {
    setIsAnimating(true);
    setIsCollapsed(!isCollapsed);
    setTimeout(() => setIsAnimating(false), 300);
  };

  const navItems = [
    { 
      to: '/dashboard', 
      icon: LayoutDashboard, 
      label: 'Dashboard',
      roles: ['admin', 'staff', 'viewer']
    },
    { 
      to: '/release', 
      icon: PackagePlus, 
      label: 'OUT WAREHOUSE DELIVERY',
      roles: ['admin', 'staff']
    },
    { 
      to: '/deliveries', 
      icon: Truck, 
      label: 'Deliveries',
      roles: ['admin', 'staff', 'viewer']
    },
    { 
      to: '/history', 
      icon: ClipboardList, 
      label: 'History',
      roles: ['admin', 'staff', 'viewer']
    },
    { 
      to: '/summary', 
      icon: BarChart3, 
      label: 'Summary Report',
      roles: ['admin', 'staff', 'viewer']
    },
    { 
      to: '/import', 
      icon: Archive, 
      label: 'Bucket',
      roles: ['admin']
    },
    { 
      to: '/users', 
      icon: Users, 
      label: 'Manage Users',
      roles: ['admin']
    },
    { 
      to: '/notes', 
      icon: StickyNote, 
      label: 'Reminder',
      roles: ['admin', 'staff']
    },
    { 
      to: '/collections', 
      icon: FolderHeart, 
      label: 'Collection Items',
      roles: ['admin', 'staff']
    },
    { 
      to: '/favorites', 
      icon: Heart, 
      label: 'Favorites',
      roles: ['admin', 'staff']
    },
  ];

  const filteredNavItems = navItems.filter(item => 
    item.roles.includes(userRole || '')
  );

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-40 lg:hidden"
          onClick={onClose}
        />
      )}
      
      {/* Sidebar */}
      <TooltipProvider delayDuration={0}>
        <aside
          className={cn(
            "fixed top-0 left-0 z-50 h-full bg-sidebar text-sidebar-foreground transition-all duration-300 ease-in-out lg:translate-x-0",
            isCollapsed ? "w-16" : "w-64",
            isOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <div className="flex h-full flex-col">
            {/* Logo */}
            <div className={cn(
              "flex h-16 items-center border-b border-sidebar-border",
              isCollapsed ? "justify-center px-2" : "justify-between px-4"
            )}>
            <div className={cn("flex items-center gap-3", isCollapsed && "hidden")}>
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/70 shadow-lg">
                  <Package className="h-5 w-5 text-sidebar-primary-foreground" />
                </div>
                <div>
                  <h1 className="text-sm font-bold tracking-tight">MONITORING DELIVERY</h1>
                  <p className="text-xs text-sidebar-foreground/60 capitalize">{userRole} Panel</p>
                </div>
              </div>
              <button
                onClick={handleToggleCollapse}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-all duration-300"
              >
                <ChevronLeft className={cn(
                  "h-5 w-5 transition-transform duration-300",
                  isCollapsed && "rotate-180"
                )} />
              </button>
            </div>

            {/* Navigation */}
            <nav className={cn("flex-1 space-y-1", isCollapsed ? "p-2" : "p-4")}>
              {filteredNavItems.map((item) => {
                const isActive = location.pathname === item.to;
                const navLink = (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={onClose}
                    className={cn(
                      "flex items-center rounded-lg text-sm font-medium transition-all duration-200",
                      isCollapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5",
                      isActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                    )}
                  >
                    {item.icon && <item.icon className={cn("h-5 w-5 flex-shrink-0", isActive && "text-sidebar-primary")} />}
                    {!isCollapsed && item.label}
                  </NavLink>
                );

                if (isCollapsed) {
                  return (
                    <Tooltip key={item.to}>
                      <TooltipTrigger asChild>
                        {navLink}
                      </TooltipTrigger>
                      <TooltipContent side="right" className="bg-popover text-popover-foreground">
                        {item.label}
                      </TooltipContent>
                    </Tooltip>
                  );
                }

                return navLink;
              })}
            </nav>

            {/* User info & Logout */}
            <div className={cn("border-t border-sidebar-border", isCollapsed ? "p-2" : "p-4")}>
              {!isCollapsed && (
                <div className="mb-3 rounded-lg bg-sidebar-accent/50 p-3">
                  <p className="text-sm font-medium truncate">{user?.email}</p>
                  <p className="text-xs text-sidebar-foreground/60 capitalize">{userRole}</p>
                </div>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={signOut}
                    className={cn(
                      "flex w-full items-center rounded-lg text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-destructive/10 hover:text-destructive",
                      isCollapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5"
                    )}
                  >
                    <LogOut className="h-5 w-5 flex-shrink-0" />
                    {!isCollapsed && "Sign Out"}
                  </button>
                </TooltipTrigger>
                {isCollapsed && (
                  <TooltipContent side="right" className="bg-popover text-popover-foreground">
                    Sign Out
                  </TooltipContent>
                )}
              </Tooltip>
            </div>
          </div>
        </aside>
      </TooltipProvider>
    </>
  );
};
