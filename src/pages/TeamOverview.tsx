import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, isToday } from 'date-fns';
import { Activity, CalendarDays, FileText, Filter, RefreshCw, Search, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

interface ActivityLog {
  id: string;
  user_id: string;
  user_email: string | null;
  user_name: string | null;
  action_type: string;
  module: string | null;
  description: string | null;
  metadata: Json | null;
  created_at: string;
}

const ACTION_TYPES = ['create', 'update', 'delete', 'login', 'logout', 'import', 'export'];
const MODULES = ['deliveries', 'pending_allocations', 'stock_releases', 'inventory', 'attendance', 'manpower', 'notes', 'repeat_orders', 'containers', 'auth'];
const ALLOWED_ROLES = ['admin', 'assistant', 'teamleader', 'oic'];

const formatLabel = (value: string | null | undefined) => {
  if (!value) return '-';
  return value.replace(/_/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase());
};

const getMetadata = (metadata: Json | null) => {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {} as Record<string, Json | undefined>;
  return metadata as Record<string, Json | undefined>;
};

const getActionBadgeVariant = (action: string) => {
  switch (action) {
    case 'delete':
      return 'destructive' as const;
    case 'update':
      return 'secondary' as const;
    case 'import':
    case 'create':
      return 'secondary' as const;
    default:
      return 'outline' as const;
  }
};

const TeamOverview = () => {
  const { userRole } = useAuth();
  const { selectedBranch } = useBranch();
  const queryClient = useQueryClient();
  const roleReady = Boolean(userRole);
  const canViewPage = roleReady && ALLOWED_ROLES.includes(userRole || '');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedModule, setSelectedModule] = useState('all');
  const [selectedAction, setSelectedAction] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['team-overview-activity'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activity_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1500);

      if (error) throw error;
      return (data || []) as ActivityLog[];
    },
    enabled: canViewPage,
  });

  const { data: branchUsers = [] } = useQuery({
    queryKey: ['team-overview-users', selectedBranch?.id],
    queryFn: async () => {
      let query = supabase
        .from('profiles')
        .select('id, email, full_name, branch_id')
        .order('full_name');

      if (selectedBranch?.id) {
        query = query.eq('branch_id', selectedBranch.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: canViewPage,
  });

  useEffect(() => {
    if (!canViewPage) return;

    const channel = supabase
      .channel('team-overview-activity-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'activity_logs',
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['team-overview-activity'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [canViewPage, queryClient]);

  const branchLogs = useMemo(() => {
    if (!selectedBranch) return logs;

    const branchName = selectedBranch.name.toLowerCase();
    const branchUserIds = new Set(branchUsers.map((profile) => profile.id));

    return logs.filter((log) => {
      const metadata = getMetadata(log.metadata);
      const metadataBranchId = typeof metadata.branch_id === 'string' ? metadata.branch_id : '';
      const metadataBranch = typeof metadata.branch === 'string' ? metadata.branch.toLowerCase() : '';

      return metadataBranchId === selectedBranch.id || metadataBranch === branchName || branchUserIds.has(log.user_id);
    });
  }, [branchUsers, logs, selectedBranch]);

  const filteredLogs = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return branchLogs.filter((log) => {
      const metadata = getMetadata(log.metadata);
      const allocationBills = Array.isArray(metadata.allocation_bills)
        ? metadata.allocation_bills.join(' ')
        : '';
      const matchesSearch = !term ||
        log.user_email?.toLowerCase().includes(term) ||
        log.user_name?.toLowerCase().includes(term) ||
        log.description?.toLowerCase().includes(term) ||
        log.module?.toLowerCase().includes(term) ||
        allocationBills.toLowerCase().includes(term);
      const matchesModule = selectedModule === 'all' || log.module === selectedModule;
      const matchesAction = selectedAction === 'all' || log.action_type === selectedAction;
      const createdAt = new Date(log.created_at);
      const matchesDateFrom = !dateFrom || createdAt >= new Date(dateFrom);
      const matchesDateTo = !dateTo || createdAt <= new Date(`${dateTo}T23:59:59`);

      return matchesSearch && matchesModule && matchesAction && matchesDateFrom && matchesDateTo;
    });
  }, [branchLogs, dateFrom, dateTo, searchTerm, selectedAction, selectedModule]);

  const todayCount = filteredLogs.filter((log) => isToday(new Date(log.created_at))).length;
  const importCount = filteredLogs.filter((log) => log.action_type === 'import').length;
  const deleteCount = filteredLogs.filter((log) => log.action_type === 'delete').length;
  const activeUsers = new Set(filteredLogs.map((log) => log.user_id)).size;

  const resetFilters = () => {
    setSearchTerm('');
    setSelectedModule('all');
    setSelectedAction('all');
    setDateFrom('');
    setDateTo('');
  };

  if (!roleReady) {
    return (
      <div className="flex min-h-[420px] items-center justify-center text-sm text-muted-foreground">
        Loading team overview...
      </div>
    );
  }

  if (!canViewPage) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-6">
      <div className="flex flex-col gap-3 border-b pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-semibold tracking-tight">Team Overview</h2>
            <Badge variant="outline">{selectedBranch?.name || 'All Branches'}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Branch activity, imports, edits, releases, and team transactions in one view.
          </p>
        </div>
        <Button
          variant="outline"
          className="gap-2"
          onClick={() => queryClient.invalidateQueries({ queryKey: ['team-overview-activity'] })}
          disabled={isLoading}
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Activity className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-2xl font-bold">{filteredLogs.length}</p>
              <p className="text-xs text-muted-foreground">Transactions</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <CalendarDays className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-2xl font-bold">{todayCount}</p>
              <p className="text-xs text-muted-foreground">Today</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <FileText className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-2xl font-bold">{importCount}</p>
              <p className="text-xs text-muted-foreground">Imports</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Users className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-2xl font-bold">{activeUsers}</p>
              <p className="text-xs text-muted-foreground">Active Users</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Activity className="h-5 w-5 text-destructive" />
            <div>
              <p className="text-2xl font-bold">{deleteCount}</p>
              <p className="text-xs text-muted-foreground">Deletes</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="h-4 w-4" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 lg:grid-cols-[1fr_180px_180px_160px_160px_auto]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search user, action, allocation, details..."
                className="pl-9"
              />
            </div>
            <Select value={selectedModule} onValueChange={setSelectedModule}>
              <SelectTrigger>
                <SelectValue placeholder="All Modules" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Modules</SelectItem>
                {MODULES.map((module) => (
                  <SelectItem key={module} value={module}>{formatLabel(module)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedAction} onValueChange={setSelectedAction}>
              <SelectTrigger>
                <SelectValue placeholder="All Actions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                {ACTION_TYPES.map((action) => (
                  <SelectItem key={action} value={action}>{formatLabel(action)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div>
              <Label className="sr-only" htmlFor="team-date-from">Date From</Label>
              <Input id="team-date-from" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
            </div>
            <div>
              <Label className="sr-only" htmlFor="team-date-to">Date To</Label>
              <Input id="team-date-to" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
            </div>
            <Button variant="outline" onClick={resetFilters}>Reset</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-base">
            <span>{selectedBranch?.name || 'All Branches'} Transactions</span>
            <Badge variant="outline">{branchUsers.length} team member{branchUsers.length === 1 ? '' : 's'}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[560px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[190px]">Date & Time</TableHead>
                  <TableHead className="w-[170px]">User</TableHead>
                  <TableHead className="w-[100px]">Action</TableHead>
                  <TableHead className="w-[150px]">Module</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      Loading team transactions...
                    </TableCell>
                  </TableRow>
                ) : filteredLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      No team transactions found for this branch.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLogs.map((log) => {
                    const metadata = getMetadata(log.metadata);
                    const allocationBills = Array.isArray(metadata.allocation_bills)
                      ? metadata.allocation_bills.filter(Boolean).slice(0, 3).join(', ')
                      : '';
                    const itemsCount = typeof metadata.items_count === 'number' ? metadata.items_count : null;

                    return (
                      <TableRow key={log.id}>
                        <TableCell className="text-xs text-muted-foreground">
                          {format(new Date(log.created_at), 'MMM dd, yyyy h:mm a')}
                        </TableCell>
                        <TableCell className="font-medium">
                          {log.user_name || log.user_email?.split('@')[0] || 'Unknown'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={getActionBadgeVariant(log.action_type)}>{formatLabel(log.action_type)}</Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs font-semibold uppercase text-muted-foreground">{formatLabel(log.module)}</span>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <p className="text-sm">{log.description || '-'}</p>
                            {(allocationBills || itemsCount !== null) && (
                              <div className="flex flex-wrap gap-2">
                                {itemsCount !== null && <Badge variant="outline">{itemsCount} item{itemsCount === 1 ? '' : 's'}</Badge>}
                                {allocationBills && <Badge variant="outline">{allocationBills}</Badge>}
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
};

export default TeamOverview;
