import { useState, useMemo } from 'react';
import { ClipboardList, Eye } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { useInventory } from '@/hooks/useInventory';
import { DeliveryStatus, StockRelease } from '@/types/inventory';
import { format } from 'date-fns';
import AllocationBillModal from '@/components/deliveries/AllocationBillModal';

interface GroupedRelease {
  batch_id: string;
  destination: string;
  courier: string | null;
  date_released: string;
  date_delivered: string | null;
  delivery_status: DeliveryStatus;
  totalBoxes: number;
  itemCount: number;
  items: StockRelease[];
}

const History = () => {
  const { releases, loading } = useInventory();
  const [selectedBatch, setSelectedBatch] = useState<GroupedRelease | null>(null);

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
          date_delivered: release.date_delivered,
          delivery_status: release.delivery_status,
          totalBoxes: 0,
          itemCount: 0,
          items: [],
        };
      }
      
      groups[batchKey].items.push(release);
      groups[batchKey].totalBoxes += release.boxes_released;
      groups[batchKey].itemCount += 1;
    });
    
    return Object.values(groups).sort(
      (a, b) => new Date(b.date_released).getTime() - new Date(a.date_released).getTime()
    );
  }, [releases]);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;
  }

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Items</TableHead>
            <TableHead>Total Boxes</TableHead>
            <TableHead>Destination</TableHead>
            <TableHead>Released</TableHead>
            <TableHead>Delivered</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-[80px]">View</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groupedReleases.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-12">
                <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-muted-foreground">No transaction history</p>
              </TableCell>
            </TableRow>
          ) : (
            groupedReleases.map((group) => (
              <TableRow key={group.batch_id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedBatch(group)}>
                <TableCell className="font-medium">
                  {group.itemCount} item{group.itemCount > 1 ? 's' : ''}
                </TableCell>
                <TableCell>{group.totalBoxes}</TableCell>
                <TableCell>{group.destination}</TableCell>
                <TableCell className="text-muted-foreground">{format(new Date(group.date_released), 'MMM d, yyyy')}</TableCell>
                <TableCell className="text-muted-foreground">{group.date_delivered ? format(new Date(group.date_delivered), 'MMM d, yyyy') : '-'}</TableCell>
                <TableCell><StatusBadge status={group.delivery_status} /></TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setSelectedBatch(group); }}>
                    <Eye className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

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

export default History;
