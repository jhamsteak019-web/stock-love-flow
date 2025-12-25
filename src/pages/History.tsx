import { useState, useMemo, useEffect } from 'react';
import { ClipboardList, Eye, Trash2, AlertTriangle, Search, CalendarIcon, X, RotateCcw, Archive, Pencil } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { useInventory } from '@/hooks/useInventory';
import { useAuth } from '@/contexts/AuthContext';
import { DeliveryStatus, StockRelease } from '@/types/inventory';
import { format, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import AllocationBillModal from '@/components/deliveries/AllocationBillModal';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
}

const History = () => {
  const { releases, loading, deleteReleaseBatch, deleteAllReleases, fetchDeletedReleases, restoreReleaseBatch, permanentlyDeleteBatch, permanentlyDeleteAllDeleted, updateBatchDates } = useInventory();
  const { userRole } = useAuth();
  const { toast } = useToast();
  const [selectedBatch, setSelectedBatch] = useState<GroupedRelease | null>(null);
  const [clearing, setClearing] = useState(false);
  const [clearingDeleted, setClearingDeleted] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState('active');
  const [deletedReleases, setDeletedReleases] = useState<StockRelease[]>([]);
  const [loadingDeleted, setLoadingDeleted] = useState(false);
  const [editingBatch, setEditingBatch] = useState<GroupedRelease | null>(null);
  const [editDateOut, setEditDateOut] = useState<Date | undefined>(undefined);
  const [editDateReceived, setEditDateReceived] = useState<Date | undefined>(undefined);
  const isAdmin = userRole === 'admin';

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
        };
      }
      
      groups[batchKey].items.push(release);
      groups[batchKey].totalBoxes += release.boxes_released;
      groups[batchKey].totalQty += release.total_qty || 0;
      groups[batchKey].itemCount += 1;
    });
    
    return Object.values(groups).sort(
      (a, b) => new Date(b.date_released).getTime() - new Date(a.date_released).getTime()
    );
  };

  const groupedReleases = useMemo(() => groupReleases(releases), [releases]);
  const groupedDeletedReleases = useMemo(() => groupReleases(deletedReleases), [deletedReleases]);

  // Filter grouped releases based on search query, date range, and status
  const filteredReleases = useMemo(() => {
    return groupedReleases.filter(group => {
      // Date range filter
      if (startDate || endDate) {
        const releaseDate = new Date(group.date_released);
        if (startDate && endDate) {
          if (!isWithinInterval(releaseDate, { start: startOfDay(startDate), end: endOfDay(endDate) })) {
            return false;
          }
        } else if (startDate && releaseDate < startOfDay(startDate)) {
          return false;
        } else if (endDate && releaseDate > endOfDay(endDate)) {
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
        
        const itemMatch = group.items.some(item => 
          item.inventory_item?.item_name?.toLowerCase().includes(query) ||
          item.inventory_item?.item_code?.toLowerCase().includes(query)
        );
        if (itemMatch) return true;
        
        return false;
      }
      
      return true;
    });
  }, [groupedReleases, searchQuery, startDate, endDate, statusFilter]);

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

  const handleEditDates = (group: GroupedRelease, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingBatch(group);
    setEditDateOut(group.set_date ? new Date(group.set_date) : undefined);
    setEditDateReceived(group.date_delivered ? new Date(group.date_delivered) : undefined);
  };

  const handleSaveDates = async () => {
    if (!editingBatch) return;
    
    try {
      await updateBatchDates(
        editingBatch.batch_id, 
        editDateOut ? editDateOut.toISOString() : null,
        editDateReceived ? editDateReceived.toISOString() : null
      );
      toast({ title: 'Success', description: 'Dates updated successfully' });
      setEditingBatch(null);
      setEditDateOut(undefined);
      setEditDateReceived(undefined);
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update dates', variant: 'destructive' });
    }
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
            <TabsTrigger value="deleted" className="flex items-center gap-1">
              <Archive className="h-4 w-4" />
              Recently Deleted
            </TabsTrigger>
          </TabsList>
          
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

        <TabsContent value="active" className="space-y-4">
          {/* Search and Filters */}
          <div className="flex flex-col gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by destination, courier, item name, or status..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
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

              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "justify-start text-left font-normal",
                      !startDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, "MMM d, yyyy") : "Start date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={setStartDate}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>

              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "justify-start text-left font-normal",
                      !endDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, "MMM d, yyyy") : "End date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={setEndDate}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>

              {(startDate || endDate || statusFilter !== 'all') && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="h-4 w-4 mr-1" />
                  Clear filters
                </Button>
              )}
            </div>
          </div>

          <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Allocation</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Total Boxes</TableHead>
                  <TableHead>Total Qty/Items</TableHead>
                  <TableHead>Date Out</TableHead>
                  <TableHead>Date Received</TableHead>
                  <TableHead>Courier</TableHead>
                  <TableHead>Waybill No.</TableHead>
                  <TableHead>Remarks</TableHead>
                  <TableHead className="w-[140px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReleases.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-12">
                      <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
                      <p className="text-muted-foreground">
                        {searchQuery || startDate || endDate || statusFilter !== 'all' ? 'No results found' : 'No transaction history'}
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredReleases.map((group) => (
                    <TableRow key={group.batch_id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedBatch(group)}>
                      <TableCell className="font-medium">{group.allocation_bill || '-'}</TableCell>
                      <TableCell>{group.destination}</TableCell>
                      <TableCell>{group.category || '-'}</TableCell>
                      <TableCell>{group.totalBoxes}</TableCell>
                      <TableCell>{group.totalQty || group.itemCount}</TableCell>
                      <TableCell className="text-muted-foreground">{group.set_date ? format(new Date(group.set_date), 'MMM d, yyyy') : '-'}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {group.date_delivered ? format(new Date(group.date_delivered), 'MMM d, yyyy') : '-'}
                      </TableCell>
                      <TableCell>{group.courier || '-'}</TableCell>
                      <TableCell>{group.waybill_no || '-'}</TableCell>
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
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setSelectedBatch(group); }}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          {isAdmin && (
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={(e) => handleEditDates(group, e)}
                              title="Edit dates"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {isAdmin && (
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={(e) => handleDelete(group, e)}
                              className="text-destructive hover:text-destructive"
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
        />
      )}

      {/* Edit Dates Dialog */}
      <AlertDialog open={!!editingBatch} onOpenChange={(open) => !open && setEditingBatch(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Edit Dates</AlertDialogTitle>
            <AlertDialogDescription>
              Update the Date Out and Date Received for transaction to {editingBatch?.destination}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Date Out Warehouse</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !editDateOut && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {editDateOut ? format(editDateOut, "PPP") : "Select date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={editDateOut}
                    onSelect={setEditDateOut}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Date Received</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !editDateReceived && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {editDateReceived ? format(editDateReceived, "PPP") : "Select date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={editDateReceived}
                    onSelect={setEditDateReceived}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSaveDates}>
              Save
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default History;