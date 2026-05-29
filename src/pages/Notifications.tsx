import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, formatDistanceToNow } from 'date-fns';
import {
  AlertTriangle,
  Bell,
  CheckCheck,
  CheckCircle2,
  Circle,
  Clock3,
  Inbox,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { useToast } from '@/hooks/use-toast';
import { DISCREPANCIES_CHANGED_EVENT } from '@/lib/discrepancyEvents';
import { canViewDiscrepancyNotifications, canViewNotifications } from '@/lib/notificationUtils';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type NotificationRow = Database['public']['Tables']['notifications']['Row'];

interface DiscrepancyPreview {
  id: string;
  allocation_bill: string | null;
  destination: string | null;
  discrepancy_notes: string | null;
  created_at: string;
}

const stripHtml = (value: string) => value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

const categoryLabel = (value: string | null | undefined) => {
  if (!value) return 'General';
  return value
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
};

const Notifications = () => {
  const { user, userRole } = useAuth();
  const { selectedBranch } = useBranch();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [stateFilter, setStateFilter] = useState<'all' | 'unread' | 'read'>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const canViewDiscrepancies = canViewDiscrepancyNotifications(userRole);

  const notificationsQuery = useQuery({
    queryKey: ['notifications-page', user?.id],
    queryFn: async () => {
      if (!user?.id) return [] as NotificationRow[];

      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as NotificationRow[];
    },
    enabled: !!user?.id && canViewNotifications(userRole),
  });

  const discrepanciesQuery = useQuery({
    queryKey: ['notification-discrepancies', selectedBranch?.id],
    queryFn: async () => {
      let query = supabase
        .from('discrepancies')
        .select('id, allocation_bill, destination, discrepancy_notes, created_at', { count: 'exact' })
        .is('deleted_at', null)
        .or('resolution_status.is.null,resolution_status.neq.resolved')
        .order('created_at', { ascending: false })
        .limit(25);

      if (selectedBranch?.id) {
        query = query.eq('branch_id', selectedBranch.id);
      }

      const { data, count, error } = await query;
      if (error) throw error;
      return {
        count: count || 0,
        rows: (data || []) as DiscrepancyPreview[],
      };
    },
    enabled: !!user?.id && canViewDiscrepancies,
  });

  const invalidateNotifications = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['notifications-page'] });
    queryClient.invalidateQueries({ queryKey: ['notification-discrepancies'] });
    queryClient.invalidateQueries({ queryKey: ['sidebar-notification-count'] });
  }, [queryClient]);

  useEffect(() => {
    if (!user?.id || !canViewNotifications(userRole)) return;

    const handleDiscrepanciesChanged = () => invalidateNotifications();
    window.addEventListener(DISCREPANCIES_CHANGED_EVENT, handleDiscrepanciesChanged);

    const channel = supabase
      .channel('notifications-page-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        invalidateNotifications
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'discrepancies',
        },
        invalidateNotifications
      )
      .subscribe();

    return () => {
      window.removeEventListener(DISCREPANCIES_CHANGED_EVENT, handleDiscrepanciesChanged);
      supabase.removeChannel(channel);
    };
  }, [invalidateNotifications, user?.id, userRole]);

  const notifications = notificationsQuery.data || [];
  const discrepancyRows = discrepanciesQuery.data?.rows || [];
  const activeDiscrepancyCount = canViewDiscrepancies ? discrepanciesQuery.data?.count || 0 : 0;
  const unreadCount = notifications.filter((notification) => !notification.is_read).length;
  const totalSignals = notifications.length + activeDiscrepancyCount;

  const categories = useMemo(() => {
    const values = new Set<string>();
    if (activeDiscrepancyCount > 0) values.add('discrepancy');
    notifications.forEach((notification) => values.add(notification.type || 'general'));
    return Array.from(values).sort();
  }, [activeDiscrepancyCount, notifications]);

  const filteredNotifications = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return notifications.filter((notification) => {
      const type = notification.type || 'general';
      const cleanMessage = stripHtml(notification.message || '').toLowerCase();
      const matchesSearch = !query ||
        notification.title.toLowerCase().includes(query) ||
        cleanMessage.includes(query) ||
        type.toLowerCase().includes(query);
      const matchesState = stateFilter === 'all' ||
        (stateFilter === 'unread' && !notification.is_read) ||
        (stateFilter === 'read' && notification.is_read);
      const matchesCategory = categoryFilter === 'all' || categoryFilter === type;

      return matchesSearch && matchesState && matchesCategory;
    });
  }, [categoryFilter, notifications, searchQuery, stateFilter]);

  const filteredDiscrepancies = useMemo(() => {
    if (!canViewDiscrepancies || stateFilter === 'read') return [];
    if (categoryFilter !== 'all' && categoryFilter !== 'discrepancy') return [];

    const query = searchQuery.trim().toLowerCase();
    return discrepancyRows.filter((item) => {
      if (!query) return true;
      return [
        item.allocation_bill || '',
        item.destination || '',
        item.discrepancy_notes || '',
      ].some((value) => value.toLowerCase().includes(query));
    });
  }, [canViewDiscrepancies, categoryFilter, discrepancyRows, searchQuery, stateFilter]);

  const markAllAsRead = async () => {
    if (!user?.id) return;

    const unreadIds = notifications.filter((notification) => !notification.is_read).map((notification) => notification.id);
    if (unreadIds.length === 0) return;

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .in('id', unreadIds);

    if (error) {
      toast({ title: 'Notification Error', description: error.message, variant: 'destructive' });
      return;
    }

    invalidateNotifications();
  };

  const markNotificationAsRead = async (notificationId: string) => {
    if (!user?.id) return;

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId)
      .eq('user_id', user.id);

    if (error) {
      toast({ title: 'Notification Error', description: error.message, variant: 'destructive' });
      return;
    }

    invalidateNotifications();
  };

  const clearAll = async () => {
    if (!user?.id || notifications.length === 0) return;

    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('user_id', user.id);

    if (error) {
      toast({ title: 'Notification Error', description: error.message, variant: 'destructive' });
      return;
    }

    invalidateNotifications();
  };

  const openNotification = async (notification: NotificationRow) => {
    await supabase
      .from('notifications')
      .delete()
      .eq('id', notification.id)
      .eq('user_id', user?.id || '');

    invalidateNotifications();

    if (notification.link) {
      navigate(notification.link);
    }
  };

  if (!canViewNotifications(userRole)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <ShieldCheck className="mx-auto h-10 w-10 text-muted-foreground" />
          <h2 className="mt-4 text-xl font-semibold">Notifications unavailable</h2>
          <p className="mt-2 text-sm text-muted-foreground">Your role does not have notification access.</p>
        </div>
      </div>
    );
  }

  const loading = notificationsQuery.isLoading || discrepanciesQuery.isLoading;

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-6">
      <div className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <Bell className="h-7 w-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-semibold tracking-tight">Notifications</h2>
              <Badge className="bg-primary text-primary-foreground hover:bg-primary">{totalSignals} total</Badge>
              {unreadCount > 0 && <Badge variant="secondary">{unreadCount} new</Badge>}
            </div>
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Work updates, discrepancy reports, and system messages
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {notifications.length > 0 && (
            <Button variant="outline" onClick={markAllAsRead} disabled={unreadCount === 0} className="gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Mark all as read
            </Button>
          )}
          {notifications.length > 0 && (
            <Button variant="outline" onClick={clearAll} className="gap-2 text-destructive hover:text-destructive">
              <Trash2 className="h-4 w-4" />
              Clear all
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={invalidateNotifications} title="Refresh notifications">
            <RotateCcw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Card className="rounded-lg">
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Total Signals</p>
              <p className="mt-2 text-3xl font-bold">{totalSignals}</p>
            </div>
            <Inbox className="h-7 w-7 text-muted-foreground" />
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Unread Updates</p>
              <p className="mt-2 text-3xl font-bold">{unreadCount}</p>
            </div>
            <Circle className="h-7 w-7 text-primary" />
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Active Events</p>
              <p className="mt-2 text-3xl font-bold">{activeDiscrepancyCount}</p>
            </div>
            <AlertTriangle className="h-7 w-7 text-destructive" />
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Filter stream by title or content..."
            className="h-11 pl-9"
          />
        </div>
        <Select value={stateFilter} onValueChange={(value: 'all' | 'unread' | 'read') => setStateFilter(value)}>
          <SelectTrigger className="h-11 w-full md:w-[180px]">
            <SelectValue placeholder="All states" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All States</SelectItem>
            <SelectItem value="unread">Unread</SelectItem>
            <SelectItem value="read">Read</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="h-11 w-full md:w-[210px]">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category} value={category}>
                {categoryLabel(category)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="ghost"
          onClick={() => {
            setSearchQuery('');
            setStateFilter('all');
            setCategoryFilter('all');
          }}
          className="gap-2"
        >
          <RotateCcw className="h-4 w-4" />
          Reset
        </Button>
      </div>

      <ScrollArea className="h-[calc(100vh-370px)] min-h-[420px] rounded-lg border bg-card">
        {loading ? (
          <div className="flex h-[360px] items-center justify-center text-muted-foreground">
            <RotateCcw className="mr-2 h-5 w-5 animate-spin" />
            Loading notifications...
          </div>
        ) : filteredNotifications.length === 0 && filteredDiscrepancies.length === 0 ? (
          <div className="flex h-[360px] flex-col items-center justify-center text-muted-foreground">
            <Bell className="mb-4 h-12 w-12 opacity-40" />
            <p className="text-base font-medium">No notifications found</p>
          </div>
        ) : (
          <div className="divide-y">
            {filteredDiscrepancies.map((item) => (
              <button
                key={`discrepancy-${item.id}`}
                type="button"
                onClick={() => navigate('/discrepancies')}
                className="grid w-full gap-4 p-5 text-left transition-colors hover:bg-muted/50 lg:grid-cols-[1fr_220px]"
              >
                <div className="flex gap-4">
                  <div className="mt-1 flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-destructive text-destructive-foreground">
                    <AlertTriangle className="h-6 w-6" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">Active discrepancy report</h3>
                      <Badge variant="destructive">Discrepancy</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {(item.allocation_bill || 'No allocation')}{item.destination ? ` - ${item.destination}` : ''}
                    </p>
                    <p className="mt-2 line-clamp-2 text-sm">
                      {item.discrepancy_notes || 'No discrepancy notes provided'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground lg:justify-end">
                  <span className="flex items-center gap-2">
                    <Clock3 className="h-4 w-4" />
                    {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                  </span>
                  <Badge variant="outline">{format(new Date(item.created_at), 'MMM d, h:mm a')}</Badge>
                </div>
              </button>
            ))}

            {filteredNotifications.map((notification) => {
              const cleanMessage = stripHtml(notification.message || '');
              const isUnread = !notification.is_read;

              return (
                <div
                  key={notification.id}
                  className={cn(
                    'grid w-full gap-4 p-5 text-left transition-colors hover:bg-muted/50 lg:grid-cols-[1fr_220px]',
                    isUnread && 'bg-primary/5'
                  )}
                >
                  <button
                    type="button"
                    onClick={() => openNotification(notification)}
                    className="flex min-w-0 gap-4 text-left"
                  >
                    <div className={cn(
                      'mt-1 flex h-12 w-12 shrink-0 items-center justify-center rounded-lg',
                      isUnread ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground'
                    )}>
                      <Bell className="h-6 w-6" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">{notification.title}</h3>
                        {isUnread && <Badge>New</Badge>}
                        <Badge variant="outline">{categoryLabel(notification.type)}</Badge>
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                        {cleanMessage || 'No details provided'}
                      </p>
                    </div>
                  </button>
                  <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground lg:flex-col lg:items-end lg:justify-center">
                    <span className="flex items-center gap-2">
                      <Clock3 className="h-4 w-4" />
                      {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                    </span>
                    <Badge variant="outline">{format(new Date(notification.created_at), 'MMM d, h:mm a')}</Badge>
                    {isUnread && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => markNotificationAsRead(notification.id)}
                        className="gap-2"
                      >
                        <CheckCheck className="h-4 w-4" />
                        Mark as read
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
};

export default Notifications;
