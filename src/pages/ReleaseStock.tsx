import { useState } from 'react';
import { PackagePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useInventory } from '@/hooks/useInventory';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

const ReleaseStock = () => {
  const { items, releaseStock, loading } = useInventory();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [selectedItem, setSelectedItem] = useState('');
  const [boxesReleased, setBoxesReleased] = useState(1);
  const [destination, setDestination] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const selectedItemData = items.find(i => i.id === selectedItem);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedItem || !destination || boxesReleased <= 0) {
      toast({ title: 'Error', description: 'Please fill all required fields', variant: 'destructive' });
      return;
    }

    if (selectedItemData && boxesReleased > selectedItemData.available_stock) {
      toast({ title: 'Error', description: 'Not enough stock available', variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    try {
      await releaseStock(selectedItem, boxesReleased, destination, user!.id, notes || undefined);
      toast({ title: 'Success', description: 'Stock released successfully' });
      setSelectedItem('');
      setBoxesReleased(1);
      setDestination('');
      setNotes('');
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to release stock', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="rounded-xl border bg-card p-6 shadow-sm animate-fade-in">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <PackagePlus className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Release Stock</h2>
            <p className="text-sm text-muted-foreground">Allocate boxes for delivery</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label>Select Item *</Label>
            <Select value={selectedItem} onValueChange={setSelectedItem}>
              <SelectTrigger><SelectValue placeholder="Choose an item" /></SelectTrigger>
              <SelectContent>
                {items.filter(i => i.available_stock > 0).map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.item_name} ({item.available_stock} available)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Boxes to Release *</Label>
              <Input type="number" min={1} max={selectedItemData?.available_stock || 999} value={boxesReleased} onChange={(e) => setBoxesReleased(parseInt(e.target.value) || 0)} />
            </div>
            <div className="space-y-2">
              <Label>Destination *</Label>
              <Input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Store / Branch / Customer" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Notes (Optional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Additional notes..." />
          </div>

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Processing...' : 'Release Stock'}
          </Button>
        </form>
      </div>
    </div>
  );
};

export default ReleaseStock;
