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

  const removeNotification = async (id: string) => {
    if (!user?.id) return;

    await supabase
      .from('notifications')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    setNotifications(prev => prev.filter(n => n.id !== id));
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
    await removeNotification(notification.id);
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
      fetchNotifications();
      fetchDiscrepancyReports();
    };
    window.addEventListener(DISCREPANCIES_CHANGED_EVENT, handleDiscrepanciesChanged);

    // Subscribe to realtime notifications
    const channel = supabase
      .channel('notifications-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchNotifications();
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
        <Button variant="ghost" size="icon" className="relative h-[52px] w-[52px] min-h-[52px] min-w-[52px]">
          <Bell className="h-7 w-7" />
          {badgeCount > 0 && (
            <Badge 
              className="absolute -top-2 -right-2 h-7 min-w-7 flex items-center justify-center px-1.5 text-sm bg-red-500 hover:bg-red-500"
            >
              {badgeCount > 9 ? '9+' : badgeCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[520px] max-w-[calc(100vw-1rem)] p-0" align="end">
        <div className="flex items-center justify-between gap-3 p-5 border-b">
          <h4 className="font-semibold text-xl">Notifications</h4>
          <div className="flex gap-1">
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" className="text-sm h-9 px-3" onClick={markAllAsRead}>
                Mark all read
              </Button>
            )}
            {notifications.length > 0 && (
              <Button variant="ghost" size="sm" className="text-sm h-9 px-3 text-destructive" onClick={clearAll}>
                Clear all
              </Button>
            )}
          </div>
        </div>
        <ScrollArea className="h-[560px] max-h-[70vh]">
          {notifications.length === 0 && activeDiscrepancyCount === 0 ? (
            <div className="flex flex-col items-center justify-center h-[360px] text-muted-foreground">
              <Bell className="h-14 w-14 mb-4 opacity-50" />
              <p className="text-lg">No notifications</p>
            </div>
          ) : (
            <div className="divide-y">
              {canViewDiscrepancyReports && discrepancyCount > 0 && (
                <div className="bg-destructive/5">
                  <div
                    className="p-5 cursor-pointer hover:bg-destructive/10 transition-colors"
                    onClick={() => {
                      navigate('/discrepancies');
                      setIsOpen(false);
                    }}
                  >
                    <div className="flex items-start gap-4">
                      <AlertTriangle className="h-6 w-6 text-destructive mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-lg font-semibold text-destructive">
                          {discrepancyCount} active discrepancy report{discrepancyCount > 1 ? 's' : ''}
                        </p>
                        <p className="text-base text-muted-foreground mt-1">
                          Reports are shown below. Resolved reports are removed from this count.
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="px-5 pb-5 space-y-3">
                    {discrepancies.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="w-full rounded-md border bg-background/80 p-4 text-left hover:bg-background transition-colors"
                        onClick={() => {
                          navigate('/discrepancies');
                          setIsOpen(false);
                        }}
                      >
                        <p className="text-base font-medium truncate">
                          {item.allocation_bill || 'No allocation'} {item.destination ? `- ${item.destination}` : ''}
                        </p>
                        <p className="text-base text-muted-foreground line-clamp-2 mt-1.5">
                          {item.discrepancy_notes || 'No discrepancy notes'}
                        </p>
                        <p className="text-sm text-muted-foreground/70 mt-2">
                          {format(new Date(item.created_at), 'MMM d, h:mm a')}
                        </p>
                      </button>
                    ))}
                    {discrepancyCount > discrepancies.length && (
                      <button
                        type="button"
                        className="w-full text-left text-sm font-medium text-destructive hover:underline"
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
                  className={`p-5 cursor-pointer hover:bg-muted/50 transition-colors ${
                    !notification.is_read ? 'bg-primary/5' : ''
                  }`}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className="flex items-start gap-4">
                    {!notification.is_read && (
                      <div className="h-3 w-3 rounded-full bg-primary mt-2.5 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className={`text-lg ${!notification.is_read ? 'font-medium' : ''}`}>
                        {notification.title}
                      </p>
                      <p className="text-base text-muted-foreground line-clamp-3 mt-1.5">
                        {notification.message}
                      </p>
                      <p className="text-sm text-muted-foreground/70 mt-2">
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
