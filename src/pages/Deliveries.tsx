import { useState, useMemo, useCallback, useTransition } from 'react';
import { Truck, CalendarIcon, Pencil, Search, X, ChevronLeft, ChevronRight, FileDown, FileSpreadsheet } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useInventory } from '@/hooks/useInventory';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { DeliveryStatus, StockRelease } from '@/types/inventory';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import AllocationBillModal from '@/components/deliveries/AllocationBillModal';
import EditDeliveryModal from '@/components/deliveries/EditDeliveryModal';
import ColumnSettings, { ColumnConfig, ColumnKey } from '@/components/deliveries/ColumnSettings';
import SummaryDeliveryModal from '@/components/deliveries/SummaryDeliveryModal';
import { PhotoUploadCell } from '@/components/deliveries/PhotoUploadCell';
import { supabase } from '@/integrations/supabase/client';
import { useDebounce } from '@/hooks/useDebounce';
import { useColumnSettings } from '@/hooks/useColumnSettings';
import { exportToExcel } from '@/lib/excelExport';
import { getStockReleaseDisplayKey, getStockReleaseGroupKey } from '@/lib/stockReleaseDedupe';
import { toast as sonnerToast } from 'sonner';
import { format as formatDateFn } from 'date-fns';

const ITEMS_PER_PAGE = 15;

const DEFAULT_COLUMNS: ColumnConfig[] = [
  { key: 'allocation', label: 'Allocation', visible: true, width: 180, minWidth: 140, maxWidth: 250 },
  { key: 'destination', label: 'Destination', visible: true, width: 130, minWidth: 80, maxWidth: 200 },
  { key: 'category', label: 'Category', visible: true, width: 100, minWidth: 60, maxWidth: 150 },
  { key: 'totalBoxes', label: 'Total Boxes', visible: true, width: 100, minWidth: 70, maxWidth: 150 },
  { key: 'amount', label: 'Amount', visible: true, width: 110, minWidth: 80, maxWidth: 160 },
  { key: 'totalQty', label: 'Total Qty/Items', visible: true, width: 110, minWidth: 80, maxWidth: 160 },
  { key: 'dateOut', label: 'Date Out Warehouse', visible: true, width: 140, minWidth: 100, maxWidth: 200 },
  { key: 'status', label: 'Status', visible: true, width: 150, minWidth: 120, maxWidth: 180 },
  { key: 'remarks', label: 'Remarks', visible: true, width: 130, minWidth: 100, maxWidth: 200 },
];

interface GroupedRelease {
  batch_id: string;
  destination: string;
  courier: string | null;
  date_released: string;
  date_delivered: string | null;
  delivery_status: DeliveryStatus;
  totalBoxes: number;
  amount: number | null;
  totalQty: number;
  itemCount: number;
  items: StockRelease[];
  releaseIds: string[];
  allocation_bill: string | null;
  category: string | null;
  waybill_no: string | null;
  set_date: string | null;
  notes: string | null;
  photo_url: string | null;
  photo_status: string | null;
}

const Deliveries = () => {
  const { releases, loading, updateDeliveryStatus, fetchReleases, bulkUpdateReleases } = useInventory();
  const { toast } = useToast();
  const { userRole } = useAuth();
  const { selectedBranch } = useBranch();
  const [selectedBatch, setSelectedBatch] = useState<GroupedRelease | null>(null);
  const [editingBatch, setEditingBatch] = useState<GroupedRelease | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [deliveredDateGroup, setDeliveredDateGroup] = useState<GroupedRelease | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [isPending, startTransition] = useTransition();
  const { columns, setColumns, isAdmin } = useColumnSettings('deliveries', DEFAULT_COLUMNS);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  
  const isViewer = userRole === 'viewer';
  const isEncoder = userRole === 'encoder';
  const isAssistant = userRole === 'assistant';
  const canEdit = isAdmin || isEncoder || isAssistant; // Admin, encoder, and assistant can edit
  const canExport = userRole !== 'uploader';

  const getColumnWidth = (key: ColumnKey) => {
    const col = columns.find(c => c.key === key);
    return col?.width || 100;
  };

  const isColumnVisible = (key: ColumnKey) => {
    const col = columns.find(c => c.key === key);
    return col?.visible ?? true;
  };

  const visibleColumnCount = columns.filter(c => c.visible).length + (canEdit ? 1 : 0); // +1 for Edit if can edit
  
  // Debounced search for smooth performance
  const debouncedSearch = useDebounce(searchQuery, 350);

  const formatAmount = useCallback((value: number | null | undefined) => {
    if (value === null || value === undefined) return '-';
    const num = Number(value);
    if (!Number.isFinite(num)) return '-';
    return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }, []);

  // Group releases by allocation bill first, then fallback to batch_id.
  const groupedReleases = useMemo(() => {
    // First filter by branch + only show CONFIRMED (action_status='yes') items.
    // Items not yet confirmed live in History page with Yes/No buttons.
    const branchFiltered = (selectedBranch 
      ? releases.filter(r => r.branch_id === selectedBranch.id)
      : releases
    ).filter(r => (r as unknown as { action_status?: string | null }).action_status === 'yes');
    
    const groups: Record<string, GroupedRelease> = {};
    const countedReleaseKeys: Record<string, Set<string>> = {};
    
    branchFiltered.forEach(release => {
      const batchKey = getStockReleaseGroupKey(release);
      
      if (!groups[batchKey]) {
        groups[batchKey] = {
          batch_id: release.batch_id || release.id,
          destination: release.destination,
          courier: release.courier,
          date_released: release.date_released,
          date_delivered: release.date_delivered || null,
          delivery_status: release.delivery_status,
          totalBoxes: 0,
          amount: null,
          totalQty: 0,
          itemCount: 0,
          items: [],
          releaseIds: [],
          allocation_bill: release.allocation_bill,
          category: release.category,
          waybill_no: release.waybill_no,
          set_date: release.set_date,
          notes: release.notes,
          photo_url: release.photo_url || null,
          photo_status: release.photo_status || null,
        };
        countedReleaseKeys[batchKey] = new Set();
      }
      
      groups[batchKey].releaseIds.push(release.id);

      const releaseKey = getStockReleaseDisplayKey(release);
      if (countedReleaseKeys[batchKey].has(releaseKey)) {
        return;
      }
      countedReleaseKeys[batchKey].add(releaseKey);

      groups[batchKey].items.push(release);
      groups[batchKey].totalBoxes += release.boxes_released;
      groups[batchKey].totalQty += release.total_qty || (release.boxes_released * (release.inventory_item?.pieces_per_box || 1));
      groups[batchKey].itemCount += 1;

      // Sum per-row amounts so multi-product allocation bills show one correct total.
      if (release.amount != null) {
        groups[batchKey].amount = (groups[batchKey].amount || 0) + Number(release.amount);
      }
    });
    
    return Object.values(groups).sort((a, b) => {
      const dateA = a.set_date ? new Date(a.set_date).getTime() : new Date(a.date_released).getTime();
      const dateB = b.set_date ? new Date(b.set_date).getTime() : new Date(b.date_released).getTime();
      return dateA - dateB; // Ascending order - earliest dates first
    });
  }, [releases, selectedBranch]);

  // Filtered results using debounced search - case-insensitive and partial match
  const pendingGroups = useMemo(() => {
    return groupedReleases
      .filter(g => g.delivery_status !== 'delivered')
      .filter(g => {
        if (!debouncedSearch.trim()) return true;
        const query = debouncedSearch.toLowerCase();
        const allocation = (g.allocation_bill || '').toLowerCase();
        const waybill = (g.waybill_no || '').toLowerCase();
        const destination = (g.destination || '').toLowerCase();
        const category = (g.category || '').toLowerCase();
        const notes = (g.notes || '').toLowerCase();
        return allocation.includes(query) || 
               waybill.includes(query) || 
               destination.includes(query) || 
               category.includes(query) ||
               notes.includes(query);
      });
  }, [groupedReleases, debouncedSearch]);

  // Pagination logic
  const totalPages = Math.ceil(pendingGroups.length / ITEMS_PER_PAGE);
  const paginatedGroups = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return pendingGroups.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [pendingGroups, currentPage]);

  // Reset to page 1 when search changes
  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    startTransition(() => {
      setCurrentPage(1);
    });
  }, []);

  const goToPage = useCallback((page: number) => {
    startTransition(() => {
      setCurrentPage(Math.max(1, Math.min(page, totalPages)));
    });
  }, [totalPages]);

  const handleStatusChange = async (group: GroupedRelease, status: DeliveryStatus) => {
    // If selecting "delivered", show the date picker first
    if (status === 'delivered') {
      setDeliveredDateGroup(group);
      return;
    }
    
    try {
      await bulkUpdateReleases(group.releaseIds, { delivery_status: status });
      toast({ title: 'Success', description: 'Delivery status updated' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update status', variant: 'destructive' });
    }
  };

  const handleDeliveredWithDate = async (group: GroupedRelease, date: Date) => {
    try {
      await bulkUpdateReleases(group.releaseIds, {
        delivery_status: 'delivered' as DeliveryStatus,
        date_delivered: date.toISOString(),
      });
      setDeliveredDateGroup(null);
      toast({ title: 'Success', description: `Marked as delivered on ${format(date, 'MMM d, yyyy')}` });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update status', variant: 'destructive' });
    }
  };

  const handleWaybillChange = async (group: GroupedRelease, waybillNo: string) => {
    try {
      await bulkUpdateReleases(group.releaseIds, { waybill_no: waybillNo });
      toast({ title: 'Success', description: 'Waybill updated' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update waybill', variant: 'destructive' });
    }
  };

  const handleRemarksChange = async (group: GroupedRelease, notes: string) => {
    try {
      await bulkUpdateReleases(group.releaseIds, { notes });
      toast({ title: 'Success', description: 'Remarks updated' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update remarks', variant: 'destructive' });
    }
  };

  const handleSetDateChange = async (group: GroupedRelease, date: Date) => {
    try {
      await bulkUpdateReleases(group.releaseIds, { set_date: date.toISOString() });
      toast({ title: 'Success', description: `Delivery date set to ${format(date, 'MMM d, yyyy')}` });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update delivery date', variant: 'destructive' });
    }
  };

  const handleExportExcel = async () => {
    try {
      const excelData = pendingGroups.map(group => ({
        allocation: group.allocation_bill || group.batch_id.slice(0, 8),
        destination: group.destination,
        category: group.category || '-',
        totalBoxes: group.totalBoxes,
        amount: group.amount ?? null,
        totalQty: group.totalQty,
        dateOut: group.set_date ? formatDateFn(new Date(group.set_date), 'MMM dd, yyyy') : '-',
        status: group.delivery_status.replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
        remarks: group.notes || '-',
      }));

      await exportToExcel({
        title: 'Deliveries Report',
        subtitle: `Generated on ${formatDateFn(new Date(), 'MMMM dd, yyyy')}`,
        filename: `deliveries-${formatDateFn(new Date(), 'yyyy-MM-dd')}`,
        columns: [
          { header: 'Allocation', key: 'allocation', width: 22 },
          { header: 'Destination', key: 'destination', width: 18 },
          { header: 'Category', key: 'category', width: 12 },
          { header: 'Total Boxes', key: 'totalBoxes', width: 14 },
          { header: 'Amount', key: 'amount', width: 14 },
          { header: 'Total Qty', key: 'totalQty', width: 14 },
          { header: 'Date Out', key: 'dateOut', width: 15 },
          { header: 'Status', key: 'status', width: 15 },
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

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search allocation, waybill, destination, category..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-10 pr-10"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
              onClick={() => handleSearchChange('')}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        <div className="flex items-center gap-3">
          {pendingGroups.length > 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{pendingGroups.length} result{pendingGroups.length !== 1 ? 's' : ''}</span>
              {isPending && (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              )}
            </div>
          )}
          {!isViewer && canExport && (
            <Button variant="outline" size="sm" onClick={handleExportExcel}>
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Save Excel
            </Button>
          )}
          {!isViewer && canExport && (
            <Button variant="outline" size="sm" onClick={() => setShowSummaryModal(true)}>
              <FileDown className="h-4 w-4 mr-2" />
              Save PDF
            </Button>
          )}
          {isAdmin && <ColumnSettings columns={columns} onColumnChange={setColumns} defaultColumns={DEFAULT_COLUMNS} />}
        </div>
      </div>
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden overflow-x-auto transition-all duration-300">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow className="transition-all duration-300">
              {isColumnVisible('allocation') && <TableHead className="transition-all duration-300 pl-20" style={{ width: getColumnWidth('allocation') }}>Allocation</TableHead>}
              {isColumnVisible('destination') && <TableHead className="transition-all duration-300" style={{ width: getColumnWidth('destination') }}>Destination</TableHead>}
              {isColumnVisible('category') && <TableHead className="transition-all duration-300" style={{ width: getColumnWidth('category') }}>Category</TableHead>}
              {isColumnVisible('totalBoxes') && <TableHead className="text-center transition-all duration-300" style={{ width: getColumnWidth('totalBoxes') }}>Total Boxes</TableHead>}
              {isColumnVisible('amount') && <TableHead className="text-center transition-all duration-300" style={{ width: getColumnWidth('amount') }}>Amount</TableHead>}
              {isColumnVisible('totalQty') && <TableHead className="text-center transition-all duration-300" style={{ width: getColumnWidth('totalQty') }}>Total Qty/Items</TableHead>}
              {isColumnVisible('dateOut') && <TableHead className="transition-all duration-300" style={{ width: getColumnWidth('dateOut') }}>Date Out Warehouse</TableHead>}
              {isColumnVisible('status') && <TableHead className="transition-all duration-300" style={{ width: getColumnWidth('status') }}>Status</TableHead>}
              {isColumnVisible('remarks') && <TableHead className="transition-all duration-300" style={{ width: getColumnWidth('remarks') }}>Remarks</TableHead>}
              {canEdit && <TableHead className="w-[80px]">Edit</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedGroups.length === 0 ? (
              <TableRow>
                <TableCell colSpan={visibleColumnCount} className="text-center py-12">
                  <Truck className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
                  <p className="text-muted-foreground">
                    {debouncedSearch ? 'No matching deliveries found' : 'No pending deliveries'}
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              paginatedGroups.map((group, index) => (
                <TableRow 
                  key={group.batch_id} 
                  className="transition-all duration-300 ease-out hover:bg-muted/50"
                  style={{ animation: `fade-in 0.3s ease-out ${index * 30}ms forwards`, opacity: 0 }}
                >
                  {isColumnVisible('allocation') && (
                    <TableCell className="font-medium transition-all duration-300" style={{ width: getColumnWidth('allocation') }}>
                      <div className="flex items-center gap-2">
                        <PhotoUploadCell 
                          batchId={group.batch_id} 
                          photoUrl={group.photo_url}
                          photoStatus={group.photo_status}
                          currentAllocation={group.allocation_bill}
                          onPhotoUpdate={fetchReleases}
                        />
                        <span className="truncate flex-1">{group.allocation_bill || group.batch_id.slice(0, 8)}</span>
                      </div>
                    </TableCell>
                  )}
                  {isColumnVisible('destination') && <TableCell className="transition-all duration-300" style={{ width: getColumnWidth('destination') }}>{group.destination}</TableCell>}
                  {isColumnVisible('category') && <TableCell className="transition-all duration-300" style={{ width: getColumnWidth('category') }}>{group.category || '-'}</TableCell>}
                  {isColumnVisible('totalBoxes') && <TableCell className="text-center transition-all duration-300" style={{ width: getColumnWidth('totalBoxes') }}>{group.totalBoxes}</TableCell>}
                  {isColumnVisible('amount') && <TableCell className="text-center transition-all duration-300" style={{ width: getColumnWidth('amount') }}>{formatAmount(group.amount)}</TableCell>}
                  {isColumnVisible('totalQty') && <TableCell className="text-center transition-all duration-300" style={{ width: getColumnWidth('totalQty') }}>{group.totalQty}</TableCell>}
                  {isColumnVisible('dateOut') && (
                    <TableCell className="transition-all duration-300" style={{ width: getColumnWidth('dateOut') }}>{group.set_date ? format(new Date(group.set_date), 'MMM d, yyyy') : '-'}</TableCell>
                  )}
                  {isColumnVisible('status') && (
                    <TableCell onClick={(e) => e.stopPropagation()} className="transition-all duration-300" style={{ width: getColumnWidth('status') }}>
                      {isViewer ? (
                        <span className="text-sm capitalize">{group.delivery_status.replace('_', ' ')}</span>
                      ) : (
                        <Select 
                          value={group.delivery_status} 
                          onValueChange={(value) => handleStatusChange(group, value as DeliveryStatus)}
                        >
                          <SelectTrigger className="w-[140px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="in_transit">In Transit</SelectItem>
                            <SelectItem value="out_for_delivery">Out for Delivery</SelectItem>
                            <SelectItem value="delivered">Delivered</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                  )}
                  {isColumnVisible('remarks') && (
                    <TableCell onClick={(e) => e.stopPropagation()} className="transition-all duration-300" style={{ width: getColumnWidth('remarks') }}>
                      {isViewer ? (
                        <span className="text-sm">{group.notes || '-'}</span>
                      ) : (
                        <Input
                          placeholder="Enter remarks"
                          defaultValue={group.notes || ''}
                          className="h-8 text-sm"
                          onBlur={(e) => {
                            if (e.target.value !== (group.notes || '')) {
                              handleRemarksChange(group, e.target.value);
                            }
                          }}
                        />
                      )}
                    </TableCell>
                  )}
                  {canEdit && (
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setEditingBatch(group); }} className="transition-transform hover:scale-110">
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-2">
          <div className="text-sm text-muted-foreground">
            Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, pendingGroups.length)} of {pendingGroups.length}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 1 || isPending}
              className="gap-1"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }
                return (
                  <Button
                    key={pageNum}
                    variant={currentPage === pageNum ? "default" : "outline"}
                    size="sm"
                    onClick={() => goToPage(pageNum)}
                    disabled={isPending}
                    className="w-9"
                  >
                    {pageNum}
                  </Button>
                );
              })}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage === totalPages || isPending}
              className="gap-1"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

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
          allocationBill={selectedBatch.allocation_bill}
          isViewer={isViewer}
        />
      )}

      {editingBatch && (
        <EditDeliveryModal
          open={!!editingBatch}
          onOpenChange={(open) => !open && setEditingBatch(null)}
          group={editingBatch}
          onSuccess={() => fetchReleases()}
        />
      )}

      {/* Date picker dialog for marking as delivered */}
      <Dialog open={!!deliveredDateGroup} onOpenChange={(open) => !open && setDeliveredDateGroup(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Select Order Received Date</DialogTitle>
            <DialogDescription>
              Choose the date when the order was received at {deliveredDateGroup?.destination}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-center py-4">
            <Calendar
              mode="single"
              selected={undefined}
              onSelect={(date) => {
                if (date && deliveredDateGroup) {
                  handleDeliveredWithDate(deliveredDateGroup, date);
                }
              }}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeliveredDateGroup(null)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Summary Delivery Modal */}
      <SummaryDeliveryModal
        open={showSummaryModal}
        onOpenChange={setShowSummaryModal}
        isViewer={isViewer}
      />
    </div>
  );
};

export default Deliveries;
