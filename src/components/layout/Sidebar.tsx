import { NavLink, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
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
  CalendarDays,
  ClipboardCheck,
  Database,
  UserCheck,
  History,
  MapPin,
  MessageSquare,
  IdCard,
  Mail,
  Presentation,
  AlertTriangle,
  FileWarning,
  Bell,
  UserRound
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { getRoleDisplayName } from '@/lib/roleUtils';
import { PrivateMessageBox } from '@/components/chat/PrivateMessageBox';
import { canViewDiscrepancyNotifications, canViewNotifications } from '@/lib/notificationUtils';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar = ({ isOpen, onClose }: SidebarProps) => {
  const { userRole, signOut, user } = useAuth();
  const { selectedBranch } = useBranch();
  const location = useLocation();
  const isAdmin = userRole === 'admin';
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [currentDateTime, setCurrentDateTime] = useState(new Date());
  const [isDMOpen, setIsDMOpen] = useState(false);
  const allSignedInRoles = ['admin', 'staff', 'viewer', 'teamleader', 'uploader', 'oic', 'encoder', 'assistant', 'hr'];

  // Fetch unread DM count
  const { data: unreadDMCount = 0 } = useQuery({
    queryKey: ['unread-dm-count', user?.id],
    queryFn: async () => {
      if (!user?.id) return 0;
      const { count, error } = await supabase
        .from('private_messages')
        .select('*', { count: 'exact', head: true })
        .eq('recipient_id', user.id)
        .eq('is_read', false);
      
      if (error) return 0;
      return count || 0;
    },
    enabled: !!user?.id,
    refetchInterval: 10000,
  });

  const { data: notificationBadgeCount = 0 } = useQuery({
    queryKey: ['sidebar-notification-count', user?.id, userRole, selectedBranch?.id],
    queryFn: async () => {
      if (!user?.id || !canViewNotifications(userRole)) return 0;

      const { data: notifications } = await supabase
        .from('notifications')
        .select('id, is_read, title')
        .eq('user_id', user.id);

      const unreadRegularCount = (notifications || []).filter(
        (notification) => !notification.is_read && notification.title !== 'History Issue Reported'
      ).length;

      let discrepancyCount = 0;
      if (canViewDiscrepancyNotifications(userRole)) {
        let query = supabase
          .from('discrepancies')
          .select('id', { count: 'exact', head: true })
          .is('deleted_at', null)
          .or('resolution_status.is.null,resolution_status.neq.resolved');

        if (selectedBranch?.id) {
          query = query.eq('branch_id', selectedBranch.id);
        }

        const { count } = await query;
        discrepancyCount = count || 0;
      }

      return unreadRegularCount + discrepancyCount;
    },
    enabled: !!user?.id && canViewNotifications(userRole),
    refetchInterval: 10000,
  });

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
      to: '/reports',
      icon: Presentation, 
      label: 'Bulletin Report',
      roles: ['admin', 'staff', 'uploader', 'teamleader', 'oic', 'hr', 'assistant']
    },
    { 
      to: '/dashboard', 
      icon: LayoutDashboard, 
      label: 'Dashboard',
      roles: ['admin', 'staff', 'viewer', 'teamleader', 'uploader', 'oic', 'encoder', 'assistant']
    },
    { 
      to: '/release', 
      icon: PackagePlus, 
      label: 'OUT WAREHOUSE DELIVERY',
      roles: ['admin', 'staff', 'encoder', 'assistant']
    },
    { 
      to: '/deliveries', 
      icon: Truck, 
      label: 'Deliveries',
      roles: ['admin', 'staff', 'viewer', 'teamleader', 'uploader', 'oic', 'encoder', 'assistant']
    },
    { 
      to: '/history', 
      icon: ClipboardList, 
      label: 'History',
      roles: ['admin', 'staff', 'viewer', 'teamleader', 'uploader', 'oic', 'encoder', 'assistant']
    },
    { 
      to: '/summary', 
      icon: BarChart3, 
      label: 'Summary Report',
      roles: ['admin', 'staff', 'teamleader', 'uploader', 'oic', 'encoder', 'hr', 'assistant']
    },
    { 
      to: '/damage-claims',
      icon: AlertTriangle, 
      label: 'Damage Claims',
      roles: ['admin', 'staff', 'encoder', 'assistant', 'viewer', 'teamleader', 'uploader', 'oic']
    },
    { 
      to: '/discrepancies',
      icon: FileWarning, 
      label: 'Discrepancy',
      roles: ['admin', 'staff', 'encoder', 'assistant', 'viewer', 'teamleader', 'oic', 'hr']
    },
    // { 
    //   to: '/import', 
    //   icon: Archive, 
    //   label: 'Bucket',
    //   roles: ['admin', 'uploader']
    // },
    { 
      to: '/task-calendar', 
      icon: CalendarDays, 
      label: 'Task Calendar',
      roles: ['admin', 'staff', 'viewer', 'teamleader', 'uploader', 'oic', 'assistant']
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
      roles: ['admin', 'uploader', 'assistant']
    },
    { 
      to: '/manpower', 
      icon: Database, 
      label: 'Manpower Database',
      roles: ['admin', 'staff', 'uploader', 'teamleader', 'oic', 'hr', 'assistant']
    },
    { 
      to: '/renewal', 
      icon: IdCard, 
      label: 'Renewal',
      roles: ['admin', 'staff', 'hr', 'assistant']
    },
    // { 
    //   to: '/store-visit-schedule', 
    //   icon: MapPin, 
    //   label: 'Store Visit Schedule',
    //   roles: ['admin', 'staff', 'uploader', 'teamleader', 'oic']
    // },
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
    { 
      to: '/activity-history',
      icon: History, 
      label: 'Activity History',
      roles: ['admin']
    },
    {
      to: '/notifications',
      icon: Bell,
      label: 'Notifications',
      roles: ['admin', 'assistant', 'staff', 'oic', 'teamleader', 'uploader', 'hr', 'encoder']
    },
    {
      to: '/profile',
      icon: UserRound,
      label: 'User Profile',
      roles: allSignedInRoles
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
                      "flex w-full items-center rounded-lg bg-primary text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90",
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
                  const itemBadgeCount = item.to === '/notifications' ? notificationBadgeCount : 0;
                  const navLink = (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      onClick={onClose}
                      className={cn(
                        "relative flex items-center rounded-lg bg-primary text-sm font-medium text-primary-foreground shadow-sm transition-all duration-200 hover:bg-primary/90",
                        isCollapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5",
                        isActive && "ring-1 ring-primary-foreground/35"
                      )}
                    >
                      {item.icon && (
                        <item.icon className="h-5 w-5 flex-shrink-0 text-primary-foreground" />
                      )}
                      {!isCollapsed && <span className="flex-1">{item.label}</span>}
                      {!isCollapsed && itemBadgeCount > 0 && (
                        <Badge className="h-5 min-w-5 justify-center bg-primary-foreground px-1.5 text-[11px] text-primary hover:bg-primary-foreground">
                          {itemBadgeCount > 99 ? '99+' : itemBadgeCount}
                        </Badge>
                      )}
                      {isCollapsed && itemBadgeCount > 0 && (
                        <Badge className="absolute -right-1 -top-1 h-4 min-w-4 justify-center bg-primary-foreground px-1 text-[10px] text-primary hover:bg-primary-foreground">
                          {itemBadgeCount > 9 ? '9+' : itemBadgeCount}
                        </Badge>
                      )}
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

                {/* Direct Messages Button */}
                <div className="mt-2 pt-2 border-t border-sidebar-border/50">
                  {isCollapsed ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => setIsDMOpen(true)}
                          className={cn(
                            "relative flex w-full items-center justify-center rounded-lg bg-primary px-2 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-all duration-200 hover:bg-primary/90"
                          )}
                        >
                          <Mail className="h-5 w-5 flex-shrink-0 text-primary-foreground" />
                          {unreadDMCount > 0 && (
                            <Badge 
                              variant="destructive" 
                              className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center text-[10px]"
                            >
                              {unreadDMCount > 9 ? '9+' : unreadDMCount}
                            </Badge>
                          )}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="bg-popover text-popover-foreground">
                        Direct Messages {unreadDMCount > 0 && `(${unreadDMCount})`}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <button
                      onClick={() => setIsDMOpen(true)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-all duration-200 hover:bg-primary/90"
                      )}
                    >
                      <Mail className="h-5 w-5 flex-shrink-0 text-primary-foreground" />
                      <span className="flex-1 text-left">Direct Messages</span>
                      {unreadDMCount > 0 && (
                        <Badge variant="destructive" className="h-5 min-w-5 flex items-center justify-center text-xs">
                          {unreadDMCount > 99 ? '99+' : unreadDMCount}
                        </Badge>
                      )}
                    </button>
                  )}
                </div>
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
                <NavLink
                  to="/profile"
                  onClick={onClose}
                  className="block rounded-lg bg-primary p-3 text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
                >
                  <p className="text-sm font-medium truncate">{user?.email}</p>
                  <p className="text-xs text-primary-foreground/80">{getRoleDisplayName(userRole)}</p>
                </NavLink>
              )}
            </div>
          </div>
        </aside>
      </TooltipProvider>

      {/* Private Messages Modal */}
      <PrivateMessageBox isOpen={isDMOpen} onClose={() => setIsDMOpen(false)} />
    </>
  );
};
