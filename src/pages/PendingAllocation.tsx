import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, ClipboardList, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { format, isValid } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useBranch } from '@/contexts/BranchContext';
import { useToast } from '@/hooks/use-toast';
import { useActivityLog } from '@/hooks/useActivityLog';
import type { StockRelease } from '@/types/inventory';
import type { Database } from '@/integrations/supabase/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type PendingAllocationRow = StockRelease;
type ActivityLogRow = Database['public']['Tables']['activity_logs']['Row'];

const STOCK_RELEASE_SELECT = 'id,item_id,boxes_released,destination,courier,allocation_bill,released_by,delivery_status,date_released,date_delivered,deleted_at,notes,batch_id,category,waybill_no,set_date,total_qty,amount,photo_url,photo_status,branch_id,created_at,updated_at,action_status,product_code,product_description,unit_price';
const ITEMS_PER_PAGE = 10;

interface PendingAllocationGroup {
  key: string;
  allocation_bill: string | null;
  destination: string;
  category: string | null;
  boxes: number;
  amount: number;
  totalQty: number;
  set_date: string | null;
  courier: string | null;
  remarks: string | null;
  lineCount: number;
  created_at: string;
  releaseIds: string[];
}

const normalizeAllocation = (allocation?: string | null) =>
  String(allocation || '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  return isValid(date) ? format(date, 'MMM d, yyyy') : '-';
};

const formatCurrency = (value: number) => {
  if (!value) return '-';
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(value);
};

const PendingAllocation = () => {
  const { selectedBranch, loading: branchLoading } = useBranch();
  const { toast } = useToast();
  const { logActivity } = useActivityLog();
  const [rows, setRows] = useState<PendingAllocationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [moving, setMoving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedGroupKeys, setSelectedGroupKeys] = useState<Set<string>>(new Set());

  const getLegacyPImportBills = (logs: ActivityLogRow[]) => {
    const importedBills = new Set<string>();
    const movedBills = new Set<string>();

    const collectBills = (log: ActivityLogRow) => {
      const metadata = (log.metadata && typeof log.metadata === 'object' && !Array.isArray(log.metadata))
        ? log.metadata as Record<string, unknown>
        : {};
      const allocationBills = metadata.allocation_bills;

      if (!Array.isArray(allocationBills)) return [];

      return allocationBills
        .map((bill) => String(bill || '').trim())
        .filter(Boolean);
    };

    logs.forEach((log) => {
      const description = (log.description || '').toLowerCase();
      const bills = collectBills(log);

      if (log.action_type === 'import' && description.startsWith('p imported')) {
        bills.forEach((bill) => importedBills.add(bill));
      }

      if (log.action_type === 'update' && description.includes('pending allocation') && description.includes('deliveries')) {
        bills.forEach((bill) => movedBills.add(bill));
      }
    });

    movedBills.forEach((bill) => importedBills.delete(bill));
    return Array.from(importedBills);
  };

  const fetchLegacyPendingAllocationRows = useCallback(async () => {
    const { data: logs, error: logsError } = await supabase
      .from('activity_logs')
      .select('id,action_type,module,description,metadata,created_at,user_id,user_email,user_name,ip_address')
      .in('module', ['stock_releases', 'pending_allocations'])
      .order('created_at', { ascending: false })
      .limit(500);

    if (logsError) {
      console.warn('Unable to check legacy P Import activity logs:', logsError);
      return [];
    }

    const bills = getLegacyPImportBills((logs || []) as ActivityLogRow[]);
    if (bills.length === 0) return [];

    const legacyRows: PendingAllocationRow[] = [];
    for (let index = 0; index < bills.length; index += 100) {
      const chunk = bills.slice(index, index + 100);
      let query = supabase
        .from('stock_releases')
        .select(STOCK_RELEASE_SELECT)
        .is('deleted_at', null)
        .neq('delivery_status', 'delivered')
        .in('allocation_bill', chunk);

      if (selectedBranch?.id) {
        query = query.eq('branch_id', selectedBranch.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      legacyRows.push(...((data || []) as PendingAllocationRow[]));
    }

    const idsToBackfill = legacyRows
      .filter(row => row.action_status !== 'pending_allocation')
      .map(row => row.id);

    for (let index = 0; index < idsToBackfill.length; index += 100) {
      const chunk = idsToBackfill.slice(index, index + 100);
      const { error } = await supabase
        .from('stock_releases')
        .update({ action_status: 'pending_allocation' })
        .in('id', chunk);

      if (error) {
        console.warn('Unable to backfill legacy P Import rows:', error);
        break;
      }
    }

    return legacyRows.map(row => ({ ...row, action_status: 'pending_allocation' }));
  }, [selectedBranch?.id]);

  const fetchPendingAllocations = useCallback(async () => {
    if (branchLoading) return;

    setLoading(true);
    try {
      let query = supabase
        .from('stock_releases')
        .select(STOCK_RELEASE_SELECT)
        .is('deleted_at', null)
        .eq('action_status', 'pending_allocation')
        .order('created_at', { ascending: false })
        .limit(5000);

      if (selectedBranch?.id) {
        query = query.eq('branch_id', selectedBranch.id);
      }

      const { data, error } = await query;
      if (error) throw error;

      const currentRows = (data || []) as PendingAllocationRow[];
      const legacyRows = await fetchLegacyPendingAllocationRows();
      const byId = new Map<string, PendingAllocationRow>();

      [...currentRows, ...legacyRows].forEach((row) => {
        byId.set(row.id, row);
      });

      setRows(Array.from(byId.values()));
    } catch (error) {
      console.error('Error fetching pending allocations:', error);
      toast({
        title: 'Error',
        description: 'Failed to load pending allocations.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [branchLoading, fetchLegacyPendingAllocationRows, selectedBranch?.id, toast]);

  useEffect(() => {
    fetchPendingAllocations();
  }, [fetchPendingAllocations]);

  const groupedAllocations = useMemo(() => {
    const groups = new Map<string, PendingAllocationGroup>();

    rows.forEach((row) => {
      const allocationKey = normalizeAllocation(row.allocation_bill);
      const key = allocationKey ? `bill:${allocationKey}` : `batch:${row.batch_id || row.id}`;
      const existing = groups.get(key);
      const remarks = row.notes?.trim() || null;

      if (!existing) {
        groups.set(key, {
          key,
          allocation_bill: row.allocation_bill,
          destination: row.destination,
          category: row.category,
          boxes: Number(row.boxes_released) || 0,
          amount: Number(row.amount) || 0,
          totalQty: Number(row.total_qty) || 0,
          set_date: row.set_date,
          courier: row.courier,
          remarks,
          lineCount: 1,
          created_at: row.created_at,
          releaseIds: [row.id],
        });
        return;
      }

      existing.boxes += Number(row.boxes_released) || 0;
      existing.amount += Number(row.amount) || 0;
      existing.totalQty += Number(row.total_qty) || 0;
      existing.category = existing.category || row.category;
      existing.set_date = existing.set_date || row.set_date;
      existing.courier = existing.courier || row.courier;
      existing.lineCount += 1;
      existing.releaseIds.push(row.id);

      if (remarks && !existing.remarks?.includes(remarks)) {
        existing.remarks = existing.remarks ? `${existing.remarks} | ${remarks}` : remarks;
      }
    });

    return Array.from(groups.values()).sort((a, b) => {
      const aDate = a.set_date || a.created_at;
      const bDate = b.set_date || b.created_at;
      return new Date(bDate).getTime() - new Date(aDate).getTime();
    });
  }, [rows]);

  const filteredAllocations = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const fromTime = createdFrom ? new Date(`${createdFrom}T00:00:00`).getTime() : null;
    const toTime = createdTo ? new Date(`${createdTo}T23:59:59`).getTime() : null;

    return groupedAllocations.filter((group) => {
      const searchable = [
        group.allocation_bill,
        group.destination,
        group.remarks,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      const createdTime = new Date(group.created_at).getTime();
      const matchesSearch = !query || searchable.includes(query);
      const matchesStatus = statusFilter === 'all' || statusFilter === 'pending';
      const matchesFrom = fromTime === null || createdTime >= fromTime;
      const matchesTo = toTime === null || createdTime <= toTime;

      return matchesSearch && matchesStatus && matchesFrom && matchesTo;
    });
  }, [createdFrom, createdTo, groupedAllocations, searchQuery, statusFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [createdFrom, createdTo, searchQuery, statusFilter]);

  useEffect(() => {
    const visibleKeys = new Set(groupedAllocations.map(group => group.key));
    setSelectedGroupKeys(prev => {
      const next = new Set(Array.from(prev).filter(key => visibleKeys.has(key)));
      return next.size === prev.size ? prev : next;
    });
  }, [groupedAllocations]);

  const selectedGroups = useMemo(
    () => groupedAllocations.filter(group => selectedGroupKeys.has(group.key)),
    [groupedAllocations, selectedGroupKeys],
  );

  const selectedReleaseIds = useMemo(
    () => selectedGroups.flatMap(group => group.releaseIds),
    [selectedGroups],
  );

  const totalPages = Math.max(1, Math.ceil(filteredAllocations.length / ITEMS_PER_PAGE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedAllocations = useMemo(() => {
    const start = (safeCurrentPage - 1) * ITEMS_PER_PAGE;
    return filteredAllocations.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredAllocations, safeCurrentPage]);

  const pageNumbers = useMemo(() => {
    const maxButtons = 5;
    const start = Math.max(1, Math.min(safeCurrentPage - 2, totalPages - maxButtons + 1));
    const end = Math.min(totalPages, start + maxButtons - 1);
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  }, [safeCurrentPage, totalPages]);

  const someVisibleSelected = paginatedAllocations.some(group => selectedGroupKeys.has(group.key));
  const allVisibleSelected = paginatedAllocations.length > 0
    && paginatedAllocations.every(group => selectedGroupKeys.has(group.key));

  const toggleGroupSelection = (key: string, checked: boolean) => {
    setSelectedGroupKeys(prev => {
      const next = new Set(prev);
      if (checked) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  };

  const toggleVisibleSelection = (checked: boolean) => {
    setSelectedGroupKeys(prev => {
      const next = new Set(prev);
      paginatedAllocations.forEach(group => {
        if (checked) {
          next.add(group.key);
        } else {
          next.delete(group.key);
        }
      });
      return next;
    });
  };

  const handleMoveToDeliveries = async () => {
    if (selectedReleaseIds.length === 0 || moving) return;

    setMoving(true);
    try {
      for (let index = 0; index < selectedReleaseIds.length; index += 100) {
        const chunk = selectedReleaseIds.slice(index, index + 100);
        const { error } = await supabase
          .from('stock_releases')
          .update({ action_status: 'yes' })
          .in('id', chunk);

        if (error) throw error;
      }

      const allocationBills = selectedGroups
        .map(group => group.allocation_bill)
        .filter(Boolean) as string[];

      await logActivity({
        actionType: 'update',
        module: 'pending_allocations',
        description: `Moved ${selectedGroups.length} pending allocation bill(s) to deliveries`,
        metadata: {
          items_count: selectedReleaseIds.length,
          branch_id: selectedBranch?.id,
          branch: selectedBranch?.name,
          allocation_bills: allocationBills,
        },
      });

      setRows(prev => prev.filter(row => !selectedReleaseIds.includes(row.id)));
      setSelectedGroupKeys(new Set());
      window.dispatchEvent(new CustomEvent('app:soft-refresh'));

      toast({
        title: 'Moved to Deliveries',
        description: `${selectedGroups.length} bill(s) are now visible in Deliveries.`,
      });
    } catch (error) {
      console.error('Error moving pending allocations:', error);
      toast({
        title: 'Error',
        description: 'Failed to move selected allocations to deliveries.',
        variant: 'destructive',
      });
    } finally {
      setMoving(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedReleaseIds.length === 0 || deleting) return;

    setDeleting(true);
    try {
      const deletedAt = new Date().toISOString();
      for (let index = 0; index < selectedReleaseIds.length; index += 100) {
        const chunk = selectedReleaseIds.slice(index, index + 100);
        const { error } = await supabase
          .from('stock_releases')
          .update({ deleted_at: deletedAt })
          .in('id', chunk);

        if (error) throw error;
      }

      const allocationBills = selectedGroups
        .map(group => group.allocation_bill)
        .filter(Boolean) as string[];

      await logActivity({
        actionType: 'delete',
        module: 'pending_allocations',
        description: `Deleted ${selectedGroups.length} pending allocation bill(s)`,
        metadata: {
          items_count: selectedReleaseIds.length,
          branch_id: selectedBranch?.id,
          branch: selectedBranch?.name,
          allocation_bills: allocationBills,
        },
      });

      setRows(prev => prev.filter(row => !selectedReleaseIds.includes(row.id)));
      setSelectedGroupKeys(new Set());

      toast({
        title: 'Deleted',
        description: `${selectedGroups.length} pending allocation bill(s) removed.`,
      });
    } catch (error) {
      console.error('Error deleting pending allocations:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete selected allocations.',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  };

  const totals = useMemo(() => {
    return filteredAllocations.reduce(
      (acc, group) => ({
        boxes: acc.boxes + group.boxes,
        qty: acc.qty + group.totalQty,
        amount: acc.amount + group.amount,
      }),
      { boxes: 0, qty: 0, amount: 0 },
    );
  }, [filteredAllocations]);

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5">
      <div className="flex flex-col gap-3 border-b pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ClipboardList className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Pending Allocation</h2>
            <p className="text-sm text-muted-foreground">P Import items waiting for allocation review.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={fetchPendingAllocations} disabled={loading || branchLoading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button variant="outline" asChild>
            <Link to="/deliveries">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Deliveries
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Card className="rounded-lg">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Pending Bills</p>
            <p className="mt-2 text-2xl font-semibold">{filteredAllocations.length}</p>
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total Amount</p>
            <p className="mt-2 text-2xl font-semibold">{formatCurrency(totals.amount)}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-lg">
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center">
              <div className="relative w-full lg:w-[340px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search bill, destination, remarks..."
                  className="pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full lg:w-[150px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="date"
                value={createdFrom}
                onChange={(event) => setCreatedFrom(event.target.value)}
                className="w-full lg:w-[150px]"
                aria-label="Created from"
              />
              <Input
                type="date"
                value={createdTo}
                onChange={(event) => setCreatedTo(event.target.value)}
                className="w-full lg:w-[150px]"
                aria-label="Created to"
              />
              {(searchQuery || statusFilter !== 'all' || createdFrom || createdTo) && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setSearchQuery('');
                    setStatusFilter('all');
                    setCreatedFrom('');
                    setCreatedTo('');
                  }}
                >
                  <X className="mr-2 h-4 w-4" />
                  Clear
                </Button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="w-fit">
                {filteredAllocations.length} pending bill{filteredAllocations.length === 1 ? '' : 's'}
              </Badge>
              {selectedGroups.length > 0 && (
                <Badge variant="secondary" className="w-fit">
                  {selectedGroups.length} selected
                </Badge>
              )}
              <Button
                variant="destructive"
                onClick={handleDeleteSelected}
                disabled={selectedReleaseIds.length === 0 || deleting || loading}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {deleting ? 'Deleting...' : 'Delete'}
              </Button>
              <Button
                onClick={handleMoveToDeliveries}
                disabled={selectedReleaseIds.length === 0 || moving || loading}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                {moving ? 'Moving...' : 'Move to Deliveries'}
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={allVisibleSelected ? true : someVisibleSelected ? 'indeterminate' : false}
                      onCheckedChange={(checked) => toggleVisibleSelection(checked === true)}
                      aria-label="Select all pending allocations"
                    />
                  </TableHead>
                  <TableHead className="min-w-[160px]">BILL</TableHead>
                  <TableHead className="min-w-[170px]">DESTINATION</TableHead>
                  <TableHead className="min-w-[130px] text-right">AMOUNT</TableHead>
                  <TableHead className="min-w-[100px] text-center">QTY</TableHead>
                  <TableHead className="min-w-[280px]">REMARKS</TableHead>
                  <TableHead className="min-w-[110px]">STATUS</TableHead>
                  <TableHead className="min-w-[140px]">CREATE DATE</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-40 text-center">
                      <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                    </TableCell>
                  </TableRow>
                ) : filteredAllocations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-40 text-center text-muted-foreground">
                      No pending allocations found.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedAllocations.map((group) => (
                    <TableRow key={group.key} data-state={selectedGroupKeys.has(group.key) ? 'selected' : undefined}>
                      <TableCell>
                        <Checkbox
                          checked={selectedGroupKeys.has(group.key)}
                          onCheckedChange={(checked) => toggleGroupSelection(group.key, checked === true)}
                          aria-label={`Select ${group.allocation_bill || group.destination}`}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs font-medium">{group.allocation_bill || '-'}</TableCell>
                      <TableCell>{group.destination}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(group.amount)}</TableCell>
                      <TableCell className="text-center">{group.totalQty}</TableCell>
                      <TableCell className="max-w-[340px] whitespace-normal text-sm">{group.remarks || '-'}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">Pending</Badge>
                      </TableCell>
                      <TableCell>{formatDate(group.created_at)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Page {safeCurrentPage} of {totalPages} ({filteredAllocations.length} bill{filteredAllocations.length === 1 ? '' : 's'})
            </p>
            <div className="flex flex-wrap items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(page => Math.max(1, page - 1))}
                disabled={safeCurrentPage <= 1}
              >
                Previous
              </Button>
              {pageNumbers.map((page) => (
                <Button
                  key={page}
                  variant={page === safeCurrentPage ? 'default' : 'outline'}
                  size="sm"
                  className="h-9 w-9 p-0"
                  onClick={() => setCurrentPage(page)}
                >
                  {page}
                </Button>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(page => Math.min(totalPages, page + 1))}
                disabled={safeCurrentPage >= totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PendingAllocation;
