import { useState, useMemo, useEffect } from 'react';
import { ClipboardList, Eye, Trash2, AlertTriangle, Search, CalendarIcon, X, RotateCcw, Archive, Pencil, FileDown, Calendar as CalendarLucide } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { useInventory } from '@/hooks/useInventory';
import { useAuth } from '@/contexts/AuthContext';
import { DeliveryStatus, StockRelease } from '@/types/inventory';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ColumnSettings, { ColumnConfig, ColumnKey } from '@/components/deliveries/ColumnSettings';
import { useColumnSettings } from '@/hooks/useColumnSettings';
import { PhotoUploadCell } from '@/components/deliveries/PhotoUploadCell';
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

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const HISTORY_STORAGE_KEY = 'history_filter';

type HistoryColumnKey = 'allocation' | 'destination' | 'category' | 'totalBoxes' | 'totalQty' | 'dateOut' | 'dateReceived' | 'deliveryTime' | 'courier' | 'waybill' | 'remarks';

const DEFAULT_HISTORY_COLUMNS: ColumnConfig[] = [
  { key: 'allocation' as ColumnKey, label: 'Allocation', visible: true, width: 160, minWidth: 120, maxWidth: 250 },
  { key: 'destination' as ColumnKey, label: 'Destination', visible: true, width: 130, minWidth: 80, maxWidth: 200 },
  { key: 'category' as ColumnKey, label: 'Category', visible: true, width: 100, minWidth: 60, maxWidth: 150 },
  { key: 'totalBoxes' as ColumnKey, label: 'Total Boxes', visible: true, width: 100, minWidth: 70, maxWidth: 150 },
  { key: 'totalQty' as ColumnKey, label: 'Total Qty/Items', visible: true, width: 110, minWidth: 80, maxWidth: 160 },
  { key: 'dateOut' as ColumnKey, label: 'Date Out', visible: true, width: 120, minWidth: 100, maxWidth: 180 },
  { key: 'dateReceived' as ColumnKey, label: 'Date Received', visible: true, width: 120, minWidth: 100, maxWidth: 180 },
  { key: 'deliveryTime' as ColumnKey, label: 'Delivery Days', visible: true, width: 120, minWidth: 90, maxWidth: 150 },
  { key: 'courier' as ColumnKey, label: 'Courier', visible: true, width: 100, minWidth: 80, maxWidth: 150 },
  { key: 'waybill' as ColumnKey, label: 'Waybill No.', visible: true, width: 130, minWidth: 100, maxWidth: 180 },
  { key: 'remarks' as ColumnKey, label: 'Remarks', visible: true, width: 130, minWidth: 100, maxWidth: 200 },
];

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
  totalQty: number;
  itemCount: number;
  items: StockRelease[];
  releaseIds: string[];
  photo_url: string | null;
  photo_status: string | null;
}

const History = () => {
  const { releases, loading, deleteReleaseBatch, deleteAllReleases, fetchDeletedReleases, restoreReleaseBatch, permanentlyDeleteBatch, permanentlyDeleteAllDeleted, fetchReleases } = useInventory();
  const { toast } = useToast();
  const { userRole } = useAuth();
  const [selectedBatch, setSelectedBatch] = useState<GroupedRelease | null>(null);
  const [clearing, setClearing] = useState(false);
  const [clearingDeleted, setClearingDeleted] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
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
  const [activeTab, setActiveTab] = useState('active');
  
  // Persist filter to localStorage when it changes
  useEffect(() => {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify({ month: selectedMonth, year: selectedYear }));
  }, [selectedMonth, selectedYear]);
  const [deletedReleases, setDeletedReleases] = useState<StockRelease[]>([]);
  const [loadingDeleted, setLoadingDeleted] = useState(false);
  const [editingBatch, setEditingBatch] = useState<GroupedRelease | null>(null);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  
  const { columns, setColumns, isAdmin } = useColumnSettings('history', DEFAULT_HISTORY_COLUMNS);
  const isViewer = userRole === 'viewer';
  const canExport = userRole !== 'uploader';

  const isColumnVisible = (key: string) => {
    const col = columns.find(c => c.key === key);
    return col?.visible ?? true;
  };

  const getColumnWidth = (key: string) => {
    const col = columns.find(c => c.key === key);
    return col?.width || 100;
  };

  const visibleColumnCount = columns.filter(c => c.visible).length + 1; // +1 for Actions

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

  // Group releases by batch_id
  const groupReleases = (releasesList: StockRelease[]) => {
    const groups: Record<string, GroupedRelease> = {};
    
    releasesList.forEach(release => {
      const batchKey = release.batch_id || release.id;
      
      if (!groups[batchKey]) {
        groups[batchKey] = {
          batch_id: batchKey,
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
          totalQty: 0,
          itemCount: 0,
          items: [],
          releaseIds: [],
          photo_url: release.photo_url,
          photo_status: release.photo_status,
        };
      }
      
      groups[batchKey].items.push(release);
      groups[batchKey].releaseIds.push(release.id);
      groups[batchKey].totalBoxes += release.boxes_released;
      groups[batchKey].totalQty += release.total_qty || 0;
      groups[batchKey].itemCount += 1;
    });
    
    // Sort by set_date (Date Out) ascending - earlier dates first
    return Object.values(groups).sort((a, b) => {
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

  const groupedReleases = useMemo(() => groupReleases(releases), [releases]);
  const groupedDeletedReleases = useMemo(() => groupReleases(deletedReleases), [deletedReleases]);

  // Filter grouped releases based on search query, date range, month/year, and status
  const filteredReleases = useMemo(() => {
    return groupedReleases.filter(group => {
      // Month/Year filter - use set_date (Date Out) if available, otherwise date_released
      const dateToFilter = group.set_date ? new Date(group.set_date) : new Date(group.date_released);
      if (dateToFilter.getMonth() !== selectedMonth || dateToFilter.getFullYear() !== selectedYear) {
        return false;
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
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        if (group.destination.toLowerCase().includes(query)) return true;
        if (group.courier?.toLowerCase().includes(query)) return true;
        if (group.delivery_status.toLowerCase().includes(query)) return true;
        if (group.allocation_bill?.toLowerCase().includes(query)) return true;
        if (group.waybill_no?.toLowerCase().includes(query)) return true;
        
        const itemMatch = group.items.some(item => 
          item.inventory_item?.item_name?.toLowerCase().includes(query) ||
          item.inventory_item?.item_code?.toLowerCase().includes(query)
        );
        if (itemMatch) return true;
        
        return false;
      }
      
      return true;
    });
  }, [groupedReleases, searchQuery, startDate, endDate, statusFilter, selectedMonth, selectedYear]);

  const clearFilters = () => {
    setStartDate(undefined);
    setEndDate(undefined);
    setStatusFilter('all');
  };

  const handleDelete = async (group: GroupedRelease, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this release? It will be moved to Recently Deleted.')) return;
    
    try {
      await deleteReleaseBatch(group.batch_id);
      toast({ title: 'Success', description: 'Release moved to Recently Deleted' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to delete release', variant: 'destructive' });
    }
  };

  const handleRestore = async (group: GroupedRelease, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await restoreReleaseBatch(group.batch_id);
      setDeletedReleases(deletedReleases.filter(r => r.batch_id !== group.batch_id));
      toast({ title: 'Success', description: 'Release restored successfully' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to restore release', variant: 'destructive' });
    }
  };

  const handlePermanentDelete = async (group: GroupedRelease, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to permanently delete this release? This cannot be undone.')) return;
    
    try {
      await permanentlyDeleteBatch(group.batch_id);
      setDeletedReleases(deletedReleases.filter(r => r.batch_id !== group.batch_id));
      toast({ title: 'Success', description: 'Release permanently deleted' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to delete release', variant: 'destructive' });
    }
  };

  const handleEditDelivery = (group: GroupedRelease, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingBatch(group);
  };

  const handleRemarksChange = async (group: GroupedRelease, notes: string) => {
    try {
      const { error } = await supabase
        .from('stock_releases')
        .update({ notes })
        .eq('batch_id', group.batch_id);
      
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
      toast({ title: 'Success', description: 'All transaction history moved to Recently Deleted' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to clear history', variant: 'destructive' });
    } finally {
      setClearing(false);
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

  if (loading) {
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
              <Button variant="outline" size="sm" onClick={() => setShowSummaryModal(true)}>
                <FileDown className="h-4 w-4 mr-2" />
                Save PDF
              </Button>
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
                <Select value={selectedMonth.toString()} onValueChange={(val) => setSelectedMonth(parseInt(val))}>
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
                    {[2024, 2025, 2026].map((year) => (
                      <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

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
              {isAdmin && <ColumnSettings columns={columns} onColumnChange={setColumns} defaultColumns={DEFAULT_HISTORY_COLUMNS} />}
            </div>
          </div>

          <div className="rounded-xl border bg-card shadow-sm overflow-hidden overflow-x-auto transition-all duration-300">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow className="transition-all duration-300">
                  {isColumnVisible('allocation') && <TableHead className="transition-all duration-300 pl-[72px]" style={{ width: getColumnWidth('allocation') }}>Allocation</TableHead>}
                  {isColumnVisible('destination') && <TableHead className="transition-all duration-300" style={{ width: getColumnWidth('destination') }}>Destination</TableHead>}
                  {isColumnVisible('category') && <TableHead className="transition-all duration-300" style={{ width: getColumnWidth('category') }}>Category</TableHead>}
                  {isColumnVisible('totalBoxes') && <TableHead className="text-center transition-all duration-300" style={{ width: getColumnWidth('totalBoxes') }}>Total Boxes</TableHead>}
                  {isColumnVisible('totalQty') && <TableHead className="text-center transition-all duration-300" style={{ width: getColumnWidth('totalQty') }}>Total Qty/Items</TableHead>}
                  {isColumnVisible('dateOut') && <TableHead className="transition-all duration-300" style={{ width: getColumnWidth('dateOut') }}>Date Out</TableHead>}
                  {isColumnVisible('dateReceived') && <TableHead className="transition-all duration-300" style={{ width: getColumnWidth('dateReceived') }}>Date Received</TableHead>}
                  {isColumnVisible('deliveryTime') && <TableHead className="text-center transition-all duration-300" style={{ width: getColumnWidth('deliveryTime') }}>Delivery Days</TableHead>}
                  {isColumnVisible('courier') && <TableHead className="transition-all duration-300" style={{ width: getColumnWidth('courier') }}>Courier</TableHead>}
                  {isColumnVisible('waybill') && <TableHead className="transition-all duration-300" style={{ width: getColumnWidth('waybill') }}>Waybill No.</TableHead>}
                  {isColumnVisible('remarks') && <TableHead className="transition-all duration-300" style={{ width: getColumnWidth('remarks') }}>Remarks</TableHead>}
                  <TableHead className="w-[140px]">Actions</TableHead>
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
                  filteredReleases.map((group, index) => (
                    <TableRow 
                      key={group.batch_id} 
                      className="cursor-pointer transition-all duration-300 ease-out hover:bg-muted/50" 
                      onClick={() => setSelectedBatch(group)}
                      style={{ animation: `fade-in 0.3s ease-out ${index * 30}ms forwards`, opacity: 0 }}
                    >
                      {isColumnVisible('allocation') && (
                        <TableCell className="font-medium transition-all duration-300" style={{ width: getColumnWidth('allocation') }}>
                          <div className="flex items-center gap-2">
                            <div onClick={(e) => e.stopPropagation()}>
                              <PhotoUploadCell
                                batchId={group.batch_id}
                                photoUrl={group.photo_url}
                                photoStatus={group.photo_status}
                                currentAllocation={group.allocation_bill}
                                onPhotoUpdate={() => fetchReleases()}
                              />
                            </div>
                            <span>{group.allocation_bill || '-'}</span>
                          </div>
                        </TableCell>
                      )}
                      {isColumnVisible('destination') && <TableCell className="transition-all duration-300" style={{ width: getColumnWidth('destination') }}>{group.destination}</TableCell>}
                      {isColumnVisible('category') && <TableCell className="transition-all duration-300" style={{ width: getColumnWidth('category') }}>{group.category || '-'}</TableCell>}
                      {isColumnVisible('totalBoxes') && <TableCell className="text-center transition-all duration-300" style={{ width: getColumnWidth('totalBoxes') }}>{group.totalBoxes}</TableCell>}
                      {isColumnVisible('totalQty') && <TableCell className="text-center transition-all duration-300" style={{ width: getColumnWidth('totalQty') }}>{group.totalQty || group.itemCount}</TableCell>}
                      {isColumnVisible('dateOut') && <TableCell className="text-muted-foreground transition-all duration-300" style={{ width: getColumnWidth('dateOut') }}>{group.set_date ? format(new Date(group.set_date), 'MMM d, yyyy') : '-'}</TableCell>}
                      {isColumnVisible('dateReceived') && (
                        <TableCell className="text-muted-foreground transition-all duration-300" style={{ width: getColumnWidth('dateReceived') }}>
                          {group.date_delivered ? format(new Date(group.date_delivered), 'MMM d, yyyy') : '-'}
                        </TableCell>
                      )}
                      {isColumnVisible('deliveryTime') && (
                        <TableCell className="text-center transition-all duration-300" style={{ width: getColumnWidth('deliveryTime') }}>
                          {group.set_date && group.date_delivered ? (
                            <span className="font-medium text-green-600">
                              {differenceInDays(new Date(group.date_delivered), new Date(group.set_date))} day(s)
                            </span>
                          ) : '-'}
                        </TableCell>
                      )}
                      {isColumnVisible('courier') && <TableCell className="transition-all duration-300" style={{ width: getColumnWidth('courier') }}>{group.courier || '-'}</TableCell>}
                      {isColumnVisible('waybill') && <TableCell className="transition-all duration-300" style={{ width: getColumnWidth('waybill') }}>{group.waybill_no || '-'}</TableCell>}
                      {isColumnVisible('remarks') && (
                        <TableCell onClick={(e) => e.stopPropagation()} className="transition-all duration-300" style={{ width: getColumnWidth('remarks') }}>
                          {isAdmin ? (
                            <Input
                              placeholder="Enter remarks"
                              defaultValue={group.notes || ''}
                              className="h-8 w-[120px] text-sm"
                              onBlur={(e) => {
                                if (e.target.value !== (group.notes || '')) {
                                  handleRemarksChange(group, e.target.value);
                                }
                              }}
                            />
                          ) : (
                            <span className="text-sm">{group.notes || '-'}</span>
                          )}
                        </TableCell>
                      )}
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setSelectedBatch(group); }} className="transition-transform hover:scale-110">
                            <Eye className="h-4 w-4" />
                          </Button>
                          {isAdmin && (
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={(e) => handleEditDelivery(group, e)}
                              title="Edit delivery"
                              className="transition-transform hover:scale-110"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {isAdmin && (
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={(e) => handleDelete(group, e)}
                              className="text-destructive hover:text-destructive transition-transform hover:scale-110"
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
                    groupedDeletedReleases.map((group) => (
                      <TableRow key={group.batch_id}>
                        <TableCell className="font-medium">{group.allocation_bill || '-'}</TableCell>
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
                              onClick={(e) => handleRestore(group, e)}
                              className="text-green-600 hover:text-green-600"
                              title="Restore"
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                            {isAdmin && (
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
        </TabsContent>
      </Tabs>

      {selectedBatch && (
        <AllocationBillModal
          open={!!selectedBatch}
          onOpenChange={(open) => !open && setSelectedBatch(null)}
          releases={selectedBatch.items}
          destination={selectedBatch.destination}
          courier={selectedBatch.courier}
          dateReleased={selectedBatch.date_released}
          dateDelivered={selectedBatch.date_delivered}
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
          onSuccess={() => fetchReleases()}
        />
      )}

      {/* Summary Delivery Modal */}
      <SummaryDeliveryModal
        open={showSummaryModal}
        onOpenChange={setShowSummaryModal}
        isViewer={isViewer}
      />
    </div>
  );
};

export default History;