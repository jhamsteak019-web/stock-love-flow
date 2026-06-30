import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, ClipboardList, FileDown, FileSpreadsheet, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { format, isValid } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useBranch } from '@/contexts/BranchContext';
import { useToast } from '@/hooks/use-toast';
import { useActivityLog } from '@/hooks/useActivityLog';
import { exportToExcel } from '@/lib/excelExport';
import { normalizeAllocationBill } from '@/lib/allocationBill';
import { resolveCategory } from '@/lib/categoryUtils';
import {
  getPendingAllocationActionStatus,
  getPendingAllocationStatus,
  getPendingAllocationStatusLabel,
  PENDING_ALLOCATION_ACTION_STATUSES,
  PENDING_ALLOCATION_STATUS_OPTIONS,
  type PendingAllocationStatus,
} from '@/lib/pendingAllocationStatus';
import type { StockRelease } from '@/types/inventory';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type PendingAllocationRow = Pick<
  StockRelease,
  | 'id'
  | 'boxes_released'
  | 'destination'
  | 'courier'
  | 'allocation_bill'
  | 'notes'
  | 'batch_id'
  | 'category'
  | 'set_date'
  | 'total_qty'
  | 'amount'
  | 'branch_id'
  | 'created_at'
  | 'import_created_at'
  | 'action_status'
  | 'pending_allocation_status'
>;

type DuplicateLookupRow = Pick<StockRelease, 'allocation_bill' | 'allocation_bill_key' | 'action_status'>;

const PENDING_ALLOCATION_BASE_SELECT = 'id,boxes_released,destination,courier,allocation_bill,notes,batch_id,category,set_date,total_qty,amount,branch_id,created_at,action_status';
const PENDING_ALLOCATION_IMPORT_SELECT = `${PENDING_ALLOCATION_BASE_SELECT},import_created_at`;
const PENDING_ALLOCATION_SELECT = `${PENDING_ALLOCATION_IMPORT_SELECT},pending_allocation_status`;
const ITEMS_PER_PAGE = 12;
const DUPLICATE_LOOKUP_CHUNK_SIZE = 500;
const DUPLICATE_LOOKUP_PAGE_SIZE = 1000;
const DUPLICATE_FUZZY_LOOKUP_CHUNK_SIZE = 75;

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
  import_created_at: string | null;
  pendingStatus: PendingAllocationStatus;
  releaseIds: string[];
}

const normalizeAllocation = normalizeAllocationBill;

const getAllocationLookupToken = (allocation: string) => {
  const normalized = normalizeAllocationBill(allocation);
  const digitToken = normalized.match(/\d{6,}/g)?.sort((a, b) => b.length - a.length)[0];
  return digitToken || (normalized.length >= 6 ? normalized : '');
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  return isValid(date) ? format(date, 'yyyy-MM-dd HH:mm:ss') : value;
};

const getCreatedDateDisplay = (group: Pick<PendingAllocationGroup, 'created_at' | 'import_created_at'>) =>
  group.import_created_at?.trim() || formatDateTime(group.created_at);

const getCreatedDateTime = (value?: string | null) => {
  if (!value) return Number.NaN;
  const normalized = value.includes(' ') && !value.includes('T') ? value.replace(' ', 'T') : value;
  const parsed = new Date(normalized).getTime();
  return Number.isNaN(parsed) ? Number.NaN : parsed;
};

const isMissingOptionalColumnError = (error: unknown, columnName: string) => {
  if (!error || typeof error !== 'object') return false;
  const details = error as { code?: string; message?: string; details?: string; hint?: string };
  return [details.message, details.details, details.hint]
    .filter(Boolean)
    .some(text => String(text).toLowerCase().includes(columnName.toLowerCase()));
};

const getRemarksType = (remarks?: string | null) => {
  const normalized = String(remarks || '').toLowerCase();
  if (normalized.includes('r.o') || /\bro\b/.test(normalized) || normalized.includes('repeat')) return 'ro';
  if (normalized.includes('new arrival') || normalized.includes('new')) return 'new';
  return 'other';
};

const formatCurrency = (value: number) => {
  if (!value) return '-';
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(value);
};

const escapeHtml = (value: string | number | null | undefined) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const getPendingAllocationDuplicateCleanup = (pendingRows: PendingAllocationRow[]) => {
  const rowsByBill = new Map<string, PendingAllocationRow[]>();

  pendingRows.forEach((row) => {
    const billKey = normalizeAllocation(row.allocation_bill);
    if (!billKey) return;

    const billRows = rowsByBill.get(billKey) || [];
    billRows.push(row);
    rowsByBill.set(billKey, billRows);
  });

  const duplicateIds = new Set<string>();
  const duplicateBills = new Set<string>();

  rowsByBill.forEach((billRows) => {
    const batches = new Map<string, PendingAllocationRow[]>();

    billRows.forEach((row) => {
      const batchKey = row.batch_id || row.id;
      const batchRows = batches.get(batchKey) || [];
      batchRows.push(row);
      batches.set(batchKey, batchRows);
    });

    if (batches.size <= 1) return;

    const sortedBatches = Array.from(batches.values()).sort((a, b) => {
      const aCreated = Math.min(...a.map(row => new Date(row.created_at).getTime()));
      const bCreated = Math.min(...b.map(row => new Date(row.created_at).getTime()));
      return aCreated - bCreated;
    });

    sortedBatches.slice(1).forEach((batchRows) => {
      batchRows.forEach((row) => duplicateIds.add(row.id));
      const bill = batchRows[0]?.allocation_bill?.trim();
      if (bill) duplicateBills.add(bill);
    });
  });

  return {
    cleanRows: pendingRows.filter(row => !duplicateIds.has(row.id)),
    duplicateIds: Array.from(duplicateIds),
    duplicateBills: Array.from(duplicateBills),
  };
};

const getPendingAllocationSystemDuplicateCleanup = async (pendingRows: PendingAllocationRow[]) => {
  const pendingRowsByBillKey = new Map<string, PendingAllocationRow[]>();
  const pendingBillsByKey = new Map<string, Set<string>>();

  pendingRows.forEach((row) => {
    const billKey = normalizeAllocation(row.allocation_bill);
    if (!billKey) return;

    const billRows = pendingRowsByBillKey.get(billKey) || [];
    billRows.push(row);
    pendingRowsByBillKey.set(billKey, billRows);

    const billValues = pendingBillsByKey.get(billKey) || new Set<string>();
    if (row.allocation_bill?.trim()) billValues.add(row.allocation_bill.trim());
    pendingBillsByKey.set(billKey, billValues);
  });

  if (pendingRowsByBillKey.size === 0) {
    return {
      cleanRows: pendingRows,
      duplicateIds: [] as string[],
      duplicateBills: [] as string[],
    };
  }

  const duplicateBillKeys = new Set<string>();

  const billKeys = Array.from(pendingRowsByBillKey.keys());
  const scanRows = async (
    selectColumns: string,
    columnName: 'allocation_bill_key' | 'allocation_bill',
    values: string[],
  ) => {
    for (let index = 0; index < values.length; index += DUPLICATE_LOOKUP_CHUNK_SIZE) {
      const chunk = values.slice(index, index + DUPLICATE_LOOKUP_CHUNK_SIZE);

      for (let pageStart = 0; ; pageStart += DUPLICATE_LOOKUP_PAGE_SIZE) {
        const { data, error } = await supabase
          .from('stock_releases')
          .select(selectColumns)
          .is('deleted_at', null)
          .in(columnName, chunk)
          .range(pageStart, pageStart + DUPLICATE_LOOKUP_PAGE_SIZE - 1);

        if (error) throw error;

        ((data || []) as unknown as DuplicateLookupRow[]).forEach((row) => {
          const billKey = normalizeAllocation(
            columnName === 'allocation_bill_key'
              ? row.allocation_bill_key || row.allocation_bill
              : row.allocation_bill,
          );
          if (!billKey || !pendingRowsByBillKey.has(billKey)) return;

          const isPendingAllocationRow = (PENDING_ALLOCATION_ACTION_STATUSES as string[]).includes(String(row.action_status || ''));
          if (!isPendingAllocationRow) duplicateBillKeys.add(billKey);
        });

        if (!data || data.length < DUPLICATE_LOOKUP_PAGE_SIZE) break;
      }
    }
  };

  try {
    await scanRows('allocation_bill,allocation_bill_key,action_status', 'allocation_bill_key', billKeys);
  } catch (error) {
    if (!isMissingOptionalColumnError(error, 'allocation_bill_key')) throw error;
  }

  const getMissingBillValues = () => {
    const missingKeys = new Set(billKeys.filter(billKey => !duplicateBillKeys.has(billKey)));
    return Array.from(new Set(
      Array.from(pendingBillsByKey.entries())
        .filter(([billKey]) => missingKeys.has(billKey))
        .flatMap(([, values]) => Array.from(values)),
    ));
  };

  const billValues = getMissingBillValues();
  if (billValues.length > 0) {
    await scanRows('allocation_bill,action_status', 'allocation_bill', billValues);
  }

  const fuzzyTokens = Array.from(new Set(
    getMissingBillValues()
      .map(getAllocationLookupToken)
      .filter(Boolean),
  ));

  for (let index = 0; index < fuzzyTokens.length; index += DUPLICATE_FUZZY_LOOKUP_CHUNK_SIZE) {
    const chunk = fuzzyTokens.slice(index, index + DUPLICATE_FUZZY_LOOKUP_CHUNK_SIZE);
    const orFilter = chunk.map(token => `allocation_bill.ilike.%${token}%`).join(',');

    for (let pageStart = 0; ; pageStart += DUPLICATE_LOOKUP_PAGE_SIZE) {
      const { data, error } = await supabase
        .from('stock_releases')
        .select('allocation_bill,action_status')
        .is('deleted_at', null)
        .or(orFilter)
        .range(pageStart, pageStart + DUPLICATE_LOOKUP_PAGE_SIZE - 1);

      if (error) throw error;

      ((data || []) as unknown as DuplicateLookupRow[]).forEach((row) => {
        const billKey = normalizeAllocation(row.allocation_bill);
        if (!billKey || !pendingRowsByBillKey.has(billKey)) return;

        const isPendingAllocationRow = (PENDING_ALLOCATION_ACTION_STATUSES as string[]).includes(String(row.action_status || ''));
        if (!isPendingAllocationRow) duplicateBillKeys.add(billKey);
      });

      if (!data || data.length < DUPLICATE_LOOKUP_PAGE_SIZE) break;
    }
  }

  const duplicateIds = new Set<string>();
  const duplicateBills = new Set<string>();

  duplicateBillKeys.forEach((billKey) => {
    const billRows = pendingRowsByBillKey.get(billKey) || [];
    billRows.forEach((row) => {
      duplicateIds.add(row.id);
      const bill = row.allocation_bill?.trim();
      if (bill) duplicateBills.add(bill);
    });
  });

  return {
    cleanRows: pendingRows.filter(row => !duplicateIds.has(row.id)),
    duplicateIds: Array.from(duplicateIds),
    duplicateBills: Array.from(duplicateBills),
  };
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
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [arrivalFilter, setArrivalFilter] = useState('all');
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedGroupKeys, setSelectedGroupKeys] = useState<Set<string>>(new Set());
  const [statusUpdatingKey, setStatusUpdatingKey] = useState<string | null>(null);

  const cleanupDuplicatePendingAllocations = useCallback(async (duplicateIds: string[], duplicateBills: string[]) => {
    if (duplicateIds.length === 0) return;

    const deletedAt = new Date().toISOString();
    for (let index = 0; index < duplicateIds.length; index += 100) {
      const chunk = duplicateIds.slice(index, index + 100);
      const { error: cleanupError } = await supabase
        .from('stock_releases')
        .update({ deleted_at: deletedAt })
        .in('id', chunk);

      if (cleanupError) {
        console.warn('Unable to remove duplicate pending allocation bills:', cleanupError);
        return;
      }
    }

    toast({
      title: 'Duplicates Removed',
      description: `${duplicateBills.length} duplicate bill(s) were removed from Pending Allocation.`,
    });
  }, [toast]);

  const fetchPendingAllocations = useCallback(async () => {
    if (branchLoading) return;

    setLoading(true);
    try {
      const fetchRows = async (selectColumns: string) => {
        let query = supabase
          .from('stock_releases')
          .select(selectColumns)
          .is('deleted_at', null)
          .in('action_status', PENDING_ALLOCATION_ACTION_STATUSES)
          .order('created_at', { ascending: false })
          .limit(5000);

        if (selectedBranch?.id) {
          query = query.eq('branch_id', selectedBranch.id);
        }

        return query;
      };

      let { data, error } = await fetchRows(PENDING_ALLOCATION_SELECT);

      if (error && isMissingOptionalColumnError(error, 'pending_allocation_status')) {
        const retry = await fetchRows(PENDING_ALLOCATION_IMPORT_SELECT);
        data = retry.data;
        error = retry.error;
      }

      if (error && isMissingOptionalColumnError(error, 'import_created_at')) {
        const retry = await fetchRows(PENDING_ALLOCATION_BASE_SELECT);
        data = retry.data;
        error = retry.error;
      }

      if (error) throw error;

      const currentRows = ((data || []) as unknown as PendingAllocationRow[]).map(row => ({
        ...row,
        import_created_at: row.import_created_at || null,
        pending_allocation_status: getPendingAllocationStatus(row.pending_allocation_status, row.action_status),
      }));
      const pendingDuplicateCleanup = getPendingAllocationDuplicateCleanup(currentRows);
      const systemDuplicateCleanup = await getPendingAllocationSystemDuplicateCleanup(pendingDuplicateCleanup.cleanRows);
      const duplicateIds = Array.from(new Set([
        ...pendingDuplicateCleanup.duplicateIds,
        ...systemDuplicateCleanup.duplicateIds,
      ]));
      const duplicateBills = Array.from(new Set([
        ...pendingDuplicateCleanup.duplicateBills,
        ...systemDuplicateCleanup.duplicateBills,
      ]));

      setRows(systemDuplicateCleanup.cleanRows);

      if (duplicateIds.length > 0) {
        void cleanupDuplicatePendingAllocations(duplicateIds, duplicateBills);
      }
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
  }, [branchLoading, cleanupDuplicatePendingAllocations, selectedBranch?.id, toast]);

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
      const resolvedCategory = resolveCategory(row.category, remarks);
      const pendingStatus = getPendingAllocationStatus(row.pending_allocation_status, row.action_status);

      if (!existing) {
        groups.set(key, {
          key,
          allocation_bill: row.allocation_bill,
          destination: row.destination,
          category: resolvedCategory || null,
          boxes: Number(row.boxes_released) || 0,
          amount: Number(row.amount) || 0,
          totalQty: Number(row.total_qty) || 0,
          set_date: row.set_date,
          courier: row.courier,
          remarks,
          lineCount: 1,
          created_at: row.created_at,
          import_created_at: row.import_created_at || null,
          pendingStatus,
          releaseIds: [row.id],
        });
        return;
      }

      existing.boxes += Number(row.boxes_released) || 0;
      existing.amount += Number(row.amount) || 0;
      existing.totalQty += Number(row.total_qty) || 0;
      existing.category = existing.category || resolvedCategory || row.category;
      existing.set_date = existing.set_date || row.set_date;
      existing.courier = existing.courier || row.courier;
      existing.import_created_at = existing.import_created_at || row.import_created_at || null;
      if (existing.pendingStatus === 'pending' && pendingStatus !== 'pending') {
        existing.pendingStatus = pendingStatus;
      }
      existing.lineCount += 1;
      existing.releaseIds.push(row.id);

      if (remarks && !existing.remarks?.includes(remarks)) {
        existing.remarks = existing.remarks ? `${existing.remarks} | ${remarks}` : remarks;
      }
    });

    return Array.from(groups.values()).sort((a, b) => {
      const aDate = a.set_date || a.created_at;
      const bDate = b.set_date || b.created_at;
      return getCreatedDateTime(b.import_created_at || bDate) - getCreatedDateTime(a.import_created_at || aDate);
    });
  }, [rows]);

  const categoryOptions = useMemo(() => {
    const categories = new Set<string>();
    groupedAllocations.forEach(group => {
      const category = group.category?.trim();
      if (category) categories.add(category);
    });
    return Array.from(categories).sort((a, b) => a.localeCompare(b));
  }, [groupedAllocations]);

  const filteredAllocations = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const fromTime = createdFrom ? new Date(`${createdFrom}T00:00:00`).getTime() : null;
    const toTime = createdTo ? new Date(`${createdTo}T23:59:59`).getTime() : null;

    return groupedAllocations.filter((group) => {
      const searchable = [
        group.allocation_bill,
        group.destination,
        group.category,
        group.remarks,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      const createdTime = getCreatedDateTime(group.import_created_at || group.created_at);
      const matchesSearch = !query || searchable.includes(query);
      const matchesStatus = statusFilter === 'all' || group.pendingStatus === statusFilter;
      const matchesCategory = categoryFilter === 'all' || group.category?.trim() === categoryFilter;
      const matchesArrival = arrivalFilter === 'all' || getRemarksType(group.remarks) === arrivalFilter;
      const matchesFrom = fromTime === null || createdTime >= fromTime;
      const matchesTo = toTime === null || createdTime <= toTime;

      return matchesSearch && matchesStatus && matchesCategory && matchesArrival && matchesFrom && matchesTo;
    });
  }, [arrivalFilter, categoryFilter, createdFrom, createdTo, groupedAllocations, searchQuery, statusFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [arrivalFilter, categoryFilter, createdFrom, createdTo, searchQuery, statusFilter]);

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

  const someFilteredSelected = filteredAllocations.some(group => selectedGroupKeys.has(group.key));
  const allFilteredSelected = filteredAllocations.length > 0
    && filteredAllocations.every(group => selectedGroupKeys.has(group.key));

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

  const toggleFilteredSelection = (checked: boolean) => {
    setSelectedGroupKeys(prev => {
      const next = new Set(prev);
      filteredAllocations.forEach(group => {
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

      const releaseIdsByCategory = new Map<string, string[]>();
      selectedGroups.forEach((group) => {
        const category = resolveCategory(group.category, group.remarks);
        if (!category) return;
        const ids = releaseIdsByCategory.get(category) || [];
        ids.push(...group.releaseIds);
        releaseIdsByCategory.set(category, ids);
      });

      for (const [category, ids] of releaseIdsByCategory.entries()) {
        for (let index = 0; index < ids.length; index += 100) {
          const chunk = ids.slice(index, index + 100);
          const { error } = await supabase
            .from('stock_releases')
            .update({ category })
            .in('id', chunk);

          if (error) throw error;
        }
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

  const handlePendingStatusChange = async (group: PendingAllocationGroup, nextStatus: PendingAllocationStatus) => {
    const targetGroups = selectedGroupKeys.has(group.key) && selectedGroups.length > 0
      ? selectedGroups
      : [group];
    const targetReleaseIds = Array.from(new Set(targetGroups.flatMap(targetGroup => targetGroup.releaseIds)));

    if (targetReleaseIds.length === 0 || targetGroups.every(targetGroup => targetGroup.pendingStatus === nextStatus) || statusUpdatingKey) {
      return;
    }

    setStatusUpdatingKey(group.key);
    const previousRows = rows;
    const fallbackActionStatus = getPendingAllocationActionStatus(nextStatus);
    setRows(prev => prev.map(row => (
      targetReleaseIds.includes(row.id)
        ? { ...row, pending_allocation_status: nextStatus, action_status: fallbackActionStatus }
        : row
    )));

    try {
      const { error } = await supabase
        .from('stock_releases')
        .update({ pending_allocation_status: nextStatus })
        .in('id', targetReleaseIds);

      if (error && isMissingOptionalColumnError(error, 'pending_allocation_status')) {
        const fallback = await supabase
          .from('stock_releases')
          .update({ action_status: fallbackActionStatus })
          .in('id', targetReleaseIds);

        if (fallback.error) throw fallback.error;
      } else if (error) {
        throw error;
      }

      await logActivity({
        actionType: 'update',
        module: 'pending_allocations',
        description: `Updated ${targetGroups.length} pending allocation bill(s) to ${getPendingAllocationStatusLabel(nextStatus)}`,
        metadata: {
          allocation_bills: targetGroups.map(targetGroup => targetGroup.allocation_bill).filter(Boolean),
          branch_id: selectedBranch?.id,
          branch: selectedBranch?.name,
          status: nextStatus,
        },
      });

      toast({
        title: 'Status Updated',
        description: `${targetGroups.length} bill(s) set to ${getPendingAllocationStatusLabel(nextStatus)}.`,
      });
    } catch (error) {
      console.error('Error updating pending allocation status:', error);
      setRows(previousRows);
      toast({
        title: 'Error',
        description: 'Failed to update pending allocation status.',
        variant: 'destructive',
      });
    } finally {
      setStatusUpdatingKey(null);
    }
  };

  const buildExportRows = () => filteredAllocations.map(group => ({
    bill: group.allocation_bill || '-',
    destination: group.destination || '-',
    amount: Number(group.amount) || 0,
    amountDisplay: formatCurrency(group.amount),
    qty: group.totalQty,
    remarks: group.remarks || '-',
    status: getPendingAllocationStatusLabel(group.pendingStatus),
    createdDate: getCreatedDateDisplay(group),
  }));

  const handleExportExcel = async () => {
    const exportRows = buildExportRows();
    if (exportRows.length === 0) {
      toast({ title: 'No data', description: 'No pending allocations to export.' });
      return;
    }

    await exportToExcel({
      title: 'Pending Allocation',
      subtitle: `Generated on ${format(new Date(), 'MMMM dd, yyyy')}`,
      filename: `pending-allocation-${format(new Date(), 'yyyy-MM-dd')}`,
      columns: [
        { header: 'BILL', key: 'bill', width: 22 },
        { header: 'DESTINATION', key: 'destination', width: 24 },
        { header: 'AMOUNT', key: 'amount', width: 16 },
        { header: 'QTY', key: 'qty', width: 10 },
        { header: 'REMARKS', key: 'remarks', width: 42 },
        { header: 'STATUS', key: 'status', width: 14 },
        { header: 'CREATE DATE', key: 'createdDate', width: 16 },
      ],
      data: exportRows,
    });
    toast({ title: 'Exported', description: 'Excel file downloaded.' });
  };

  const handleExportPDF = () => {
    const exportRows = buildExportRows();
    if (exportRows.length === 0) {
      toast({ title: 'No data', description: 'No pending allocations to export.' });
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast({
        title: 'Popup blocked',
        description: 'Please allow popups to save the Pending Allocation PDF.',
        variant: 'destructive',
      });
      return;
    }

    const totalQty = exportRows.reduce((sum, row) => sum + Number(row.qty || 0), 0);
    const totalAmount = exportRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const generatedAt = format(new Date(), 'MMM d, yyyy h:mm a');
    const branchName = selectedBranch?.name || 'All Branches';
    const rowsHtml = exportRows.map((row) => `
      <tr>
        <td class="mono">${escapeHtml(row.bill)}</td>
        <td>${escapeHtml(row.destination)}</td>
        <td class="num">${escapeHtml(row.amountDisplay)}</td>
        <td class="num">${escapeHtml(row.qty)}</td>
        <td>${escapeHtml(row.remarks)}</td>
        <td class="status">${escapeHtml(row.status)}</td>
        <td class="mono">${escapeHtml(row.createdDate)}</td>
      </tr>
    `).join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Pending Allocation - ${escapeHtml(format(new Date(), 'yyyy-MM-dd'))}</title>
          <style>
            @page { size: A4 landscape; margin: 10mm; }
            * { box-sizing: border-box; }
            body {
              margin: 0;
              color: #111827;
              font-family: Arial, Helvetica, sans-serif;
              font-size: 10px;
              background: #ffffff;
            }
            .report { width: 100%; }
            .header {
              display: flex;
              justify-content: space-between;
              gap: 16px;
              align-items: flex-end;
              border-bottom: 2px solid #111827;
              padding-bottom: 8px;
              margin-bottom: 10px;
            }
            .title {
              font-size: 18px;
              font-weight: 800;
              letter-spacing: 0.04em;
              text-transform: uppercase;
            }
            .subtitle {
              margin-top: 3px;
              color: #4b5563;
              font-size: 9px;
            }
            .summary {
              display: grid;
              grid-template-columns: repeat(4, minmax(0, 1fr));
              gap: 6px;
              margin-bottom: 10px;
            }
            .summary div {
              border: 1px solid #cbd5e1;
              background: #f8fafc;
              padding: 6px 8px;
            }
            .summary span {
              display: block;
              color: #64748b;
              font-size: 8px;
              font-weight: 700;
              letter-spacing: 0.06em;
              text-transform: uppercase;
            }
            .summary strong {
              display: block;
              margin-top: 2px;
              font-size: 12px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              table-layout: fixed;
            }
            thead { display: table-header-group; }
            tr { page-break-inside: avoid; }
            th, td {
              border: 1px solid #b8c0cc;
              padding: 4px 5px;
              vertical-align: middle;
              word-wrap: break-word;
            }
            th {
              background: #e5e7eb;
              color: #111827;
              font-size: 8px;
              font-weight: 800;
              letter-spacing: 0.03em;
              text-align: left;
              text-transform: uppercase;
            }
            tbody tr:nth-child(even) td { background: #f8fafc; }
            tfoot td {
              background: #f1f5f9;
              font-weight: 800;
            }
            .mono {
              font-family: Consolas, "Courier New", monospace;
              font-size: 8.5px;
            }
            .num {
              text-align: right;
              white-space: nowrap;
            }
            .status {
              color: #d97706;
              font-weight: 700;
            }
            .signatures {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 54px;
              margin-top: 28px;
              page-break-inside: avoid;
            }
            .signature {
              text-align: center;
              color: #4b5563;
              font-size: 9px;
            }
            .signature:before {
              content: "";
              display: block;
              height: 1px;
              background: #111827;
              margin: 0 auto 6px;
              width: 62%;
            }
          </style>
        </head>
        <body>
          <div class="report">
            <div class="header">
              <div>
                <div class="title">Pending Allocation Report</div>
                <div class="subtitle">P Import items waiting for allocation review</div>
              </div>
              <div class="subtitle" style="text-align:right;">
                Generated: ${escapeHtml(generatedAt)}<br/>
                Branch: ${escapeHtml(branchName)}
              </div>
            </div>

            <div class="summary">
              <div><span>Total Bills</span><strong>${escapeHtml(exportRows.length)}</strong></div>
              <div><span>Total Qty</span><strong>${escapeHtml(totalQty.toLocaleString('en-PH'))}</strong></div>
              <div><span>Total Amount</span><strong>${escapeHtml(formatCurrency(totalAmount))}</strong></div>
              <div><span>Status</span><strong>Pending Review</strong></div>
            </div>

            <table>
              <thead>
                <tr>
                  <th style="width: 14%;">Bill No</th>
                  <th style="width: 15%;">Destination</th>
                  <th style="width: 12%;">Amount</th>
                  <th style="width: 6%;">Qty</th>
                  <th style="width: 31%;">Remarks</th>
                  <th style="width: 9%;">Status</th>
                  <th style="width: 13%;">Create Date</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
              <tfoot>
                <tr>
                  <td colspan="2">Total</td>
                  <td class="num">${escapeHtml(formatCurrency(totalAmount))}</td>
                  <td class="num">${escapeHtml(totalQty.toLocaleString('en-PH'))}</td>
                  <td colspan="3"></td>
                </tr>
              </tfoot>
            </table>

            <div class="signatures">
              <div class="signature">Checked By</div>
              <div class="signature">Reviewed By</div>
              <div class="signature">Received By</div>
            </div>
          </div>
          <script>
            window.onload = function () {
              window.focus();
              setTimeout(function () { window.print(); }, 250);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
    toast({ title: 'PDF Ready', description: 'Use Save as PDF in the print dialog.' });
  };

  return (
    <div className="mx-auto w-full max-w-[min(98vw,1900px)] space-y-5 px-2">
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
          <Button variant="outline" onClick={handleExportExcel} disabled={filteredAllocations.length === 0}>
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Save Excel
          </Button>
          <Button variant="outline" onClick={handleExportPDF} disabled={filteredAllocations.length === 0}>
            <FileDown className="mr-2 h-4 w-4" />
            Save PDF
          </Button>
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

      <Card className="rounded-lg">
        <CardContent className="space-y-5 p-4 sm:p-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center">
              <div className="relative w-full lg:w-[420px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search bill, destination, remarks..."
                  className="pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full lg:w-[175px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  {PENDING_ALLOCATION_STATUS_OPTIONS.map(option => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
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
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-full lg:w-[150px]">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Category</SelectItem>
                  {categoryOptions.map(category => (
                    <SelectItem key={category} value={category}>{category}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={arrivalFilter} onValueChange={setArrivalFilter}>
                <SelectTrigger className="w-full lg:w-[170px]">
                  <SelectValue placeholder="R.O / New Arrival" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Remarks Type</SelectItem>
                  <SelectItem value="ro">R.O</SelectItem>
                  <SelectItem value="new">New Arrival</SelectItem>
                </SelectContent>
              </Select>
              {(searchQuery || statusFilter !== 'all' || categoryFilter !== 'all' || arrivalFilter !== 'all' || createdFrom || createdTo) && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setSearchQuery('');
                    setStatusFilter('all');
                    setCategoryFilter('all');
                    setArrivalFilter('all');
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

          <div className="min-h-[560px] overflow-x-auto rounded-lg border">
            <Table className="text-sm lg:text-[15px] [&_td]:py-4 [&_th]:py-4">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={allFilteredSelected ? true : someFilteredSelected ? 'indeterminate' : false}
                      onCheckedChange={(checked) => toggleFilteredSelection(checked === true)}
                      aria-label="Select all filtered pending allocations"
                    />
                  </TableHead>
                  <TableHead className="min-w-[180px]">BILL</TableHead>
                  <TableHead className="min-w-[210px]">DESTINATION</TableHead>
                  <TableHead className="min-w-[150px] text-right">AMOUNT</TableHead>
                  <TableHead className="min-w-[110px] text-center">QTY</TableHead>
                  <TableHead className="min-w-[360px]">REMARKS</TableHead>
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
                      <TableCell className="max-w-[520px] whitespace-normal">{group.remarks || '-'}</TableCell>
                      <TableCell>
                        <Select
                          value={group.pendingStatus}
                          onValueChange={(value) => handlePendingStatusChange(group, value as PendingAllocationStatus)}
                          disabled={Boolean(statusUpdatingKey)}
                        >
                          <SelectTrigger className="h-8 w-[170px] rounded-full bg-secondary px-3 text-xs font-semibold shadow-none">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PENDING_ALLOCATION_STATUS_OPTIONS.map(option => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>{getCreatedDateDisplay(group)}</TableCell>
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
