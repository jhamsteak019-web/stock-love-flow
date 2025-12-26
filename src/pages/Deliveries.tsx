import { useState, useMemo, useCallback, useTransition } from 'react';
import { Truck, Eye, CalendarIcon, Pencil, Search, X, ChevronLeft, ChevronRight } from 'lucide-react';
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
import { DeliveryStatus, StockRelease } from '@/types/inventory';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import AllocationBillModal from '@/components/deliveries/AllocationBillModal';
import EditDeliveryModal from '@/components/deliveries/EditDeliveryModal';
import { supabase } from '@/integrations/supabase/client';
import { useDebounce } from '@/hooks/useDebounce';

const ITEMS_PER_PAGE = 15;

interface GroupedRelease {
  batch_id: string;
  destination: string;
  courier: string | null;
  date_released: string;
  date_delivered: string | null;
  delivery_status: DeliveryStatus;
  totalBoxes: number;
  totalQty: number;
  itemCount: number;
  items: StockRelease[];
  releaseIds: string[];
  allocation_bill: string | null;
  category: string | null;
  waybill_no: string | null;
  set_date: string | null;
  notes: string | null;
}

const Deliveries = () => {
  const { releases, loading, updateDeliveryStatus, fetchReleases } = useInventory();
  const { toast } = useToast();
  const { userRole } = useAuth();
  const [selectedBatch, setSelectedBatch] = useState<GroupedRelease | null>(null);
  const [editingBatch, setEditingBatch] = useState<GroupedRelease | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [deliveredDateGroup, setDeliveredDateGroup] = useState<GroupedRelease | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [isPending, startTransition] = useTransition();
  const isAdmin = userRole === 'admin';
  
  // Debounced search for smooth performance
  const debouncedSearch = useDebounce(searchQuery, 350);

  // Group releases by batch_id
  const groupedReleases = useMemo(() => {
    const groups: Record<string, GroupedRelease> = {};
    
    releases.forEach(release => {
      const batchKey = release.batch_id || release.id;
      
      if (!groups[batchKey]) {
        groups[batchKey] = {
          batch_id: batchKey,
          destination: release.destination,
          courier: release.courier,
          date_released: release.date_released,
          date_delivered: release.date_delivered || null,
          delivery_status: release.delivery_status,
          totalBoxes: 0,
          totalQty: 0,
          itemCount: 0,
          items: [],
          releaseIds: [],
          allocation_bill: release.allocation_bill,
          category: release.category,
          waybill_no: release.waybill_no,
          set_date: release.set_date,
          notes: release.notes,
        };
      }
      
      groups[batchKey].items.push(release);
      groups[batchKey].totalBoxes += release.boxes_released;
      groups[batchKey].totalQty += release.total_qty || (release.boxes_released * (release.inventory_item?.pieces_per_box || 1));
      groups[batchKey].itemCount += 1;
      groups[batchKey].releaseIds.push(release.id);
    });
    
    return Object.values(groups).sort(
      (a, b) => new Date(b.date_released).getTime() - new Date(a.date_released).getTime()
    );
  }, [releases]);

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
      for (const releaseId of group.releaseIds) {
        await updateDeliveryStatus(releaseId, status);
      }
      toast({ title: 'Success', description: 'Delivery status updated' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update status', variant: 'destructive' });
    }
  };

  const handleDeliveredWithDate = async (group: GroupedRelease, date: Date) => {
    try {
      for (const releaseId of group.releaseIds) {
        await supabase
          .from('stock_releases')
          .update({ 
            delivery_status: 'delivered' as DeliveryStatus,
            date_delivered: date.toISOString()
          })
          .eq('id', releaseId);
      }
      await fetchReleases();
      setDeliveredDateGroup(null);
      toast({ title: 'Success', description: `Marked as delivered on ${format(date, 'MMM d, yyyy')}` });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update status', variant: 'destructive' });
    }
  };

  const handleWaybillChange = async (group: GroupedRelease, waybillNo: string) => {
    try {
      for (const releaseId of group.releaseIds) {
        await supabase
          .from('stock_releases')
          .update({ waybill_no: waybillNo })
          .eq('id', releaseId);
      }
      await fetchReleases();
      toast({ title: 'Success', description: 'Waybill updated' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update waybill', variant: 'destructive' });
    }
  };

  const handleRemarksChange = async (group: GroupedRelease, notes: string) => {
    try {
      for (const releaseId of group.releaseIds) {
        await supabase
          .from('stock_releases')
          .update({ notes })
          .eq('id', releaseId);
      }
      await fetchReleases();
      toast({ title: 'Success', description: 'Remarks updated' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update remarks', variant: 'destructive' });
    }
  };

  const handleSetDateChange = async (group: GroupedRelease, date: Date) => {
    try {
      for (const releaseId of group.releaseIds) {
        await supabase
          .from('stock_releases')
          .update({ set_date: date.toISOString() })
          .eq('id', releaseId);
      }
      await fetchReleases();
      toast({ title: 'Success', description: `Delivery date set to ${format(date, 'MMM d, yyyy')}` });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update delivery date', variant: 'destructive' });
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
        {pendingGroups.length > 0 && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{pendingGroups.length} result{pendingGroups.length !== 1 ? 's' : ''}</span>
            {isPending && (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            )}
          </div>
        )}
      </div>
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Allocation</TableHead>
              <TableHead>Destination</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Total Boxes</TableHead>
              <TableHead className="text-right">Total Qty/Items</TableHead>
              <TableHead>Date Out Warehouse</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Waybill No.</TableHead>
              <TableHead>Remarks</TableHead>
              <TableHead className="w-[80px]">View</TableHead>
              {isAdmin && <TableHead className="w-[80px]">Edit</TableHead>}
              
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedGroups.length === 0 ? (
              <TableRow>
              <TableCell colSpan={isAdmin ? 11 : 10} className="text-center py-12">
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
                  <TableCell className="font-medium">
                    {group.allocation_bill || group.batch_id.slice(0, 8)}
                  </TableCell>
                  <TableCell>{group.destination}</TableCell>
                  <TableCell>{group.category || '-'}</TableCell>
                  <TableCell className="text-right">{group.totalBoxes}</TableCell>
                  <TableCell className="text-right">{group.totalQty}</TableCell>
                  <TableCell>{group.set_date ? format(new Date(group.set_date), 'MMM d, yyyy') : '-'}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
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
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Input
                      placeholder="Enter waybill"
                      defaultValue={group.waybill_no || ''}
                      className="h-8 w-[120px] text-sm"
                      onBlur={(e) => {
                        if (e.target.value !== (group.waybill_no || '')) {
                          handleWaybillChange(group, e.target.value);
                        }
                      }}
                    />
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
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
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setSelectedBatch(group); }} className="transition-transform hover:scale-110">
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                  {isAdmin && (
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
    </div>
  );
};

export default Deliveries;