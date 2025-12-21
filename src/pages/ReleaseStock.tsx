import { useState } from 'react';
import { PackagePlus, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useInventory } from '@/hooks/useInventory';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

interface ReleaseItem {
  id: string;
  itemId: string;
  boxes: number;
}

const ReleaseStock = () => {
  const { items, releaseStockBatch, loading } = useInventory();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [releaseItems, setReleaseItems] = useState<ReleaseItem[]>([
    { id: crypto.randomUUID(), itemId: '', boxes: 1 }
  ]);
  const [destination, setDestination] = useState('');
  const [courier, setCourier] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

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

    // Check stock availability
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
        courier || undefined
      );
      toast({ title: 'Success', description: `${validItems.length} item(s) released successfully` });
      setReleaseItems([{ id: crypto.randomUUID(), itemId: '', boxes: 1 }]);
      setDestination('');
      setCourier('');
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
    <div className="max-w-3xl mx-auto">
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
            <Input value={courier} onChange={(e) => setCourier(e.target.value)} placeholder="Courier name / company" />
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
    </div>
  );
};

export default ReleaseStock;
