import { useState } from 'react';
import { Search, Filter, Plus, Edit2, Trash2, Package } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<InventoryItem | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    item_name: '',
    item_code: '',
    category_id: '',
    total_stock: 0,
    supplier: '',
    date_received: '',
    low_stock_threshold: 10,
  });
  const [newCategory, setNewCategory] = useState('');

  const filteredItems = items.filter(item => {
    const matchesSearch = 
      item.item_name.toLowerCase().includes(search.toLowerCase()) ||
      item.item_code.toLowerCase().includes(search.toLowerCase()) ||
      (item.supplier?.toLowerCase().includes(search.toLowerCase()) ?? false);
    
    const matchesCategory = 
      categoryFilter === 'all' || item.category_id === categoryFilter;
    
    return matchesSearch && matchesCategory;
  });

  const resetForm = () => {
    setFormData({
      item_name: '',
      item_code: '',
      category_id: '',
      total_stock: 0,
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
      let categoryId = formData.category_id;
      
      // Create new category if specified
      if (newCategory && !categoryId) {
        const cat = await addCategory(newCategory);
        categoryId = cat.id;
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

  const ItemForm = () => (
    <div className="grid gap-4 py-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="item_name">Item Name *</Label>
          <Input
            id="item_name"
            value={formData.item_name}
            onChange={(e) => setFormData({ ...formData, item_name: e.target.value })}
            placeholder="Enter item name"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="item_code">Item Code / SKU *</Label>
          <Input
            id="item_code"
            value={formData.item_code}
            onChange={(e) => setFormData({ ...formData, item_code: e.target.value })}
            placeholder="e.g., SKU-001"
          />
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Category</Label>
          <Select
            value={formData.category_id}
            onValueChange={(value) => setFormData({ ...formData, category_id: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>
                  {cat.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="new_category">Or Create New</Label>
          <Input
            id="new_category"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            placeholder="New category name"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="total_stock">Total Stock (Boxes)</Label>
          <Input
            id="total_stock"
            type="number"
            value={formData.total_stock}
            onChange={(e) => setFormData({ ...formData, total_stock: parseInt(e.target.value) || 0 })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="low_stock_threshold">Low Stock Threshold</Label>
          <Input
            id="low_stock_threshold"
            type="number"
            value={formData.low_stock_threshold}
            onChange={(e) => setFormData({ ...formData, low_stock_threshold: parseInt(e.target.value) || 10 })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="supplier">Supplier</Label>
          <Input
            id="supplier"
            value={formData.supplier}
            onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
            placeholder="Supplier name"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="date_received">Date Received</Label>
          <Input
            id="date_received"
            type="date"
            value={formData.date_received}
            onChange={(e) => setFormData({ ...formData, date_received: e.target.value })}
          />
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <div className="flex flex-1 gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search items..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[180px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>
                  {cat.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
              <TableHead>Supplier</TableHead>
              <TableHead>Received</TableHead>
              {isAdmin && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={isAdmin ? 7 : 6} className="text-center py-12">
                  <Package className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
                  <p className="text-muted-foreground">No items found</p>
                </TableCell>
              </TableRow>
            ) : (
              filteredItems.map((item) => (
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
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default Inventory;
