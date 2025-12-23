import { useState, useMemo } from 'react';
import { ClipboardList, Eye, Trash2, AlertTriangle, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { useInventory } from '@/hooks/useInventory';
import { useAuth } from '@/contexts/AuthContext';
import { DeliveryStatus, StockRelease } from '@/types/inventory';
import { format } from 'date-fns';
import AllocationBillModal from '@/components/deliveries/AllocationBillModal';
import { useToast } from '@/hooks/use-toast';
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
  const { releases, loading, deleteReleaseBatch, deleteAllReleases } = useInventory();
  const { userRole } = useAuth();
  const { toast } = useToast();
  const [selectedBatch, setSelectedBatch] = useState<GroupedRelease | null>(null);
  const [clearing, setClearing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
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

  // Filter grouped releases based on search query
  const filteredReleases = useMemo(() => {
    if (!searchQuery.trim()) return groupedReleases;
    
    const query = searchQuery.toLowerCase();
    return groupedReleases.filter(group => {
      // Search in destination, courier, status
      if (group.destination.toLowerCase().includes(query)) return true;
      if (group.courier?.toLowerCase().includes(query)) return true;
      if (group.delivery_status.toLowerCase().includes(query)) return true;
      
      // Search in item names within the batch
      const itemMatch = group.items.some(item => 
        item.inventory_item?.item_name?.toLowerCase().includes(query) ||
        item.inventory_item?.item_code?.toLowerCase().includes(query)
      );
      if (itemMatch) return true;
      
      return false;
    });
  }, [groupedReleases, searchQuery]);

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

  const handleClearAll = async () => {
    setClearing(true);
    try {
      await deleteAllReleases();
      toast({ title: 'Success', description: 'All transaction history cleared' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to clear history', variant: 'destructive' });
    } finally {
      setClearing(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Search and Clear All */}
      <div className="flex flex-col sm:flex-row gap-3 justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by destination, courier, item name, or status..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        {isAdmin && groupedReleases.length > 0 && (
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
                  This will permanently delete all {groupedReleases.length} transaction records. This action cannot be undone.
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
      </div>

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
          {filteredReleases.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-12">
                <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-muted-foreground">
                  {searchQuery ? 'No results found' : 'No transaction history'}
                </p>
              </TableCell>
            </TableRow>
          ) : (
            filteredReleases.map((group) => (
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

      </div>

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
    </div>
  );
};

export default History;