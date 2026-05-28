import { useCallback, useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { supabase } from '@/integrations/supabase/client';
import { DISCREPANCIES_CHANGED_EVENT } from '@/lib/discrepancyEvents';
import { canViewDiscrepancyNotifications, canViewNotifications } from '@/lib/notificationUtils';

export const NotificationBell = () => {
  const { user, userRole } = useAuth();
  const { selectedBranch } = useBranch();
  const navigate = useNavigate();
  const [badgeCount, setBadgeCount] = useState(0);

  const fetchBadgeCount = useCallback(async () => {
    if (!user?.id || !canViewNotifications(userRole)) {
      setBadgeCount(0);
      return;
    }

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

    setBadgeCount(unreadRegularCount + discrepancyCount);
  }, [selectedBranch?.id, user?.id, userRole]);

  useEffect(() => {
    if (!user?.id || !canViewNotifications(userRole)) return;

    fetchBadgeCount();

    const handleDiscrepanciesChanged = () => fetchBadgeCount();
    window.addEventListener(DISCREPANCIES_CHANGED_EVENT, handleDiscrepanciesChanged);

    const channel = supabase
      .channel('notification-badge-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        fetchBadgeCount
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'discrepancies',
        },
        fetchBadgeCount
      )
      .subscribe();

    const refreshTimer = window.setInterval(fetchBadgeCount, 15000);

    return () => {
      window.removeEventListener(DISCREPANCIES_CHANGED_EVENT, handleDiscrepanciesChanged);
      window.clearInterval(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, [fetchBadgeCount, user?.id, userRole]);

  if (!canViewNotifications(userRole)) return null;

  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative h-11 w-11"
      onClick={() => navigate('/notifications')}
      title="Notifications"
    >
      <Bell className="h-5 w-5" />
      {badgeCount > 0 && (
        <Badge className="absolute -top-1 -right-1 h-5 min-w-5 flex items-center justify-center px-1 text-[11px] bg-red-500 hover:bg-red-500">
          {badgeCount > 99 ? '99+' : badgeCount}
        </Badge>
      )}
    </Button>
  );
};
