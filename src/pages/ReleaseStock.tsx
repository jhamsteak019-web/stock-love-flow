import { useState } from 'react';
import { PackagePlus, Plus, Trash2, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useInventory } from '@/hooks/useInventory';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import AllocationBillModal from '@/components/deliveries/AllocationBillModal';
import { format } from 'date-fns';
import type { StockRelease } from '@/types/inventory';

interface ReleaseItem {
  id: string;
  itemId: string;
  boxes: number;
}

interface AllocationBillGroup {
  batch_id: string;
  destination: string;
  courier: string | null;
  allocation_bill: string | null;
  date_released: string;
  delivery_status: string;
  releases: StockRelease[];
}

const ReleaseStock = () => {
  const { items, releases, releaseStockBatch, loading } = useInventory();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [releaseItems, setReleaseItems] = useState<ReleaseItem[]>([
    { id: crypto.randomUUID(), itemId: '', boxes: 1 }
  ]);
  const [destination, setDestination] = useState('');
  const [courier, setCourier] = useState('');
  const [allocationBill, setAllocationBill] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [selectedBill, setSelectedBill] = useState<AllocationBillGroup | null>(null);

  const addReleaseItem = () => {
    setReleaseItems([...releaseItems, { id: crypto.randomUUID(), itemId: '', boxes: 1 }]);
  };

  const removeReleaseItem = (id: string) => {
    if (releaseItems.length > 1) {
      setReleaseItems(releaseItems.filter(item => item.id !== id));
    }
  };

  const updateReleaseItem = (id: string, field: 'itemId' | 'boxes', value: string | number) => {
    setReleaseItems(releaseItems.map(item => 
      item.id === id ? { ...item, [field]: value } : item
    ));
    
    // Auto-fill allocation bill when selecting an item
    if (field === 'itemId' && typeof value === 'string') {
      const selectedItem = items.find(i => i.id === value);
      if (selectedItem?.description) {
        setAllocationBill(selectedItem.description);
      }
    }
  };

  const getAvailableItems = (currentItemId: string) => {
    const selectedIds = releaseItems.map(r => r.itemId).filter(id => id && id !== currentItemId);
    return items.filter(item => item.available_stock > 0 && !selectedIds.includes(item.id));
  };

  const getItemData = (itemId: string) => items.find(i => i.id === itemId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const validItems = releaseItems.filter(r => r.itemId && r.boxes > 0);
    
    if (validItems.length === 0 || !destination) {
      toast({ title: 'Error', description: 'Please add at least one item and destination', variant: 'destructive' });
      return;
    }

    for (const releaseItem of validItems) {
      const itemData = getItemData(releaseItem.itemId);
      if (itemData && releaseItem.boxes > itemData.available_stock) {
        toast({ title: 'Error', description: `Not enough stock for ${itemData.item_name}`, variant: 'destructive' });
        return;
      }
    }

    setSubmitting(true);
    try {
      await releaseStockBatch(
        validItems.map(r => ({ itemId: r.itemId, boxes: r.boxes })),
        destination,
        user!.id,
        notes || undefined,
        courier || undefined,
        allocationBill || undefined
      );
      toast({ title: 'Success', description: `${validItems.length} item(s) released successfully` });
      setReleaseItems([{ id: crypto.randomUUID(), itemId: '', boxes: 1 }]);
      setDestination('');
      setCourier('');
      setAllocationBill('');
      setNotes('');
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to release stock', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  // Group releases by batch_id for allocation bills
  const allocationBills: AllocationBillGroup[] = Object.values(
    releases.reduce((acc, release) => {
      const key = release.batch_id || release.id;
      if (!acc[key]) {
        acc[key] = {
          batch_id: key,
          destination: release.destination,
          date_released: release.date_released,
          delivery_status: release.delivery_status,
          courier: release.courier,
          allocation_bill: release.allocation_bill,
          releases: []
        };
      }
      acc[key].releases.push(release);
      return acc;
    }, {} as Record<string, AllocationBillGroup>)
  ).sort((a, b) => new Date(b.date_released).getTime() - new Date(a.date_released).getTime());

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="rounded-xl border bg-card p-6 shadow-sm animate-fade-in">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <PackagePlus className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Release Stock</h2>
            <p className="text-sm text-muted-foreground">Allocate multiple items for delivery</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Items to Release *</Label>
              <Button type="button" variant="outline" size="sm" onClick={addReleaseItem}>
                <Plus className="h-4 w-4 mr-1" /> Add Item
              </Button>
            </div>

            <div className="space-y-3">
              {releaseItems.map((releaseItem, index) => {
                const itemData = getItemData(releaseItem.itemId);
                return (
                  <div key={releaseItem.id} className="flex gap-3 items-start p-3 rounded-lg bg-muted/30 border">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary mt-1">
                      {index + 1}
                    </span>
                    <div className="flex-1 grid grid-cols-[1fr,120px] gap-3">
                      <Select value={releaseItem.itemId} onValueChange={(val) => updateReleaseItem(releaseItem.id, 'itemId', val)}>
                        <SelectTrigger><SelectValue placeholder="Choose an item" /></SelectTrigger>
                        <SelectContent>
                          {getAvailableItems(releaseItem.itemId).map((item) => (
                            <SelectItem key={item.id} value={item.id}>
                              {item.item_name} ({item.available_stock} available)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input 
                        type="number" 
                        min={1} 
                        max={itemData?.available_stock || 999} 
                        value={releaseItem.boxes} 
                        onChange={(e) => updateReleaseItem(releaseItem.id, 'boxes', parseInt(e.target.value) || 0)}
                        placeholder="Boxes"
                      />
                    </div>
                    <Button 
                      type="button" 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => removeReleaseItem(releaseItem.id)}
                      disabled={releaseItems.length === 1}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Destination *</Label>
            <Input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Store / Branch / Customer" />
          </div>

          <div className="space-y-2">
            <Label>Courier (Optional)</Label>
            <Select value={courier} onValueChange={setCourier}>
              <SelectTrigger>
                <SelectValue placeholder="Select courier" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="AP CARGO">AP CARGO</SelectItem>
                <SelectItem value="SOUTHSEA">SOUTHSEA</SelectItem>
                <SelectItem value="AIRSPEED">AIRSPEED</SelectItem>
                <SelectItem value="FAST CARGO">FAST CARGO</SelectItem>
                <SelectItem value="JUNIX TRACKING">JUNIX TRACKING</SelectItem>
                <SelectItem value="RDS DC">RDS DC</SelectItem>
                <SelectItem value="SM DEC">SM DEC</SelectItem>
                <SelectItem value="PRIETO">PRIETO</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Allocation Bill (Optional)</Label>
            <Input value={allocationBill} onChange={(e) => setAllocationBill(e.target.value)} placeholder="Allocation bill number / reference" />
          </div>

          <div className="space-y-2">
            <Label>Notes (Optional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Additional notes..." />
          </div>

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Processing...' : `Release ${releaseItems.filter(r => r.itemId).length} Item(s)`}
          </Button>
        </form>
      </div>

      {/* Allocation Bills Section */}
      <div className="rounded-xl border bg-card p-6 shadow-sm animate-fade-in">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Allocation Bills</h2>
            <p className="text-sm text-muted-foreground">Recent stock releases and allocation bills</p>
          </div>
        </div>

        {allocationBills.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No allocation bills yet</p>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Allocation Bill</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead>Courier</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Total Boxes</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allocationBills.slice(0, 10).map((bill) => {
                  const totalQty = bill.releases.length;
                  const totalBoxes = bill.releases.reduce((sum, r) => sum + r.boxes_released, 0);
                  return (
                    <TableRow key={bill.batch_id}>
                      <TableCell className="font-medium">
                        {format(new Date(bill.date_released), 'MMM dd, yyyy')}
                      </TableCell>
                      <TableCell>{bill.allocation_bill || '-'}</TableCell>
                      <TableCell>{bill.destination}</TableCell>
                      <TableCell>{bill.courier || '-'}</TableCell>
                      <TableCell>{totalQty}</TableCell>
                      <TableCell>{totalBoxes}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                          bill.delivery_status === 'delivered' 
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : bill.delivery_status === 'out_for_delivery'
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                            : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                        }`}>
                          {bill.delivery_status.replace('_', ' ')}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => setSelectedBill(bill)}>
                          <FileText className="h-4 w-4 mr-1" /> View
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {selectedBill && (
        <AllocationBillModal
          open={!!selectedBill}
          onOpenChange={(open) => !open && setSelectedBill(null)}
          releases={selectedBill.releases}
          destination={selectedBill.destination}
          courier={selectedBill.courier}
          dateReleased={selectedBill.date_released}
        />
      )}
    </div>
  );
};

export default ReleaseStock;
