import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DeliveryStatus } from '@/types/inventory';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

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
  releaseIds: string[];
  allocation_bill: string | null;
  category: string | null;
  waybill_no: string | null;
  set_date: string | null;
}

interface EditDeliveryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: GroupedRelease;
  onSuccess: () => void;
}

const COURIER_OPTIONS = ['JT', 'JRS', 'J&T', 'LBC', 'SM DC', 'PICK UP', 'LALAMOVE'];

const EditDeliveryModal = ({ open, onOpenChange, group, onSuccess }: EditDeliveryModalProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  
  const [destination, setDestination] = useState(group.destination);
  const [courier, setCourier] = useState(group.courier || '');
  const [category, setCategory] = useState(group.category || '');
  const [allocationBill, setAllocationBill] = useState(group.allocation_bill || '');
  const [waybillNo, setWaybillNo] = useState(group.waybill_no || '');
  const [deliveryStatus, setDeliveryStatus] = useState<DeliveryStatus>(group.delivery_status);
  const [totalBoxes, setTotalBoxes] = useState(group.totalBoxes);
  const [totalQty, setTotalQty] = useState(group.totalQty);

  const handleSave = async () => {
    setLoading(true);
    try {
      // Calculate distributed values for boxes and qty per release
      const releaseCount = group.releaseIds.length;
      const boxesPerRelease = Math.floor(totalBoxes / releaseCount);
      const qtyPerRelease = Math.floor(totalQty / releaseCount);
      const remainingBoxes = totalBoxes % releaseCount;
      const remainingQty = totalQty % releaseCount;

      for (let i = 0; i < group.releaseIds.length; i++) {
        const releaseId = group.releaseIds[i];
        // Distribute remaining to first release
        const boxes = boxesPerRelease + (i === 0 ? remainingBoxes : 0);
        const qty = qtyPerRelease + (i === 0 ? remainingQty : 0);
        
        const { error } = await supabase
          .from('stock_releases')
          .update({
            destination,
            courier: courier || null,
            category: category || null,
            allocation_bill: allocationBill || null,
            waybill_no: waybillNo || null,
            delivery_status: deliveryStatus,
            boxes_released: boxes,
            total_qty: qty,
          })
          .eq('id', releaseId);

        if (error) throw error;
      }

      toast({ title: 'Success', description: 'Delivery updated successfully' });
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error('Error updating delivery:', error);
      toast({ title: 'Error', description: 'Failed to update delivery', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Edit Delivery</DialogTitle>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="allocation">Allocation Bill</Label>
            <Input
              id="allocation"
              value={allocationBill}
              onChange={(e) => setAllocationBill(e.target.value)}
              placeholder="Enter allocation bill"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="destination">Destination</Label>
            <Input
              id="destination"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="Enter destination"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="category">Category</Label>
            <Input
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Enter category"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="courier">Courier</Label>
            <Select value={courier} onValueChange={setCourier}>
              <SelectTrigger>
                <SelectValue placeholder="Select courier" />
              </SelectTrigger>
              <SelectContent>
                {COURIER_OPTIONS.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="waybill">Waybill No.</Label>
            <Input
              id="waybill"
              value={waybillNo}
              onChange={(e) => setWaybillNo(e.target.value)}
              placeholder="Enter waybill number"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="totalBoxes">QTY Box</Label>
              <Input
                id="totalBoxes"
                type="number"
                min={0}
                value={totalBoxes}
                onChange={(e) => setTotalBoxes(Number(e.target.value))}
                placeholder="Enter box quantity"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="totalQty">QTY Items</Label>
              <Input
                id="totalQty"
                type="number"
                min={0}
                value={totalQty}
                onChange={(e) => setTotalQty(Number(e.target.value))}
                placeholder="Enter item quantity"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="status">Delivery Status</Label>
            <Select value={deliveryStatus} onValueChange={(v) => setDeliveryStatus(v as DeliveryStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="in_transit">In Transit</SelectItem>
                <SelectItem value="out_for_delivery">Out for Delivery</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
              </SelectContent>
            </Select>
          </div>

        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditDeliveryModal;
