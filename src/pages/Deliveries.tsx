import { useState, useMemo } from 'react';
import { Truck, Eye, CalendarIcon } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useInventory } from '@/hooks/useInventory';
import { useToast } from '@/hooks/use-toast';
import { DeliveryStatus, StockRelease } from '@/types/inventory';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import AllocationBillModal from '@/components/deliveries/AllocationBillModal';

interface GroupedRelease {
  batch_id: string;
  destination: string;
  courier: string | null;
  date_released: string;
  delivery_status: DeliveryStatus;
  totalBoxes: number;
  itemCount: number;
  items: StockRelease[];
  releaseIds: string[];
}

const Deliveries = () => {
  const { releases, loading, updateDeliveryStatus } = useInventory();
  const { toast } = useToast();
  const [selectedBatch, setSelectedBatch] = useState<GroupedRelease | null>(null);

  // Group releases by batch_id
  const groupedReleases = useMemo(() => {
    const groups: Record<string, GroupedRelease> = {};
    
    releases.forEach(release => {
      const batchKey = release.batch_id || release.id; // Use release id as fallback for old releases
      
      if (!groups[batchKey]) {
        groups[batchKey] = {
          batch_id: batchKey,
          destination: release.destination,
          courier: release.courier,
          date_released: release.date_released,
          delivery_status: release.delivery_status,
          totalBoxes: 0,
          itemCount: 0,
          items: [],
          releaseIds: [],
        };
      }
      
      groups[batchKey].items.push(release);
      groups[batchKey].totalBoxes += release.boxes_released;
      groups[batchKey].itemCount += 1;
      groups[batchKey].releaseIds.push(release.id);
    });
    
    return Object.values(groups).sort(
      (a, b) => new Date(b.date_released).getTime() - new Date(a.date_released).getTime()
    );
  }, [releases]);

  const pendingGroups = groupedReleases.filter(g => g.delivery_status !== 'delivered');

  const handleStatusChange = async (group: GroupedRelease, status: DeliveryStatus) => {
    try {
      // Update all releases in the batch
      for (const releaseId of group.releaseIds) {
        await updateDeliveryStatus(releaseId, status);
      }
      toast({ title: 'Success', description: 'Delivery status updated' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update status', variant: 'destructive' });
    }
  };

  const handleDeliveryDateChange = async (group: GroupedRelease, date: Date) => {
    try {
      // Update status to delivered and set date
      for (const releaseId of group.releaseIds) {
        await updateDeliveryStatus(releaseId, 'delivered', date.toISOString());
      }
      toast({ title: 'Success', description: `Marked as delivered on ${format(date, 'MMM d, yyyy')}` });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update delivery date', variant: 'destructive' });
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Items</TableHead>
              <TableHead>Allocation</TableHead>
              <TableHead>Total Boxes</TableHead>
              <TableHead>Destination</TableHead>
              <TableHead>Released</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[80px]">View</TableHead>
              <TableHead>Delivered On</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pendingGroups.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12">
                  <Truck className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
                  <p className="text-muted-foreground">No pending deliveries</p>
                </TableCell>
              </TableRow>
            ) : (
              pendingGroups.map((group, index) => (
                <TableRow 
                  key={group.batch_id} 
                  className="transition-all duration-300 ease-out hover:bg-muted/50"
                  style={{ animation: `fade-in 0.4s ease-out ${index * 50}ms forwards`, opacity: 0 }}
                >
                  <TableCell className="font-medium">
                    {group.itemCount} item{group.itemCount > 1 ? 's' : ''}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm space-y-0.5">
                      {group.items.slice(0, 2).map((item) => (
                        <div key={item.id} className="text-muted-foreground">
                          {item.inventory_item?.item_name || 'Unknown'}: <span className="font-medium text-foreground">{item.boxes_released}</span>
                        </div>
                      ))}
                      {group.items.length > 2 && (
                        <div className="text-muted-foreground text-xs">+{group.items.length - 2} more</div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{group.totalBoxes}</TableCell>
                  <TableCell>{group.destination}</TableCell>
                  <TableCell>{format(new Date(group.date_released), 'MMM d, yyyy')}</TableCell>
                  <TableCell><StatusBadge status={group.delivery_status} /></TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setSelectedBatch(group); }} className="transition-transform hover:scale-110">
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="w-[140px] justify-start text-left font-normal transition-all hover:border-primary">
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          Set Date
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={undefined}
                          onSelect={(date) => date && handleDeliveryDateChange(group, date)}
                          initialFocus
                          className={cn("p-3 pointer-events-auto")}
                        />
                      </PopoverContent>
                    </Popover>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {selectedBatch && (
        <AllocationBillModal
          open={!!selectedBatch}
          onOpenChange={(open) => !open && setSelectedBatch(null)}
          releases={selectedBatch.items}
          destination={selectedBatch.destination}
          courier={selectedBatch.courier}
          dateReleased={selectedBatch.date_released}
        />
      )}
    </div>
  );
};

export default Deliveries;
