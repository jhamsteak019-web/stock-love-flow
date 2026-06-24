import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ClipboardList, RefreshCw, Search } from 'lucide-react';
import { format, isValid } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useBranch } from '@/contexts/BranchContext';
import { useToast } from '@/hooks/use-toast';
import type { StockRelease } from '@/types/inventory';
import type { Database } from '@/integrations/supabase/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type PendingAllocationRow = StockRelease;
type ActivityLogRow = Database['public']['Tables']['activity_logs']['Row'];

const STOCK_RELEASE_SELECT = 'id,item_id,boxes_released,destination,courier,allocation_bill,released_by,delivery_status,date_released,date_delivered,deleted_at,notes,batch_id,category,waybill_no,set_date,total_qty,amount,photo_url,photo_status,branch_id,created_at,updated_at,action_status,product_code,product_description,unit_price';

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
  const [rows, setRows] = useState<PendingAllocationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const getLegacyPImportBills = (logs: ActivityLogRow[]) => {
    const bills = new Set<string>();

    logs.forEach((log) => {
      const metadata = (log.metadata && typeof log.metadata === 'object' && !Array.isArray(log.metadata))
        ? log.metadata as Record<string, unknown>
        : {};
      const allocationBills = metadata.allocation_bills;

      if (Array.isArray(allocationBills)) {
        allocationBills.forEach((bill) => {
          const value = String(bill || '').trim();
          if (value) bills.add(value);
        });
      }
    });

    return Array.from(bills);
  };

  const fetchLegacyPendingAllocationRows = useCallback(async () => {
    const { data: logs, error: logsError } = await supabase
      .from('activity_logs')
      .select('id,action_type,module,description,metadata,created_at,user_id,user_email,user_name,ip_address')
      .eq('action_type', 'import')
      .in('module', ['stock_releases', 'pending_allocations'])
      .ilike('description', 'P Imported%')
      .order('created_at', { ascending: false })
      .limit(200);

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
    if (!query) return groupedAllocations;

    return groupedAllocations.filter((group) => {
      const searchable = [
        group.allocation_bill,
        group.destination,
        group.category,
        group.courier,
        group.remarks,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchable.includes(query);
    });
  }, [groupedAllocations, searchQuery]);

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

      <div className="grid gap-3 md:grid-cols-3">
        <Card className="rounded-lg">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Pending Bills</p>
            <p className="mt-2 text-2xl font-semibold">{filteredAllocations.length}</p>
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total Boxes / Qty</p>
            <p className="mt-2 text-2xl font-semibold">{totals.boxes} / {totals.qty}</p>
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
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full max-w-xl">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search bill, destination, category, remarks, courier..."
                className="pl-9"
              />
            </div>
            <Badge variant="outline" className="w-fit">
              {rows.length} pending line{rows.length === 1 ? '' : 's'}
            </Badge>
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[160px]">Allocation Bill</TableHead>
                  <TableHead className="min-w-[150px]">Destination</TableHead>
                  <TableHead className="min-w-[100px]">Category</TableHead>
                  <TableHead className="min-w-[90px] text-center">Boxes</TableHead>
                  <TableHead className="min-w-[130px] text-right">Amount</TableHead>
                  <TableHead className="min-w-[110px] text-center">Qty/Item</TableHead>
                  <TableHead className="min-w-[130px]">Date Out</TableHead>
                  <TableHead className="min-w-[110px]">Courier</TableHead>
                  <TableHead className="min-w-[220px]">Remarks</TableHead>
                  <TableHead className="min-w-[110px]">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={10} className="h-40 text-center">
                      <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                    </TableCell>
                  </TableRow>
                ) : filteredAllocations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="h-40 text-center text-muted-foreground">
                      No pending allocations found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAllocations.map((group) => (
                    <TableRow key={group.key}>
                      <TableCell className="font-mono text-xs font-medium">{group.allocation_bill || '-'}</TableCell>
                      <TableCell>{group.destination}</TableCell>
                      <TableCell>{group.category || '-'}</TableCell>
                      <TableCell className="text-center">{group.boxes}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(group.amount)}</TableCell>
                      <TableCell className="text-center">{group.totalQty}</TableCell>
                      <TableCell>{formatDate(group.set_date)}</TableCell>
                      <TableCell>{group.courier || '-'}</TableCell>
                      <TableCell className="max-w-[340px] whitespace-normal text-sm">{group.remarks || '-'}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">Pending</Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PendingAllocation;
