import { NavLink, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { format } from 'date-fns';
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
  Heart,
  Container,
  RefreshCcw,
  LayoutList,
  CalendarDays
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getRoleDisplayName } from '@/lib/roleUtils';

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
  const [currentDateTime, setCurrentDateTime] = useState(new Date());

  // Update date/time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDateTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

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
      roles: ['admin', 'staff', 'viewer', 'teamleader', 'uploader', 'oic']
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
      label: 'MONITORING',
      roles: ['admin', 'staff', 'viewer', 'teamleader', 'uploader', 'oic']
    },
    { 
      to: '/history', 
      icon: ClipboardList, 
      label: 'History',
      roles: ['admin', 'staff', 'viewer', 'teamleader', 'uploader', 'oic']
    },
    { 
      to: '/summary', 
      icon: BarChart3, 
      label: 'Summary Report',
      roles: ['admin', 'staff', 'teamleader', 'uploader', 'oic']
    },
    // { 
    //   to: '/import', 
    //   icon: Archive, 
    //   label: 'Bucket',
    //   roles: ['admin', 'uploader']
    // },
    { 
      to: '/notes', 
      icon: StickyNote, 
      label: 'Reminder',
      roles: ['admin', 'staff', 'uploader']
    },
    { 
      to: '/task-calendar', 
      icon: CalendarDays, 
      label: 'Task Calendar',
      roles: ['admin', 'staff', 'viewer', 'teamleader', 'uploader', 'oic']
    },
    // { 
    //   to: '/collections', 
    //   icon: FolderHeart, 
    //   label: 'Collection Items',
    //   roles: ['admin', 'staff', 'teamleader', 'uploader', 'oic']
    // },
    // { 
    //   to: '/favorites', 
    //   icon: Heart, 
    //   label: 'Favorites',
    //   roles: ['admin', 'staff', 'viewer', 'teamleader', 'uploader', 'oic']
    // },
    { 
      to: '/container', 
      icon: Container, 
      label: 'Container',
      roles: ['admin', 'uploader']
    },
    { 
      to: '/repeat-order', 
      icon: RefreshCcw, 
      label: 'Repeat Order',
      roles: ['admin', 'staff', 'uploader', 'teamleader', 'oic']
    },
    // { 
    //   to: '/allocation', 
    //   icon: LayoutList, 
    //   label: 'Allocation',
    //   roles: ['admin', 'staff', 'uploader', 'teamleader', 'oic']
    // },
    { 
      to: '/users', 
      icon: Users, 
      label: 'Manage Users',
      roles: ['admin']
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
                  <p className="text-xs text-sidebar-foreground/60">{getRoleDisplayName(userRole)} Panel</p>
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

            {/* Sign Out - Top */}
            <div className={cn("border-b border-sidebar-border", isCollapsed ? "p-2" : "p-4")}>
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

            {/* Navigation with ScrollArea */}
            <ScrollArea className="flex-1">
              <nav className={cn("space-y-1", isCollapsed ? "p-2" : "p-4")}>
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
            </ScrollArea>

            {/* Date & Time */}
            <div className={cn("border-t border-sidebar-border", isCollapsed ? "p-2" : "p-4")}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className={cn(
                    "rounded-lg bg-primary text-primary-foreground",
                    isCollapsed ? "p-2 flex justify-center" : "px-3 py-2"
                  )}>
                    {isCollapsed ? (
                      <span className="text-xs font-medium">{format(currentDateTime, 'HH:mm')}</span>
                    ) : (
                      <p className="text-sm font-medium">Date & Time</p>
                    )}
                    {!isCollapsed && (
                      <p className="text-xs text-primary-foreground/80">
                        {format(currentDateTime, 'MMMM dd, yyyy hh:mm:ss a')}
                      </p>
                    )}
                  </div>
                </TooltipTrigger>
                {isCollapsed && (
                  <TooltipContent side="right" className="bg-popover text-popover-foreground">
                    {format(currentDateTime, 'MMMM dd, yyyy hh:mm:ss a')}
                  </TooltipContent>
                )}
              </Tooltip>
            </div>

            {/* User info */}
            <div className={cn("border-t border-sidebar-border", isCollapsed ? "p-2" : "p-4")}>
              {!isCollapsed && (
                <div className="rounded-lg bg-sidebar-accent/50 p-3">
                  <p className="text-sm font-medium truncate">{user?.email}</p>
                  <p className="text-xs text-sidebar-foreground/60">{getRoleDisplayName(userRole)}</p>
                </div>
              )}
            </div>
          </div>
        </aside>
      </TooltipProvider>
    </>
  );
};
