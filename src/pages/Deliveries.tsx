import { Truck } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/status-badge';
import { useInventory } from '@/hooks/useInventory';
import { useToast } from '@/hooks/use-toast';
import { DeliveryStatus } from '@/types/inventory';
import { format } from 'date-fns';

const Deliveries = () => {
  const { releases, loading, updateDeliveryStatus } = useInventory();
  const { toast } = useToast();

  const handleStatusChange = async (releaseId: string, status: DeliveryStatus) => {
    try {
      await updateDeliveryStatus(releaseId, status);
      toast({ title: 'Success', description: 'Delivery status updated' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update status', variant: 'destructive' });
    }
  };

  const pendingReleases = releases.filter(r => r.delivery_status !== 'delivered');

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Boxes</TableHead>
              <TableHead>Destination</TableHead>
              <TableHead>Released</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Update</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pendingReleases.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12">
                  <Truck className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
                  <p className="text-muted-foreground">No pending deliveries</p>
                </TableCell>
              </TableRow>
            ) : (
              pendingReleases.map((release) => (
                <TableRow key={release.id} className="animate-fade-in">
                  <TableCell className="font-medium">{release.inventory_item?.item_name}</TableCell>
                  <TableCell>{release.boxes_released}</TableCell>
                  <TableCell>{release.destination}</TableCell>
                  <TableCell className="text-muted-foreground">{format(new Date(release.date_released), 'MMM d, yyyy')}</TableCell>
                  <TableCell><StatusBadge status={release.delivery_status} /></TableCell>
                  <TableCell>
                    <Select value={release.delivery_status} onValueChange={(val) => handleStatusChange(release.id, val as DeliveryStatus)}>
                      <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="out_for_delivery">Out for Delivery</SelectItem>
                        <SelectItem value="delivered">Delivered</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default Deliveries;
