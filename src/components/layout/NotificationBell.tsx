import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import type { UserRole } from '@/types/inventory';
import { DISCREPANCIES_CHANGED_EVENT } from '@/lib/discrepancyEvents';

const NOTIFICATION_VISIBLE_ROLES: UserRole[] = [
  'admin',
  'assistant',
  'staff',
  'oic',
  'teamleader',
  'uploader',
  'hr',
  'encoder',
];

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  link: string | null;
  created_at: string;
}

interface DiscrepancyPreview {
  id: string;
  allocation_bill: string | null;
  destination: string | null;
  discrepancy_notes: string | null;
  created_at: string;
}

export const NotificationBell = () => {
  const { user, userRole } = useAuth();
  const { selectedBranch } = useBranch();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [discrepancyCount, setDiscrepancyCount] = useState(0);
  const [discrepancies, setDiscrepancies] = useState<DiscrepancyPreview[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const canViewDiscrepancyReports = userRole === 'admin' || userRole === 'assistant';
  const unreadCount = notifications.filter(n => !n.is_read).length;
  const unreadRegularCount = notifications.filter(n => !n.is_read && n.title !== 'History Issue Reported').length;
  const activeDiscrepancyCount = canViewDiscrepancyReports ? discrepancyCount : 0;
  const badgeCount = activeDiscrepancyCount + unreadRegularCount;

  // Fetch notifications
  const fetchNotifications = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);

    if (!error && data) {
      setNotifications(data);
    }
  };

  const fetchDiscrepancyReports = useCallback(async () => {
    if (!user?.id) return;
    if (!canViewDiscrepancyReports) {
      setDiscrepancyCount(0);
      setDiscrepancies([]);
      return;
    }

    let query = supabase
      .from('discrepancies')
      .select('id, allocation_bill, destination, discrepancy_notes, created_at', { count: 'exact' })
      .is('deleted_at', null)
      .or('resolution_status.is.null,resolution_status.neq.resolved')
      .order('created_at', { ascending: false })
      .limit(5);

    if (selectedBranch?.id) {
      query = query.eq('branch_id', selectedBranch.id);
    }

    const { data, count, error } = await query;
    if (!error) {
      setDiscrepancyCount(count || 0);
      setDiscrepancies((data || []) as DiscrepancyPreview[]);
    }
  }, [canViewDiscrepancyReports, selectedBranch?.id, user?.id]);

  // Mark notification as read
  const markAsRead = async (id: string) => {
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id);

    setNotifications(prev =>
      prev.map(n => (n.id === id ? { ...n, is_read: true } : n))
    );
  };

  // Mark all as read
  const markAllAsRead = async () => {
    const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
    if (unreadIds.length === 0) return;

    await supabase
      .from('notifications')
      .update({ is_read: true })
      .in('id', unreadIds);

    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  // Handle notification click
  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.is_read) {
      await markAsRead(notification.id);
    }
    if (notification.link) {
      navigate(notification.link);
      setIsOpen(false);
    }
  };

  // Clear all notifications
  const clearAll = async () => {
    await supabase
      .from('notifications')
      .delete()
      .eq('user_id', user?.id);

    setNotifications([]);
  };

  useEffect(() => {
    if (!user?.id) return;

    fetchNotifications();
    fetchDiscrepancyReports();

    const handleDiscrepanciesChanged = () => {
      fetchDiscrepancyReports();
    };
    window.addEventListener(DISCREPANCIES_CHANGED_EVENT, handleDiscrepanciesChanged);

    // Subscribe to realtime notifications
    const channel = supabase
      .channel('notifications-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          setNotifications(prev => [payload.new as Notification, ...prev]);
          fetchDiscrepancyReports();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'discrepancies',
        },
        () => {
          fetchDiscrepancyReports();
        }
      )
      .subscribe();

    const refreshTimer = window.setInterval(fetchDiscrepancyReports, 15000);

    return () => {
      window.removeEventListener(DISCREPANCIES_CHANGED_EVENT, handleDiscrepanciesChanged);
      window.clearInterval(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, [fetchDiscrepancyReports, selectedBranch?.id, user?.id]);

  useEffect(() => {
    if (!isOpen || !user?.id) return;
    fetchNotifications();
    fetchDiscrepancyReports();
  }, [fetchDiscrepancyReports, isOpen, selectedBranch?.id, user?.id]);

  if (!userRole || !NOTIFICATION_VISIBLE_ROLES.includes(userRole)) return null;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {badgeCount > 0 && (
            <Badge 
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs bg-red-500 hover:bg-red-500"
            >
              {badgeCount > 9 ? '9+' : badgeCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between p-3 border-b">
          <h4 className="font-semibold">Notifications</h4>
          <div className="flex gap-1">
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" className="text-xs h-7" onClick={markAllAsRead}>
                Mark all read
              </Button>
            )}
            {notifications.length > 0 && (
              <Button variant="ghost" size="sm" className="text-xs h-7 text-destructive" onClick={clearAll}>
                Clear all
              </Button>
            )}
          </div>
        </div>
        <ScrollArea className="h-[300px]">
          {notifications.length === 0 && activeDiscrepancyCount === 0 ? (
            <div className="flex flex-col items-center justify-center h-[200px] text-muted-foreground">
              <Bell className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">No notifications</p>
            </div>
          ) : (
            <div className="divide-y">
              {canViewDiscrepancyReports && discrepancyCount > 0 && (
                <div className="bg-destructive/5">
                  <div
                    className="p-3 cursor-pointer hover:bg-destructive/10 transition-colors"
                    onClick={() => {
                      navigate('/discrepancies');
                      setIsOpen(false);
                    }}
                  >
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-destructive">
                          {discrepancyCount} active discrepancy report{discrepancyCount > 1 ? 's' : ''}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Reports are shown below. Resolved reports are removed from this count.
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="px-3 pb-3 space-y-1.5">
                    {discrepancies.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="w-full rounded-md border bg-background/80 p-2 text-left hover:bg-background transition-colors"
                        onClick={() => {
                          navigate('/discrepancies');
                          setIsOpen(false);
                        }}
                      >
                        <p className="text-xs font-medium truncate">
                          {item.allocation_bill || 'No allocation'} {item.destination ? `- ${item.destination}` : ''}
                        </p>
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                          {item.discrepancy_notes || 'No discrepancy notes'}
                        </p>
                        <p className="text-[11px] text-muted-foreground/70 mt-1">
                          {format(new Date(item.created_at), 'MMM d, h:mm a')}
                        </p>
                      </button>
                    ))}
                    {discrepancyCount > discrepancies.length && (
                      <button
                        type="button"
                        className="w-full text-left text-xs font-medium text-destructive hover:underline"
                        onClick={() => {
                          navigate('/discrepancies');
                          setIsOpen(false);
                        }}
                      >
                        View {discrepancyCount - discrepancies.length} more in Discrepancy
                      </button>
                    )}
                  </div>
                </div>
              )}
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`p-3 cursor-pointer hover:bg-muted/50 transition-colors ${
                    !notification.is_read ? 'bg-primary/5' : ''
                  }`}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className="flex items-start gap-2">
                    {!notification.is_read && (
                      <div className="h-2 w-2 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${!notification.is_read ? 'font-medium' : ''}`}>
                        {notification.title}
                      </p>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                        {notification.message}
                      </p>
                      <p className="text-xs text-muted-foreground/70 mt-1">
                        {format(new Date(notification.created_at), 'MMM d, h:mm a')}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};
