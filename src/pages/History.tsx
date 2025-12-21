import { useState, useMemo } from 'react';
import { ClipboardList, Eye, Trash2 } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { useInventory } from '@/hooks/useInventory';
import { useAuth } from '@/contexts/AuthContext';
import { DeliveryStatus, StockRelease } from '@/types/inventory';
import { format } from 'date-fns';
import AllocationBillModal from '@/components/deliveries/AllocationBillModal';
import { useToast } from '@/hooks/use-toast';

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
  const { releases, loading, deleteReleaseBatch } = useInventory();
  const { userRole } = useAuth();
  const { toast } = useToast();
  const [selectedBatch, setSelectedBatch] = useState<GroupedRelease | null>(null);
  const isAdmin = userRole === 'admin';

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

  const handleDelete = async (group: GroupedRelease, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this release? This action cannot be undone.')) return;
    
    try {
      await deleteReleaseBatch(group.batch_id);
      toast({ title: 'Success', description: 'Release deleted successfully' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to delete release', variant: 'destructive' });
    }
  };

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
            <TableHead className="w-[100px]">Actions</TableHead>
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
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setSelectedBatch(group); }}>
                      <Eye className="h-4 w-4" />
                    </Button>
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