import { useState, useMemo, useEffect, useCallback } from 'react';
import { useDebounce } from '@/hooks/useDebounce';
import { ClipboardList, Eye, Trash2, AlertTriangle, Search, CalendarIcon, X, RotateCcw, Archive, Pencil, FileDown, Calendar as CalendarLucide, FileSpreadsheet, ChevronLeft, ChevronRight, Check, XCircle, MessageSquareWarning } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { useInventory } from '@/hooks/useInventory';
import { useStockReleasesForPeriod } from '@/hooks/useStockReleasesForPeriod';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { DeliveryStatus, StockRelease, UserRole } from '@/types/inventory';
import { format, isWithinInterval, startOfDay, endOfDay, differenceInDays } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import AllocationBillModal from '@/components/deliveries/AllocationBillModal';
import EditDeliveryModal from '@/components/deliveries/EditDeliveryModal';
import SummaryDeliveryModal from '@/components/deliveries/SummaryDeliveryModal';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { exportToExcel } from '@/lib/excelExport';
import { toast as sonnerToast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ColumnSettings, { ColumnConfig, ColumnKey } from '@/components/deliveries/ColumnSettings';
import { useColumnSettings } from '@/hooks/useColumnSettings';
import { PhotoUploadCell } from '@/components/deliveries/PhotoUploadCell';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  getStockReleaseBoxTotal,
  getStockReleaseCountingReleases,
  getStockReleaseDisplayKey,
  getStockReleaseGroupAmountTotal,
  getStockReleaseGroupKey,
  getStockReleaseQty,
  isEmptyPendingHistoryRow,
  isImportedStockReleaseProductRow,
} from '@/lib/stockReleaseDedupe';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const HISTORY_YEAR_OPTIONS = [2024, 2025, 2026];
const HISTORY_STORAGE_KEY = 'history_filter';
const ITEMS_PER_PAGE = 50;
const REVIEW_NOTIFICATION_ROLES: UserRole[] = ['admin', 'assistant'];
const REPORTER_NOTIFICATION_ROLES: UserRole[] = ['staff', 'oic', 'teamleader', 'uploader', 'hr', 'encoder'];
type HistoryColumnKey = 'allocation' | 'destination' | 'category' | 'totalBoxes' | 'amount' | 'totalQty' | 'dateOut' | 'dateReceived' | 'deliveryTime' | 'courier' | 'remarks';

const DEFAULT_HISTORY_COLUMNS: ColumnConfig[] = [
  { key: 'allocation' as ColumnKey, label: 'Allocation', visible: true, width: 160, minWidth: 120, maxWidth: 180 },
  { key: 'destination' as ColumnKey, label: 'Destination', visible: true, width: 130, minWidth: 90, maxWidth: 145 },
  { key: 'category' as ColumnKey, label: 'Category', visible: true, width: 90, minWidth: 70, maxWidth: 100 },
  { key: 'totalBoxes' as ColumnKey, label: 'Total Boxes', visible: true, width: 95, minWidth: 75, maxWidth: 105 },
  { key: 'amount' as ColumnKey, label: 'Amount', visible: true, width: 115, minWidth: 90, maxWidth: 130 },
  { key: 'totalQty' as ColumnKey, label: 'Total Qty/Items', visible: true, width: 110, minWidth: 90, maxWidth: 120 },
  { key: 'dateOut' as ColumnKey, label: 'Date Out Warehouse', visible: true, width: 125, minWidth: 105, maxWidth: 135 },
  { key: 'dateReceived' as ColumnKey, label: 'Date Received', visible: true, width: 125, minWidth: 110, maxWidth: 135 },
  { key: 'deliveryTime' as ColumnKey, label: 'Delivery Days', visible: true, width: 115, minWidth: 100, maxWidth: 125 },
  { key: 'courier' as ColumnKey, label: 'Courier', visible: true, width: 90, minWidth: 75, maxWidth: 100 },
  { key: 'remarks' as ColumnKey, label: 'Remarks', visible: true, width: 150, minWidth: 120, maxWidth: 170 },
];

const HISTORY_COLUMN_WIDTHS: Record<HistoryColumnKey, number> = {
  allocation: 160,
  destination: 130,
  category: 90,
  totalBoxes: 95,
  amount: 115,
  totalQty: 110,
  dateOut: 125,
  dateReceived: 125,
  deliveryTime: 115,
  courier: 90,
  remarks: 150,
};

const HISTORY_ACTIONS_WIDTH = 210;

interface GroupedRelease {
  batch_id: string;
  allocation_bill: string | null;
  destination: string;
  category: string | null;
  courier: string | null;
  waybill_no: string | null;
  notes: string | null;
  date_released: string;
  date_delivered: string | null;
  set_date: string | null;
  deleted_at?: string | null;
  delivery_status: DeliveryStatus;
  totalBoxes: number;
  amount: number | null;
  totalQty: number;
  itemCount: number;
  items: StockRelease[];
  releaseIds: string[];
  photo_url: string | null;
  photo_status: string | null;
  action_status: string | null;
}

const History = () => {
  const { deleteAllReleases, fetchDeletedReleases, permanentlyDeleteAllDeleted } = useInventory({ autoFetch: false });
  const { toast } = useToast();
  const { user, userRole } = useAuth();
  const { selectedBranch, loading: branchLoading } = useBranch();
  const location = useLocation();
  const navigate = useNavigate();
  const [selectedBatch, setSelectedBatch] = useState<GroupedRelease | null>(null);
  const [clearing, setClearing] = useState(false);
  const [clearingMonth, setClearingMonth] = useState(false);
  const [clearingDeleted, setClearingDeleted] = useState(false);
  const [reportingBatch, setReportingBatch] = useState<GroupedRelease | null>(null);
  const [reportNotes, setReportNotes] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  
  // Get saved filter from localStorage or use current date
  const getSavedHistoryFilter = () => {
    try {
      const saved = localStorage.getItem(HISTORY_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          month: typeof parsed.month === 'number' ? parsed.month : new Date().getMonth(),
          year: typeof parsed.year === 'number' ? parsed.year : new Date().getFullYear()
        };
      }
    } catch {}
    return { month: new Date().getMonth(), year: new Date().getFullYear() };
  };

  const savedHistoryFilter = getSavedHistoryFilter();
  const [selectedMonth, setSelectedMonth] = useState<number>(savedHistoryFilter.month);
  const [selectedYear, setSelectedYear] = useState<number>(savedHistoryFilter.year);
  const [clearMonth, setClearMonth] = useState<number>(savedHistoryFilter.month);
  const [clearYear, setClearYear] = useState<number>(savedHistoryFilter.year);
  const [showAllYear, setShowAllYear] = useState(false);
  const [activeTab, setActiveTab] = useState('active');
  const [currentPage, setCurrentPage] = useState(1);
  const [deletedCurrentPage, setDeletedCurrentPage] = useState(1);
  
  // Persist filter to localStorage when it changes
  useEffect(() => {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify({ month: selectedMonth, year: selectedYear }));
  }, [selectedMonth, selectedYear]);
  const [deletedReleases, setDeletedReleases] = useState<StockRelease[]>([]);
  const [loadingDeleted, setLoadingDeleted] = useState(false);
  const [editingBatch, setEditingBatch] = useState<GroupedRelease | null>(null);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const {
    releases,
    loading,
    refetch: refetchHistory,
  } = useStockReleasesForPeriod({
    month: selectedMonth,
    year: selectedYear,
    branchId: selectedBranch?.id ?? null,
    allYear: showAllYear,
    allDates: showAllYear || Boolean(debouncedSearchQuery.trim()),
    search: debouncedSearchQuery,
    progressive: true,
    enabled: !branchLoading,
  });
  
  const { columns, setColumns, isAdmin } = useColumnSettings('history', DEFAULT_HISTORY_COLUMNS);
  const isViewer = userRole === 'viewer';
  const isEncoder = userRole === 'encoder';
  const isAssistant = userRole === 'assistant';
  const canEdit = isAdmin || isEncoder || isAssistant; // Admin, encoder, and assistant can edit
  const canDelete = isAdmin; // Only admin can delete
  const canExport = userRole !== 'uploader';
  const canReportIssue = Boolean(userRole && REPORTER_NOTIFICATION_ROLES.includes(userRole));
  const canUseHistoryReviewActions = canReportIssue || isAdmin || isAssistant;

  const hasAllocationBillDetails = useCallback((group: GroupedRelease) => {
    return group.items.some(isImportedStockReleaseProductRow);
  }, []);

  const openAllocationBill = useCallback((group: GroupedRelease) => {
    if (!hasAllocationBillDetails(group)) return;
    setSelectedBatch(group);
  }, [hasAllocationBillDetails]);

  const formatAmount = useCallback((value: number | null | undefined) => {
    if (value === null || value === undefined) return '-';
    const num = Number(value);
    if (!Number.isFinite(num)) return '-';
    return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }, []);

  const getGroupLabel = useCallback((group: GroupedRelease) => {
    return group.allocation_bill || group.batch_id.slice(0, 8).toUpperCase();
  }, []);

  const getGroupMonthYear = useCallback((group: GroupedRelease) => {
    const dateValue = group.set_date || group.date_released;
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) {
      return { month: selectedMonth, year: selectedYear };
    }

    return { month: date.getMonth(), year: date.getFullYear() };
  }, [selectedMonth, selectedYear]);

  const getHistoryNotificationLink = useCallback((group: GroupedRelease, mode: 'editRelease' | 'viewRelease') => {
    const releaseId = group.releaseIds[0];
    const { month, year } = getGroupMonthYear(group);
    return `/history?${mode}=${encodeURIComponent(releaseId)}&month=${month}&year=${year}`;
  }, [getGroupMonthYear]);

  const notifyUsersByRoles = useCallback(async (
    roles: UserRole[],
    createNotification: (userId: string) => {
      title: string;
      message: string;
      type?: string;
      link?: string | null;
    }
  ) => {
    const { data: recipients, error } = await supabase
      .from('user_roles')
      .select('user_id')
      .in('role', roles);

    if (error) throw error;

    const recipientIds = Array.from(
      new Set((recipients || [])
        .map(recipient => recipient.user_id)
        .filter((userId): userId is string => Boolean(userId) && userId !== user?.id))
    );

    if (recipientIds.length === 0) return;

    const notifications = recipientIds.map(userId => ({
      user_id: userId,
      ...createNotification(userId),
      created_by: user?.id ?? null,
    }));

    const { error: notificationError } = await supabase
      .from('notifications')
      .insert(notifications);

    if (notificationError) throw notificationError;
  }, [user?.id]);

  const combineNotes = (current?: string | null, next?: string | null) => {
    const notes = [current, next]
      .map(note => note?.trim())
      .filter((note): note is string => Boolean(note));

    return Array.from(new Set(notes)).join(' | ') || null;
  };

  const isColumnVisible = (key: string) => {
    const col = columns.find(c => c.key === key);
    return col?.visible ?? true;
  };

  const getColumnWidth = (key: string) => {
    return HISTORY_COLUMN_WIDTHS[key as HistoryColumnKey] ?? 100;
  };

  const visibleColumnCount = columns.filter(c => c.visible).length + 1; // +1 for Actions
  const visibleTableWidth = columns.reduce((total, column) => {
    return column.visible ? total + getColumnWidth(column.key) : total;
  }, HISTORY_ACTIONS_WIDTH);

  // Fetch deleted releases when switching to deleted tab
  useEffect(() => {
    if (activeTab === 'deleted') {
      setLoadingDeleted(true);
      fetchDeletedReleases().then((data) => {
        setDeletedReleases(data);
        setLoadingDeleted(false);
      });
    }
  }, [activeTab]);

  // Group releases by allocation bill first, then fallback to batch_id.
  const groupReleases = (releasesList: StockRelease[], filterByBranch = true) => {
    // Filter by branch if enabled - STRICT branch isolation
    const filtered = filterByBranch && selectedBranch 
      ? releasesList.filter(r => r.branch_id === selectedBranch.id)
      : releasesList;
    const activeRows = filtered.filter(release => !isEmptyPendingHistoryRow(release));
    
    const groups: Record<string, GroupedRelease> = {};
    const countedReleaseKeys: Record<string, Set<string>> = {};
    
    // Use filtered list instead of original releasesList
    activeRows.forEach(release => {
      const batchKey = getStockReleaseGroupKey(release);
      
      if (!groups[batchKey]) {
        groups[batchKey] = {
          batch_id: release.batch_id || release.id,
          allocation_bill: release.allocation_bill,
          destination: release.destination,
          category: release.category,
          courier: release.courier,
          waybill_no: release.waybill_no,
          notes: release.notes,
          date_released: release.date_released,
          date_delivered: release.date_delivered,
          set_date: release.set_date,
          deleted_at: release.deleted_at,
          delivery_status: release.delivery_status,
          totalBoxes: 0,
          amount: null,
          totalQty: 0,
          itemCount: 0,
          items: [],
          releaseIds: [],
          photo_url: release.photo_url,
          photo_status: release.photo_status,
          action_status: (release as unknown as { action_status?: string | null }).action_status ?? null,
        };
        countedReleaseKeys[batchKey] = new Set();
      }
      
      const group = groups[batchKey];
      group.allocation_bill = group.allocation_bill || release.allocation_bill;
      group.destination = group.destination || release.destination;
      group.category = group.category || release.category;
      group.courier = group.courier || release.courier;
      group.waybill_no = group.waybill_no || release.waybill_no;
      group.notes = combineNotes(group.notes, release.notes);
      group.set_date = group.set_date || release.set_date;
      group.date_delivered = group.date_delivered || release.date_delivered;
      group.photo_url = group.photo_url || release.photo_url;
      group.photo_status = group.photo_status || release.photo_status;
      group.action_status = group.action_status || ((release as unknown as { action_status?: string | null }).action_status ?? null);
      if (release.date_delivered || release.delivery_status === 'delivered') {
        group.delivery_status = 'delivered';
      }

      group.releaseIds.push(release.id);

      const releaseKey = getStockReleaseDisplayKey(release);
      if (countedReleaseKeys[batchKey].has(releaseKey)) {
        return;
      }
      countedReleaseKeys[batchKey].add(releaseKey);

      group.items.push(release);
      group.totalBoxes += release.boxes_released;
      group.totalQty += release.total_qty || 0;
      group.itemCount += 1;

    });
    
    const normalizedGroups = Object.values(groups).map(group => {
      const countingReleases = getStockReleaseCountingReleases(group.items);
      const totalAmount = getStockReleaseGroupAmountTotal(group.items);

      return {
        ...group,
        totalBoxes: getStockReleaseBoxTotal(group.items),
        totalQty: countingReleases.reduce((sum, release) => sum + getStockReleaseQty(release), 0),
        amount: totalAmount > 0 ? totalAmount : null,
        itemCount: countingReleases.length,
      };
    });

    // Sort: pending review (no action_status) first, then by set_date ascending.
    return normalizedGroups.sort((a, b) => {
      const aPending = !a.action_status;
      const bPending = !b.action_status;
      if (aPending && !bPending) return -1;
      if (!aPending && bPending) return 1;

      const dateA = a.set_date ? new Date(a.set_date).getTime() : 0;
      const dateB = b.set_date ? new Date(b.set_date).getTime() : 0;
      
      // If both have set_date, sort by set_date ascending (Dec 1 before Dec 5)
      if (dateA && dateB) {
        return dateA - dateB;
      }
      // Items without set_date go to the end
      if (!dateA && dateB) return 1;
      if (dateA && !dateB) return -1;
      
      // If neither has set_date, sort by date_released descending
      return new Date(b.date_released).getTime() - new Date(a.date_released).getTime();
    });
  };

  const groupedReleases = useMemo(() => groupReleases(releases, true), [releases, selectedBranch]);
  const groupedDeletedReleases = useMemo(() => groupReleases(deletedReleases, false), [deletedReleases]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const editReleaseId = params.get('editRelease');
    const viewReleaseId = params.get('viewRelease');
    const targetReleaseId = editReleaseId || viewReleaseId;
    if (!targetReleaseId) return;

    const queryMonth = Number(params.get('month'));
    const queryYear = Number(params.get('year'));

    if (Number.isInteger(queryMonth) && queryMonth >= 0 && queryMonth <= 11 && selectedMonth !== queryMonth) {
      setShowAllYear(false);
      setSelectedMonth(queryMonth);
      return;
    }

    if (Number.isInteger(queryYear) && queryYear > 2000 && selectedYear !== queryYear) {
      setSelectedYear(queryYear);
      return;
    }

    if (showAllYear) {
      setShowAllYear(false);
      return;
    }

    if (searchQuery.trim()) {
      setSearchQuery('');
      return;
    }

    const targetGroup = groupedReleases.find(group => group.releaseIds.includes(targetReleaseId));
    if (!targetGroup) return;

    setActiveTab('active');
    if (editReleaseId && (isAdmin || isAssistant)) {
      setEditingBatch(targetGroup);
    } else if (viewReleaseId) {
      openAllocationBill(targetGroup);
    }

    params.delete('editRelease');
    params.delete('viewRelease');
    const nextSearch = params.toString();
    navigate(
      { pathname: location.pathname, search: nextSearch ? `?${nextSearch}` : '' },
      { replace: true }
    );
  }, [
    groupedReleases,
    isAdmin,
    isAssistant,
    location.pathname,
    location.search,
    navigate,
    openAllocationBill,
    searchQuery,
    selectedMonth,
    selectedYear,
    showAllYear,
  ]);

  // Filter grouped releases based on search query, date range, month/year (or all year), and status
  const filteredReleases = useMemo(() => {
    const hasSearch = Boolean(debouncedSearchQuery.trim());

    return groupedReleases.filter(group => {
      // Month/Year filter - use set_date (Date Out) if available, otherwise date_released
      const dateToFilter = group.set_date ? new Date(group.set_date) : new Date(group.date_released);
      
      if (!hasSearch) {
        // Year filter always applies
        if (dateToFilter.getFullYear() !== selectedYear) {
          return false;
        }
        
        // Month filter only applies if not showing all year
        if (!showAllYear && dateToFilter.getMonth() !== selectedMonth) {
          return false;
        }
      }

      // Date range filter
      if (startDate || endDate) {
        if (startDate && endDate) {
          if (!isWithinInterval(dateToFilter, { start: startOfDay(startDate), end: endOfDay(endDate) })) {
            return false;
          }
        } else if (startDate && dateToFilter < startOfDay(startDate)) {
          return false;
        } else if (endDate && dateToFilter > endOfDay(endDate)) {
          return false;
        }
      }
      
      // Status filter
      if (statusFilter !== 'all' && group.delivery_status !== statusFilter) {
        return false;
      }
      
      // Search filter
      if (debouncedSearchQuery.trim()) {
        const query = debouncedSearchQuery.toLowerCase();
        if (group.destination.toLowerCase().includes(query)) return true;
        if (group.courier?.toLowerCase().includes(query)) return true;
        if (group.delivery_status.toLowerCase().includes(query)) return true;
        if (group.allocation_bill?.toLowerCase().includes(query)) return true;
        if (group.waybill_no?.toLowerCase().includes(query)) return true;
        if (group.category?.toLowerCase().includes(query)) return true;
        if (group.notes?.toLowerCase().includes(query)) return true;
        
        const itemMatch = group.items.some(item => 
          item.product_code?.toLowerCase().includes(query) ||
          item.product_description?.toLowerCase().includes(query) ||
          item.inventory_item?.item_name?.toLowerCase().includes(query) ||
          item.inventory_item?.item_code?.toLowerCase().includes(query) ||
          item.inventory_item?.description?.toLowerCase().includes(query)
        );
        if (itemMatch) return true;
        
        return false;
      }
      
      return true;
    });
  }, [groupedReleases, debouncedSearchQuery, startDate, endDate, statusFilter, selectedMonth, selectedYear, showAllYear]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchQuery, startDate, endDate, statusFilter, selectedMonth, selectedYear, showAllYear]);

  // Pagination for active releases
  const totalPages = Math.ceil(filteredReleases.length / ITEMS_PER_PAGE);
  const paginatedReleases = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredReleases.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredReleases, currentPage]);

  // Pagination for deleted releases
  const deletedTotalPages = Math.ceil(groupedDeletedReleases.length / ITEMS_PER_PAGE);
  const paginatedDeletedReleases = useMemo(() => {
    const start = (deletedCurrentPage - 1) * ITEMS_PER_PAGE;
    return groupedDeletedReleases.slice(start, start + ITEMS_PER_PAGE);
  }, [groupedDeletedReleases, deletedCurrentPage]);

  // Generate page numbers for pagination
  const getPageNumbers = (current: number, total: number) => {
    const pages: (number | string)[] = [];
    if (total <= 7) {
      for (let i = 1; i <= total; i++) pages.push(i);
    } else {
      if (current <= 3) {
        pages.push(1, 2, 3, 4, '...', total);
      } else if (current >= total - 2) {
        pages.push(1, '...', total - 3, total - 2, total - 1, total);
      } else {
        pages.push(1, '...', current - 1, current, current + 1, '...', total);
      }
    }
    return pages;
  };

  const clearFilters = () => {
    setStartDate(undefined);
    setEndDate(undefined);
    setStatusFilter('all');
    setCurrentPage(1);
  };

  const handleDelete = async (group: GroupedRelease, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this release? It will be moved to Recently Deleted.')) return;
    
    try {
      const { error } = await supabase
        .from('stock_releases')
        .update({ deleted_at: new Date().toISOString() })
        .in('id', group.releaseIds);
      if (error) throw error;
      refetchHistory(true);
      toast({ title: 'Success', description: 'Release moved to Recently Deleted' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to delete release', variant: 'destructive' });
    }
  };

  const handleRestore = async (group: GroupedRelease, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { error } = await supabase
        .from('stock_releases')
        .update({ deleted_at: null })
        .in('id', group.releaseIds);
      if (error) throw error;
      setDeletedReleases(deletedReleases.filter(r => !group.releaseIds.includes(r.id)));
      refetchHistory(true);
      toast({ title: 'Success', description: 'Release restored successfully' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to restore release', variant: 'destructive' });
    }
  };

  const handlePermanentDelete = async (group: GroupedRelease, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to permanently delete this release? This cannot be undone.')) return;
    
    try {
      const { error } = await supabase
        .from('stock_releases')
        .delete()
        .in('id', group.releaseIds);
      if (error) throw error;
      setDeletedReleases(deletedReleases.filter(r => !group.releaseIds.includes(r.id)));
      toast({ title: 'Success', description: 'Release permanently deleted' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to delete release', variant: 'destructive' });
    }
  };

  const handleEditDelivery = (group: GroupedRelease, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingBatch(group);
  };

  const notifyReportersAfterFix = useCallback(async (group: GroupedRelease) => {
    const allocationLabel = getGroupLabel(group);
    await notifyUsersByRoles(REPORTER_NOTIFICATION_ROLES, () => ({
      title: 'History Record Updated',
      message: `${allocationLabel} has been edited/fixed by Admin or Assistant.`,
      type: 'success',
      link: getHistoryNotificationLink(group, 'viewRelease'),
    }));
  }, [getGroupLabel, getHistoryNotificationLink, notifyUsersByRoles]);

  const handleIssueReportSubmit = async () => {
    if (!reportingBatch || !user) return;

    const issueNotes = reportNotes.trim();
    if (!issueNotes) {
      toast({
        title: 'Notes required',
        description: 'Please describe kung anong mali bago i-send.',
        variant: 'destructive',
      });
      return;
    }

    setReportSubmitting(true);
    try {
      const { error: updErr } = await supabase
        .from('stock_releases')
        .update({ action_status: 'no' })
        .in('id', reportingBatch.releaseIds);
      if (updErr) throw updErr;

      const discrepancyPayload = {
        batch_id: reportingBatch.batch_id,
        allocation_bill: reportingBatch.allocation_bill,
        destination: reportingBatch.destination,
        category: reportingBatch.category,
        courier: reportingBatch.courier,
        waybill_no: reportingBatch.waybill_no,
        total_boxes: reportingBatch.totalBoxes,
        total_qty: reportingBatch.totalQty,
        amount: reportingBatch.amount,
        date_out: reportingBatch.set_date,
        date_received: reportingBatch.date_delivered,
        remarks: reportingBatch.notes,
        discrepancy_notes: issueNotes,
        resolution_status: 'unresolved',
        deleted_at: null,
        branch_id: selectedBranch?.id ?? null,
        created_by: user.id,
      };

      const { data: existing } = await supabase
        .from('discrepancies')
        .select('id')
        .eq('batch_id', reportingBatch.batch_id)
        .is('deleted_at', null)
        .maybeSingle();

      if (existing) {
        const { error: updateDiscrepancyError } = await supabase
          .from('discrepancies')
          .update(discrepancyPayload)
          .eq('id', existing.id);
        if (updateDiscrepancyError) throw updateDiscrepancyError;
      } else {
        const { error: insertDiscrepancyError } = await supabase
          .from('discrepancies')
          .insert(discrepancyPayload);
        if (insertDiscrepancyError) throw insertDiscrepancyError;
      }

      const allocationLabel = getGroupLabel(reportingBatch);
      await notifyUsersByRoles(REVIEW_NOTIFICATION_ROLES, () => ({
        title: 'History Issue Reported',
        message: `${user.email || 'User'} reported ${allocationLabel}: ${issueNotes}`,
        type: 'warning',
        link: getHistoryNotificationLink(reportingBatch, 'editRelease'),
      }));

      setReportingBatch(null);
      setReportNotes('');
      refetchHistory(true);
      toast({
        title: 'Report sent',
        description: 'Admin and Assistant have been notified.',
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to send report';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    } finally {
      setReportSubmitting(false);
    }
  };

  const handleActionStatus = async (group: GroupedRelease, status: 'yes' | 'no', e: React.MouseEvent) => {
    e.stopPropagation();
    if (status === 'no') {
      setReportingBatch(group);
      setReportNotes('');
      return;
    }

    try {
      // 1) Update stock_releases.action_status for the batch
      const { error: updErr } = await supabase
        .from('stock_releases')
        .update({ action_status: status })
        .in('id', group.releaseIds);
      if (updErr) throw updErr;

      await supabase
        .from('discrepancies')
        .update({
          deleted_at: new Date().toISOString(),
          resolution_status: 'resolved',
        })
        .eq('batch_id', group.batch_id)
        .is('deleted_at', null);

      if (group.action_status === 'no' && (isAdmin || isAssistant)) {
        await notifyReportersAfterFix(group);
      }

      toast({ title: 'Marked as OK', description: 'Delivery confirmed na maayos' });
      refetchHistory(true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to update action';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    }
  };

  const handleRemarksChange = async (group: GroupedRelease, notes: string) => {
    try {
      const { error } = await supabase
        .from('stock_releases')
        .update({ notes })
        .in('id', group.releaseIds);
      
      if (error) throw error;
      toast({ title: 'Success', description: 'Remarks updated' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update remarks', variant: 'destructive' });
    }
  };

  const handleClearAll = async () => {
    setClearing(true);
    try {
      await deleteAllReleases();
      refetchHistory(true);
      toast({ title: 'Success', description: 'All transaction history moved to Recently Deleted' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to clear history', variant: 'destructive' });
    } finally {
      setClearing(false);
    }
  };

  const handleClearMonth = async () => {
    if (!selectedBranch?.id) {
      toast({
        title: 'No branch selected',
        description: 'Please select a branch before clearing a month.',
        variant: 'destructive',
      });
      return;
    }

    setClearingMonth(true);
    try {
      const start = new Date(Date.UTC(clearYear, clearMonth, 1, 0, 0, 0, 0)).toISOString();
      const end = new Date(Date.UTC(clearYear, clearMonth + 1, 1, 0, 0, 0, 0)).toISOString();
      const periodFilter = [
        `and(set_date.gte.${start},set_date.lt.${end})`,
        `and(set_date.is.null,date_released.gte.${start},date_released.lt.${end})`,
      ].join(',');

      const { error } = await supabase
        .from('stock_releases')
        .update({ deleted_at: new Date().toISOString() })
        .eq('branch_id', selectedBranch.id)
        .is('deleted_at', null)
        .or(periodFilter);

      if (error) throw error;

      refetchHistory(true);
      toast({
        title: 'Success',
        description: `${MONTHS[clearMonth]} ${clearYear} transaction history moved to Recently Deleted`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to clear selected month',
        variant: 'destructive',
      });
    } finally {
      setClearingMonth(false);
    }
  };

  const handleClearAllDeleted = async () => {
    setClearingDeleted(true);
    try {
      await permanentlyDeleteAllDeleted();
      setDeletedReleases([]);
      toast({ title: 'Success', description: 'All deleted items permanently removed' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to clear deleted items', variant: 'destructive' });
    } finally {
      setClearingDeleted(false);
    }
  };

  const handleDeliveryEditSuccess = useCallback(async () => {
    const fixedGroup = editingBatch;

    try {
      if (fixedGroup?.action_status === 'no' && (isAdmin || isAssistant)) {
        await supabase
          .from('stock_releases')
          .update({ action_status: 'yes' })
          .in('id', fixedGroup.releaseIds);

        await supabase
          .from('discrepancies')
          .update({
            resolution_status: 'resolved',
            deleted_at: new Date().toISOString(),
          })
          .eq('batch_id', fixedGroup.batch_id)
          .is('deleted_at', null);

        await notifyReportersAfterFix(fixedGroup);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to send fixed notification';
      toast({ title: 'Notification Error', description: msg, variant: 'destructive' });
    } finally {
      refetchHistory(true);
    }
  }, [editingBatch, isAdmin, isAssistant, notifyReportersAfterFix, refetchHistory, toast]);

  const handleExportExcel = async () => {
    try {
      const excelData = filteredReleases.map(group => ({
        allocation: group.allocation_bill || group.batch_id.slice(0, 8),
        destination: group.destination,
        category: group.category || '-',
        totalBoxes: group.totalBoxes,
        amount: group.amount ?? null,
        totalQty: group.totalQty,
        dateOut: group.set_date ? format(new Date(group.set_date), 'MMM dd, yyyy') : '-',
        dateReceived: group.date_delivered ? format(new Date(group.date_delivered), 'MMM dd, yyyy') : '-',
        deliveryDays: group.set_date && group.date_delivered
          ? differenceInDays(new Date(group.date_delivered), new Date(group.set_date)) + ' days'
          : '-',
        courier: group.courier || '-',
        remarks: group.notes || '-',
      }));

      await exportToExcel({
        title: 'Transaction History',
        subtitle: `${MONTHS[selectedMonth]} ${selectedYear}`,
        filename: `transaction-history-${MONTHS[selectedMonth]}-${selectedYear}`,
        columns: [
          { header: 'Allocation', key: 'allocation', width: 22 },
          { header: 'Destination', key: 'destination', width: 18 },
          { header: 'Category', key: 'category', width: 12 },
          { header: 'Total Boxes', key: 'totalBoxes', width: 14 },
          { header: 'Amount', key: 'amount', width: 14 },
          { header: 'Total Qty', key: 'totalQty', width: 14 },
          { header: 'Date Out', key: 'dateOut', width: 15 },
          { header: 'Date Received', key: 'dateReceived', width: 15 },
          { header: 'Delivery Days', key: 'deliveryDays', width: 14 },
          { header: 'Courier', key: 'courier', width: 12 },
          { header: 'Remarks', key: 'remarks', width: 22 },
        ],
        data: excelData,
        showTotals: true,
        totalColumns: ['totalBoxes', 'totalQty'],
      });
      sonnerToast.success('Excel exported successfully!');
    } catch (error) {
      console.error('Excel export error:', error);
      sonnerToast.error('Failed to export Excel');
    }
  };

  if (activeTab === 'active' && (branchLoading || (loading && releases.length === 0))) {
    return <div className="flex items-center justify-center h-64"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;
  }

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center">
          <TabsList>
            <TabsTrigger value="active">Transaction History</TabsTrigger>
            {!isViewer && (
              <TabsTrigger value="deleted" className="flex items-center gap-1">
                <Archive className="h-4 w-4" />
                Recently Deleted
              </TabsTrigger>
            )}
          </TabsList>
          
          <div className="flex items-center gap-2">
            {activeTab === 'active' && !isViewer && canExport && (
              <Button variant="outline" size="sm" onClick={handleExportExcel}>
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Save Excel
              </Button>
            )}
            {activeTab === 'active' && !isViewer && canExport && (
              <Button variant="outline" size="sm" onClick={() => setShowSummaryModal(true)}>
                <FileDown className="h-4 w-4 mr-2" />
                Save PDF
              </Button>
            )}

            {activeTab === 'active' && isAdmin && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setClearMonth(selectedMonth);
                      setClearYear(selectedYear);
                    }}
                    disabled={clearingMonth || branchLoading || !selectedBranch}
                    className="border-destructive/30 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    {clearingMonth ? 'Clearing...' : 'Clear Month'}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-destructive" />
                      Clear History By Month
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      Choose the exact month and year to clear before confirming.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <div className="space-y-4 py-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Month</label>
                        <Select value={clearMonth.toString()} onValueChange={(val) => setClearMonth(parseInt(val))}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select month" />
                          </SelectTrigger>
                          <SelectContent>
                            {MONTHS.map((month, index) => (
                              <SelectItem key={month} value={index.toString()}>{month}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Year</label>
                        <Select value={clearYear.toString()} onValueChange={(val) => setClearYear(parseInt(val))}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select year" />
                          </SelectTrigger>
                          <SelectContent>
                            {HISTORY_YEAR_OPTIONS.map((year) => (
                              <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                      Warning: this will move all {MONTHS[clearMonth]} {clearYear} transaction history for {selectedBranch?.name || 'the selected branch'} to Recently Deleted. Other months and branches will not be touched.
                    </div>
                  </div>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleClearMonth} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Yes, Clear {MONTHS[clearMonth]} {clearYear}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}

            {activeTab === 'active' && isAdmin && groupedReleases.length > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" disabled={clearing}>
                    <Trash2 className="h-4 w-4 mr-2" />
                    {clearing ? 'Clearing...' : 'Clear All'}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-destructive" />
                      Clear All Transaction History
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      This will move all {groupedReleases.length} transaction records to Recently Deleted.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleClearAll} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Yes, Clear All
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}

            {activeTab === 'deleted' && isAdmin && groupedDeletedReleases.length > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" disabled={clearingDeleted}>
                    <Trash2 className="h-4 w-4 mr-2" />
                    {clearingDeleted ? 'Clearing...' : 'Clear All'}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-destructive" />
                      Permanently Delete All
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete all {groupedDeletedReleases.length} records. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleClearAllDeleted} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Yes, Delete All Permanently
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
        <TabsContent value="active" className="space-y-4">
          {/* Search and Filters */}
          <div className="flex flex-col gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by allocation bill, waybill, destination, courier..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Month/Year Filter */}
              <div className="flex items-center gap-2 bg-muted/50 border border-border rounded-lg px-3 py-1.5">
                <CalendarLucide className="h-4 w-4 text-muted-foreground" />
                <Select value={selectedMonth.toString()} onValueChange={(val) => { setSelectedMonth(parseInt(val)); setShowAllYear(false); }}>
                  <SelectTrigger className="w-[110px] h-8 border-0 bg-transparent focus:ring-0">
                    <SelectValue placeholder="Month" />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((month, index) => (
                      <SelectItem key={index} value={index.toString()}>{month}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={selectedYear.toString()} onValueChange={(val) => setSelectedYear(parseInt(val))}>
                  <SelectTrigger className="w-[80px] h-8 border-0 bg-transparent focus:ring-0">
                    <SelectValue placeholder="Year" />
                  </SelectTrigger>
                  <SelectContent>
                    {HISTORY_YEAR_OPTIONS.map((year) => (
                      <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button 
                variant={showAllYear ? "default" : "outline"} 
                size="sm"
                onClick={() => setShowAllYear(!showAllYear)}
              >
                {showAllYear ? 'Showing All Year' : 'All Year'}
              </Button>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in_transit">In Transit</SelectItem>
                  <SelectItem value="out_for_delivery">Out for Delivery</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                </SelectContent>
              </Select>

              {statusFilter !== 'all' && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="h-4 w-4 mr-1" />
                  Clear filters
                </Button>
              )}
              {isAdmin && <ColumnSettings columns={columns} onColumnChange={setColumns} defaultColumns={DEFAULT_HISTORY_COLUMNS} allowWidthSettings={false} />}
            </div>
          </div>

          <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
            <Table className="table-fixed text-xs sm:text-sm" style={{ minWidth: visibleTableWidth }}>
              <TableHeader>
                <TableRow className="transition-none">
                  {isColumnVisible('allocation') && <TableHead className="px-3 pl-[64px] whitespace-nowrap" style={{ width: getColumnWidth('allocation') }}>Allocation</TableHead>}
                  {isColumnVisible('destination') && <TableHead className="px-3 whitespace-nowrap" style={{ width: getColumnWidth('destination') }}>Destination</TableHead>}
                  {isColumnVisible('category') && <TableHead className="px-3 whitespace-nowrap" style={{ width: getColumnWidth('category') }}>Category</TableHead>}
                  {isColumnVisible('totalBoxes') && <TableHead className="px-3 text-center whitespace-nowrap" style={{ width: getColumnWidth('totalBoxes') }}>Total Boxes</TableHead>}
                  {isColumnVisible('amount') && <TableHead className="px-3 text-center whitespace-nowrap" style={{ width: getColumnWidth('amount') }}>Amount</TableHead>}
                  {isColumnVisible('totalQty') && <TableHead className="px-3 text-center whitespace-nowrap" style={{ width: getColumnWidth('totalQty') }}>Total Qty/Items</TableHead>}
                  {isColumnVisible('dateOut') && <TableHead className="px-3 whitespace-nowrap" style={{ width: getColumnWidth('dateOut') }}>Date Out Warehouse</TableHead>}
                  {isColumnVisible('dateReceived') && <TableHead className="px-3 whitespace-nowrap" style={{ width: getColumnWidth('dateReceived') }}>Date Received</TableHead>}
                  {isColumnVisible('deliveryTime') && <TableHead className="px-3 text-center whitespace-nowrap" style={{ width: getColumnWidth('deliveryTime') }}>Delivery Days</TableHead>}
                  {isColumnVisible('courier') && <TableHead className="px-3 whitespace-nowrap" style={{ width: getColumnWidth('courier') }}>Courier</TableHead>}
                  {isColumnVisible('remarks') && <TableHead className="px-3 whitespace-nowrap" style={{ width: getColumnWidth('remarks') }}>Remarks</TableHead>}
                  <TableHead className="px-3 text-right whitespace-nowrap" style={{ width: HISTORY_ACTIONS_WIDTH }}>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReleases.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={visibleColumnCount} className="text-center py-12">
                      <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
                      <p className="text-muted-foreground">
                        {searchQuery || startDate || endDate || statusFilter !== 'all' ? 'No results found' : 'No transaction history'}
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedReleases.map((group, index) => {
                    const canOpenBill = hasAllocationBillDetails(group);

                    return (
                    <TableRow 
                      key={group.batch_id} 
                      className={cn(
                        "transition-colors hover:bg-muted/50",
                        canOpenBill ? "cursor-pointer" : "cursor-default"
                      )}
                      onClick={() => openAllocationBill(group)}
                    >
                      {isColumnVisible('allocation') && (
                        <TableCell className="px-3 py-3 font-medium whitespace-nowrap" style={{ width: getColumnWidth('allocation') }}>
                          <div className="flex min-w-0 items-center gap-2">
                            <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                              <PhotoUploadCell
                                batchId={group.batch_id}
                                photoUrl={group.photo_url}
                                photoStatus={group.photo_status}
                                currentAllocation={group.allocation_bill}
                                onPhotoUpdate={() => refetchHistory(true)}
                              />
                            </div>
                            <button
                              type="button"
                              disabled={!canOpenBill}
                              className={cn(
                                "min-w-0 truncate text-left font-mono rounded-sm",
                                canOpenBill
                                  ? "underline-offset-4 hover:underline focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                                  : "cursor-default"
                              )}
                              onClick={(e) => {
                                e.stopPropagation();
                                openAllocationBill(group);
                              }}
                            >
                              {group.allocation_bill || '-'}
                            </button>
                          </div>
                        </TableCell>
                      )}
                      {isColumnVisible('destination') && <TableCell className="px-3 py-3 whitespace-nowrap" style={{ width: getColumnWidth('destination') }}>{group.destination}</TableCell>}
                      {isColumnVisible('category') && <TableCell className="px-3 py-3 whitespace-nowrap" style={{ width: getColumnWidth('category') }}>{group.category || '-'}</TableCell>}
                      {isColumnVisible('totalBoxes') && <TableCell className="px-3 py-3 text-center whitespace-nowrap" style={{ width: getColumnWidth('totalBoxes') }}>{group.totalBoxes}</TableCell>}
                      {isColumnVisible('amount') && <TableCell className="px-3 py-3 text-center whitespace-nowrap font-medium" style={{ width: getColumnWidth('amount') }}>{formatAmount(group.amount)}</TableCell>}
                      {isColumnVisible('totalQty') && <TableCell className="px-3 py-3 text-center whitespace-nowrap" style={{ width: getColumnWidth('totalQty') }}>{group.totalQty || group.itemCount}</TableCell>}
                      {isColumnVisible('dateOut') && <TableCell className="px-3 py-3 text-muted-foreground whitespace-nowrap" style={{ width: getColumnWidth('dateOut') }}>{group.set_date ? format(new Date(group.set_date), 'MMM d, yyyy') : '-'}</TableCell>}
                      {isColumnVisible('dateReceived') && (
                        <TableCell className="px-3 py-3 text-muted-foreground whitespace-nowrap font-medium" style={{ width: getColumnWidth('dateReceived') }}>
                          {group.date_delivered ? format(new Date(group.date_delivered), 'MMM d, yyyy') : '-'}
                        </TableCell>
                      )}
                      {isColumnVisible('deliveryTime') && (
                        <TableCell className="px-3 py-3 text-center whitespace-nowrap font-medium" style={{ width: getColumnWidth('deliveryTime') }}>
                          {group.set_date && group.date_delivered ? (
                            <span className="font-medium text-emerald-600 dark:text-emerald-400">
                              {differenceInDays(new Date(group.date_delivered), new Date(group.set_date))} day(s)
                            </span>
                          ) : '-'}
                        </TableCell>
                      )}
                      {isColumnVisible('courier') && <TableCell className="px-3 py-3 whitespace-nowrap" style={{ width: getColumnWidth('courier') }}>{group.courier || '-'}</TableCell>}
                      {isColumnVisible('remarks') && (
                        <TableCell className="px-3 py-3" onClick={(e) => e.stopPropagation()} style={{ width: getColumnWidth('remarks') }}>
                          {isAdmin ? (
                            <Input
                              placeholder="Enter remarks"
                              defaultValue={group.notes || ''}
                              className="h-8 w-full text-sm"
                              onBlur={(e) => {
                                if (e.target.value !== (group.notes || '')) {
                                  handleRemarksChange(group, e.target.value);
                                }
                              }}
                            />
                          ) : (
                            <span className="block truncate text-sm">{group.notes || '-'}</span>
                          )}
                        </TableCell>
                      )}
                      <TableCell className="px-3 py-3" style={{ width: HISTORY_ACTIONS_WIDTH }}>
                        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openAllocationBill(group)}
                            title="View allocation bill"
                            disabled={!canOpenBill}
                            className="h-7 w-7"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="default"
                            disabled={!canUseHistoryReviewActions}
                            className={cn(
                              "h-7 px-2 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600",
                              group.action_status === 'yes' && "ring-2 ring-emerald-300"
                            )}
                            onClick={(e) => handleActionStatus(group, 'yes', e)}
                            title="Mark as OK"
                          >
                            <Check className="h-3.5 w-3.5" />
                            Yes
                          </Button>
                          <Button
                            size="sm"
                            variant="default"
                            disabled={!canUseHistoryReviewActions}
                            className={cn(
                              "h-7 px-2 text-xs gap-1 bg-red-600 hover:bg-red-700 text-white border-red-600",
                              group.action_status === 'no' && "ring-2 ring-red-300"
                            )}
                            onClick={(e) => handleActionStatus(group, 'no', e)}
                            title="Mark as Not OK (Discrepancy)"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            No
                          </Button>
                          {canEdit && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => handleEditDelivery(group, e)}
                              title="Edit delivery"
                              className="h-7 w-7"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {canDelete && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => handleDelete(group, e)}
                              className="h-7 w-7 text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination for Active Releases */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-2 py-4">
              <p className="text-sm text-muted-foreground">
                Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, filteredReleases.length)} of {filteredReleases.length} items
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="h-8 px-3"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                {getPageNumbers(currentPage, totalPages).map((page, idx) => (
                  typeof page === 'number' ? (
                    <Button
                      key={idx}
                      variant={currentPage === page ? "default" : "outline"}
                      size="sm"
                      onClick={() => setCurrentPage(page)}
                      className="h-8 w-8 p-0"
                    >
                      {page}
                    </Button>
                  ) : (
                    <span key={idx} className="px-2 text-muted-foreground">...</span>
                  )
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="h-8 px-3"
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="deleted" className="space-y-4">
          {loadingDeleted ? (
            <div className="flex items-center justify-center h-64">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : (
            <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Allocation</TableHead>
                    <TableHead>Destination</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Total Boxes</TableHead>
                    <TableHead>Total Qty/Items</TableHead>
                    <TableHead>Deleted At</TableHead>
                    <TableHead>Waybill No.</TableHead>
                    <TableHead className="w-[140px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupedDeletedReleases.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-12">
                        <Archive className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
                        <p className="text-muted-foreground">No recently deleted transactions</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedDeletedReleases.map((group) => (
                      <TableRow
                        key={group.batch_id}
                        className="cursor-pointer transition-colors hover:bg-muted/50"
                        onClick={() => openAllocationBill(group)}
                      >
                        <TableCell className="font-medium">
                          <button
                            type="button"
                            className="text-left font-mono underline-offset-4 hover:underline focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded-sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              openAllocationBill(group);
                            }}
                          >
                            {group.allocation_bill || '-'}
                          </button>
                        </TableCell>
                        <TableCell>{group.destination}</TableCell>
                        <TableCell>{group.category || '-'}</TableCell>
                        <TableCell>{group.totalBoxes}</TableCell>
                        <TableCell>{group.totalQty || group.itemCount}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {group.deleted_at ? format(new Date(group.deleted_at), 'MMM d, yyyy HH:mm') : '-'}
                        </TableCell>
                        <TableCell>{group.waybill_no || '-'}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                openAllocationBill(group);
                              }}
                              title="View allocation bill"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={(e) => handleRestore(group, e)}
                              className="text-emerald-600 hover:text-emerald-600 dark:text-emerald-400"
                              title="Restore"
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                            {canDelete && (
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={(e) => handlePermanentDelete(group, e)}
                                className="text-destructive hover:text-destructive"
                                title="Delete permanently"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination for Deleted Releases */}
          {deletedTotalPages > 1 && (
            <div className="flex items-center justify-between px-2 py-4">
              <p className="text-sm text-muted-foreground">
                Showing {((deletedCurrentPage - 1) * ITEMS_PER_PAGE) + 1} - {Math.min(deletedCurrentPage * ITEMS_PER_PAGE, groupedDeletedReleases.length)} of {groupedDeletedReleases.length} items
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDeletedCurrentPage(p => Math.max(1, p - 1))}
                  disabled={deletedCurrentPage === 1}
                  className="h-8 px-3"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                {getPageNumbers(deletedCurrentPage, deletedTotalPages).map((page, idx) => (
                  typeof page === 'number' ? (
                    <Button
                      key={idx}
                      variant={deletedCurrentPage === page ? "default" : "outline"}
                      size="sm"
                      onClick={() => setDeletedCurrentPage(page)}
                      className="h-8 w-8 p-0"
                    >
                      {page}
                    </Button>
                  ) : (
                    <span key={idx} className="px-2 text-muted-foreground">...</span>
                  )
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDeletedCurrentPage(p => Math.min(deletedTotalPages, p + 1))}
                  disabled={deletedCurrentPage === deletedTotalPages}
                  className="h-8 px-3"
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog
        open={!!reportingBatch}
        onOpenChange={(open) => {
          if (!open && !reportSubmitting) {
            setReportingBatch(null);
            setReportNotes('');
          }
        }}
      >
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquareWarning className="h-5 w-5 text-destructive" />
              Report History Issue
            </DialogTitle>
            <DialogDescription>
              Describe kung anong mali sa {reportingBatch ? getGroupLabel(reportingBatch) : 'this record'}. Admin and Assistant will receive a notification.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Textarea
              value={reportNotes}
              onChange={(event) => setReportNotes(event.target.value)}
              placeholder="Example: Mali yung amount / kulang qty / wrong branch / wrong date received..."
              className="min-h-[120px]"
              disabled={reportSubmitting}
            />
            <p className="text-xs text-muted-foreground">
              This will also mark the row as Not OK and add it to Discrepancy.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={reportSubmitting}
              onClick={() => {
                setReportingBatch(null);
                setReportNotes('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={reportSubmitting || !reportNotes.trim()}
              onClick={handleIssueReportSubmit}
            >
              {reportSubmitting ? 'Sending...' : 'Send Report'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {selectedBatch && (
        <AllocationBillModal
          open={!!selectedBatch}
          onOpenChange={(open) => !open && setSelectedBatch(null)}
          releases={selectedBatch.items}
          destination={selectedBatch.destination}
          courier={selectedBatch.courier}
          dateReleased={selectedBatch.date_released}
          dateDelivered={selectedBatch.date_delivered}
          allocationBill={selectedBatch.allocation_bill}
          setDate={selectedBatch.set_date}
          isViewer={isViewer}
        />
      )}

      {/* Edit Delivery Modal */}
      {editingBatch && (
        <EditDeliveryModal
          open={!!editingBatch}
          onOpenChange={(open) => !open && setEditingBatch(null)}
          group={editingBatch}
          onSuccess={handleDeliveryEditSuccess}
        />
      )}

      {/* Summary Delivery Modal */}
      {showSummaryModal && (
        <SummaryDeliveryModal
          open={showSummaryModal}
          onOpenChange={setShowSummaryModal}
          isViewer={isViewer}
        />
      )}
    </div>
  );
};

export default History;
