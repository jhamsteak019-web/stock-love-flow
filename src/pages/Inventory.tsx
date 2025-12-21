import React, { useState } from 'react';
import { Search, Plus, Edit2, Trash2, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useInventory } from '@/hooks/useInventory';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { InventoryItem } from '@/types/inventory';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

const Inventory = () => {
  const { items, categories, loading, addItem, updateItem, deleteItem, addCategory } = useInventory();
  const { userRole, user } = useAuth();
  const { toast } = useToast();
  const isAdmin = userRole === 'admin';

  const [search, setSearch] = useState('');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<InventoryItem | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    item_name: '',
    item_code: '',
    category_id: '',
    total_stock: 0,
    price: 0,
    amount: 0,
    supplier: '',
    date_received: '',
    low_stock_threshold: 10,
  });
  const [newCategory, setNewCategory] = useState('');

  const filteredItems = items.filter(item => {
    return (
      item.item_name.toLowerCase().includes(search.toLowerCase()) ||
      item.item_code.toLowerCase().includes(search.toLowerCase()) ||
      (item.supplier?.toLowerCase().includes(search.toLowerCase()) ?? false)
    );
  });

  const resetForm = () => {
    setFormData({
      item_name: '',
      item_code: '',
      category_id: '',
      total_stock: 0,
      price: 0,
      amount: 0,
      supplier: '',
      date_received: '',
      low_stock_threshold: 10,
    });
    setNewCategory('');
  };

  const handleAddItem = async () => {
    if (!formData.item_name || !formData.item_code) {
      toast({
        title: 'Validation Error',
        description: 'Item name and code are required',
        variant: 'destructive',
      });
      return;
    }

    try {
      let categoryId: string | undefined;
      
      // Create category if specified
      if (newCategory) {
        const existing = categories.find(c => c.name.toLowerCase() === newCategory.toLowerCase());
        if (existing) {
          categoryId = existing.id;
        } else {
          const cat = await addCategory(newCategory);
          categoryId = cat.id;
        }
      }

      await addItem({
        ...formData,
        category_id: categoryId || null,
        created_by: user?.id,
      });
      
      toast({
        title: 'Success',
        description: 'Item added successfully',
      });
      
      setIsAddOpen(false);
      resetForm();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to add item',
        variant: 'destructive',
      });
    }
  };

  const handleUpdateItem = async () => {
    if (!editItem) return;
    
    try {
      await updateItem(editItem.id, formData);
      toast({
        title: 'Success',
        description: 'Item updated successfully',
      });
      setEditItem(null);
      resetForm();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update item',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (!confirm('Are you sure you want to delete this item?')) return;
    
    try {
      await deleteItem(id);
      toast({
        title: 'Success',
        description: 'Item deleted successfully',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete item',
        variant: 'destructive',
      });
    }
  };

  const openEditDialog = (item: InventoryItem) => {
    setFormData({
      item_name: item.item_name,
      item_code: item.item_code,
      category_id: item.category_id || '',
      total_stock: item.total_stock,
      price: item.price || 0,
      amount: item.amount || 0,
      supplier: item.supplier || '',
      date_received: item.date_received || '',
      low_stock_threshold: item.low_stock_threshold,
    });
    setEditItem(item);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const ItemForm = () => {
    const [localForm, setLocalForm] = useState(formData);

    // Sync with parent when dialog opens
    React.useEffect(() => {
      setLocalForm(formData);
    }, [formData]);

    const handleChange = (field: string, value: string | number) => {
      setLocalForm(prev => ({ ...prev, [field]: value }));
    };

    const handleBlur = () => {
      setFormData(localForm);
    };

    return (
      <div className="grid gap-4 py-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="item_name">Item Name *</Label>
            <Input
              id="item_name"
              value={localForm.item_name}
              onChange={(e) => handleChange('item_name', e.target.value)}
              onBlur={handleBlur}
              placeholder="Enter item name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="item_code">Item Code / SKU *</Label>
            <Input
              id="item_code"
              value={localForm.item_code}
              onChange={(e) => handleChange('item_code', e.target.value)}
              onBlur={handleBlur}
              placeholder="e.g., SKU-001"
            />
          </div>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="category">Category</Label>
          <Input
            id="category"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            placeholder="Enter category name"
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="total_stock">Total Stock (Boxes)</Label>
            <Input
              id="total_stock"
              type="number"
              value={localForm.total_stock}
              onChange={(e) => handleChange('total_stock', parseInt(e.target.value) || 0)}
              onBlur={handleBlur}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="price">Price</Label>
            <Input
              id="price"
              type="number"
              step="0.01"
              value={localForm.price}
              onChange={(e) => handleChange('price', parseFloat(e.target.value) || 0)}
              onBlur={handleBlur}
              placeholder="0.00"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="amount">Amount</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              value={localForm.amount}
              onChange={(e) => handleChange('amount', parseFloat(e.target.value) || 0)}
              onBlur={handleBlur}
              placeholder="0.00"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="low_stock_threshold">Low Stock Threshold</Label>
          <Input
            id="low_stock_threshold"
            type="number"
            value={localForm.low_stock_threshold}
            onChange={(e) => handleChange('low_stock_threshold', parseInt(e.target.value) || 10)}
            onBlur={handleBlur}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="supplier">Supplier</Label>
            <Input
              id="supplier"
              value={localForm.supplier}
              onChange={(e) => handleChange('supplier', e.target.value)}
              onBlur={handleBlur}
              placeholder="Supplier name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="date_received">Date Received</Label>
            <Input
              id="date_received"
              type="date"
              value={localForm.date_received}
              onChange={(e) => {
                handleChange('date_received', e.target.value);
                setFormData(prev => ({ ...prev, date_received: e.target.value }));
              }}
            />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search items..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        
        {isAdmin && (
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2" onClick={resetForm}>
                <Plus className="h-4 w-4" />
                Add Item
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Add New Item</DialogTitle>
              </DialogHeader>
              <ItemForm />
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setIsAddOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleAddItem}>Add Item</Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editItem} onOpenChange={(open) => !open && setEditItem(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Item</DialogTitle>
          </DialogHeader>
          <ItemForm />
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setEditItem(null)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateItem}>Save Changes</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Table */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Received</TableHead>
              {isAdmin && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={isAdmin ? 9 : 8} className="text-center py-12">
                  <Package className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
                  <p className="text-muted-foreground">No items found</p>
                </TableCell>
              </TableRow>
            ) : (
              <>
                {filteredItems.map((item) => (
                  <TableRow key={item.id} className="animate-fade-in">
                    <TableCell className="font-medium">{item.item_name}</TableCell>
                    <TableCell className="text-muted-foreground">{item.item_code}</TableCell>
                    <TableCell>
                      {item.category?.name && (
                        <span className="inline-flex items-center rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground">
                          {item.category.name}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={cn(
                        "font-semibold",
                        item.available_stock <= item.low_stock_threshold && "text-destructive"
                      )}>
                        {item.available_stock}
                      </span>
                      <span className="text-muted-foreground"> / {item.total_stock}</span>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {(item.price || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {(item.amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{item.supplier || '-'}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {item.date_received 
                        ? format(new Date(item.date_received), 'MMM d, yyyy')
                        : '-'
                      }
                    </TableCell>
                    {isAdmin && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditDialog(item)}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleDeleteItem(item.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                {/* Summary Row */}
                <TableRow className="bg-muted/50 font-bold border-t-2">
                  <TableCell colSpan={5} className="text-right">Total Inventory Value:</TableCell>
                  <TableCell className="text-right text-lg text-primary">
                    ₱{filteredItems.reduce((sum, item) => sum + (item.amount || 0), 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell colSpan={isAdmin ? 3 : 2}></TableCell>
                </TableRow>
              </>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default Inventory;
