import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/status-badge';
import { StockRelease } from '@/types/inventory';
import { format } from 'date-fns';
import { Package, MapPin, Calendar, FileText } from 'lucide-react';

interface AllocationBillModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  releases: StockRelease[];
  destination: string;
  dateReleased: string;
}

const AllocationBillModal = ({ open, onOpenChange, releases, destination, dateReleased }: AllocationBillModalProps) => {
  const totalBoxes = releases.reduce((sum, r) => sum + r.boxes_released, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Allocation Bill Details
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-muted/50">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Destination:</span>
              <span className="font-medium">{destination}</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Released:</span>
              <span className="font-medium">{format(new Date(dateReleased), 'MMM d, yyyy')}</span>
            </div>
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Total Items:</span>
              <span className="font-medium">{releases.length}</span>
            </div>
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Total Boxes:</span>
              <span className="font-medium">{totalBoxes}</span>
            </div>
          </div>

          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item Name</TableHead>
                  <TableHead>Item Code</TableHead>
                  <TableHead className="text-right">Boxes</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {releases.map((release) => (
                  <TableRow key={release.id}>
                    <TableCell className="font-medium">{release.inventory_item?.item_name}</TableCell>
                    <TableCell className="text-muted-foreground">{release.inventory_item?.item_code}</TableCell>
                    <TableCell className="text-right">{release.boxes_released}</TableCell>
                    <TableCell><StatusBadge status={release.delivery_status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {releases[0]?.notes && (
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-sm text-muted-foreground">Notes:</p>
              <p className="text-sm mt-1">{releases[0].notes}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AllocationBillModal;
