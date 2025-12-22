import React, { useState, useRef, useCallback } from 'react';
import { Search, Plus, Edit2, Trash2, Package, Upload } from 'lucide-react';
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
import * as XLSX from 'xlsx';
const Inventory = () => {
  const { items, categories, loading, addItem, updateItem, deleteItem, deleteAllItems, addCategory } = useInventory();
  const { userRole, user } = useAuth();
  const { toast } = useToast();
  const isAdmin = userRole === 'admin';

  const [search, setSearch] = useState('');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<InventoryItem | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
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
    year: '',
    upc: '',
    description: '',
    branch: '',
  });
  const [newCategory, setNewCategory] = useState('');

  // Excel import helpers
  const findColumnValue = useCallback((row: Record<string, unknown>, ...possibleNames: string[]): string => {
    const keys = Object.keys(row);
    for (const name of possibleNames) {
      if (row[name] !== undefined && row[name] !== null && String(row[name]).trim() !== '') {
        return String(row[name]).trim();
      }
      const exactKey = keys.find(k => k.toLowerCase().trim() === name.toLowerCase().trim());
      if (exactKey && row[exactKey] !== undefined && row[exactKey] !== null && String(row[exactKey]).trim() !== '') {
        return String(row[exactKey]).trim();
      }
    }
    for (const name of possibleNames) {
      const partialKey = keys.find(k => 
        k.toLowerCase().includes(name.toLowerCase()) || 
        name.toLowerCase().includes(k.toLowerCase())
      );
      if (partialKey && row[partialKey] !== undefined && row[partialKey] !== null && String(row[partialKey]).trim() !== '') {
        return String(row[partialKey]).trim();
      }
    }
    return '';
  }, []);

  const findNumericValue = useCallback((row: Record<string, unknown>, ...possibleNames: string[]): number => {
    const val = findColumnValue(row, ...possibleNames);
    const cleanVal = val.replace(/[₱$,]/g, '').trim();
    return Number(cleanVal) || 0;
  }, [findColumnValue]);

  const handleImportExcel = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setImporting(true);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      
      let rows = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, unknown>[];
      
      if (rows.length === 0) {
        rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown as Record<string, unknown>[];
        if (Array.isArray(rows) && rows.length > 1) {
          const headers = rows[0] as unknown as string[];
          rows = (rows.slice(1) as unknown as unknown[][]).map(row => {
            const obj: Record<string, unknown> = {};
            headers.forEach((header, i) => {
              if (header) obj[String(header)] = row[i];
            });
            return obj;
          });
        }
      }

      if (rows.length > 10000) {
        rows = rows.slice(0, 10000);
        toast({ title: 'Row Limit', description: 'Only first 10,000 rows imported.', variant: 'default' });
      }

      const parsedItems = rows.map((row) => ({
        year: findColumnValue(row, 'YEAR', 'Year', 'year'),
        name: findColumnValue(row, 'Name', 'NAME', 'Item Name', 'ITEM NAME', 'Product Name'),
        upc: findColumnValue(row, 'UPC', 'upc', 'Barcode', 'BARCODE', 'Item Code', 'ITEM CODE', 'Code', 'SKU'),
        description: findColumnValue(row, 'Description', 'DESCRIPTION', 'Desc', 'DESC', 'Product Description'),
        category: findColumnValue(row, 'Category', 'CATEGORY', 'Cat', 'Type'),
        priceA: findNumericValue(row, 'Price A', 'PRICE A', 'Price', 'PRICE', 'Unit Price', 'Cost'),
        branch: findColumnValue(row, 'Branch', 'BRANCH', 'Location', 'Store', 'Destination'),
      }));

      const validItems = parsedItems.filter(item => item.name || item.upc || item.description);

      if (validItems.length === 0) {
        toast({ title: 'No Items Found', description: 'Check column headers (YEAR, Name, UPC, Description, Category, Price A, Branch).', variant: 'destructive' });
        setImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      let successCount = 0;
      for (const item of validItems) {
        try {
          let categoryId: string | undefined;
          if (item.category) {
            const existing = categories.find(c => c.name.toLowerCase() === item.category.toLowerCase());
            if (existing) {
              categoryId = existing.id;
            } else {
              const cat = await addCategory(item.category);
              categoryId = cat.id;
            }
          }

          await addItem({
            item_name: item.name || item.description || item.upc || 'Unknown',
            item_code: item.upc || `IMP-${Date.now()}-${successCount}`,
            category_id: categoryId || null,
            total_stock: 0,
            available_stock: 0,
            price: item.priceA || 0,
            amount: 0,
            supplier: null,
            date_received: null,
            low_stock_threshold: 10,
            created_by: user?.id,
            year: item.year || null,
            upc: item.upc || null,
            description: item.description || null,
            branch: item.branch || null,
          });
          successCount++;
        } catch (err) {
          console.error('Failed to import item:', item, err);
        }
      }

      toast({ title: 'Import Complete', description: `${successCount} items imported to inventory.` });
    } catch (error) {
      console.error('Excel parse error:', error);
      toast({ title: 'Error', description: 'Failed to import file.', variant: 'destructive' });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [user, categories, addCategory, addItem, toast, findColumnValue, findNumericValue]);

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
      year: '',
      upc: '',
      description: '',
      branch: '',
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
      year: item.year || '',
      upc: item.upc || '',
      description: item.description || '',
      branch: item.branch || '',
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

  const ItemForm = ({ onCategoryChange }: { onCategoryChange: (val: string) => void }) => {
    const [localForm, setLocalForm] = useState(formData);
    const [localCategory, setLocalCategory] = useState(newCategory);

    // Sync with parent when dialog opens
    React.useEffect(() => {
      setLocalForm(formData);
      setLocalCategory(newCategory);
    }, [formData, newCategory]);

    const handleChange = (field: string, value: string | number) => {
      setLocalForm(prev => ({ ...prev, [field]: value }));
    };

    const handleBlur = () => {
      setFormData(localForm);
    };

    const handleCategoryBlur = () => {
      onCategoryChange(localCategory);
    };

    return (
      <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="year">Year</Label>
            <Input
              id="year"
              value={localForm.year}
              onChange={(e) => handleChange('year', e.target.value)}
              onBlur={handleBlur}
              placeholder="e.g., 2024"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="item_name">Name *</Label>
            <Input
              id="item_name"
              value={localForm.item_name}
              onChange={(e) => handleChange('item_name', e.target.value)}
              onBlur={handleBlur}
              placeholder="Enter item name"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="upc">UPC</Label>
            <Input
              id="upc"
              value={localForm.upc}
              onChange={(e) => handleChange('upc', e.target.value)}
              onBlur={handleBlur}
              placeholder="Barcode / UPC"
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
          <Label htmlFor="description">Description</Label>
          <Input
            id="description"
            value={localForm.description}
            onChange={(e) => handleChange('description', e.target.value)}
            onBlur={handleBlur}
            placeholder="Item description"
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="category">Category</Label>
          <Input
            id="category"
            value={localCategory}
            onChange={(e) => setLocalCategory(e.target.value)}
            onBlur={handleCategoryBlur}
            placeholder="Enter category name"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="price">Price A</Label>
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
            <Label htmlFor="branch">Branch</Label>
            <Input
              id="branch"
              value={localForm.branch}
              onChange={(e) => handleChange('branch', e.target.value)}
              onBlur={handleBlur}
              placeholder="Branch location"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
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
            <Label htmlFor="supplier">Supplier</Label>
            <Input
              id="supplier"
              value={localForm.supplier}
              onChange={(e) => handleChange('supplier', e.target.value)}
              onBlur={handleBlur}
              placeholder="Supplier name"
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
          <div className="flex gap-2">
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
                <ItemForm onCategoryChange={setNewCategory} />
                <div className="flex justify-end gap-3">
                  <Button variant="outline" onClick={() => setIsAddOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleAddItem}>Add Item</Button>
                </div>
              </DialogContent>
            </Dialog>
            
            {/* Import Excel Button */}
            <input 
              ref={fileInputRef} 
              type="file" 
              accept=".xlsx,.xls,.csv" 
              onChange={handleImportExcel} 
              className="hidden" 
              id="inventory-import" 
              disabled={importing}
            />
            <Button 
              variant="outline" 
              className="gap-2"
              disabled={importing}
              asChild
            >
              <label htmlFor="inventory-import" className="cursor-pointer">
                <Upload className="h-4 w-4" />
                {importing ? 'Importing...' : 'Import'}
              </label>
            </Button>
            
            <Button 
              variant="outline" 
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={async () => {
                if (!confirm('Are you sure you want to delete ALL items? This cannot be undone.')) return;
                try {
                  await deleteAllItems();
                  toast({ title: 'Success', description: 'All items deleted' });
                } catch (error) {
                  toast({ title: 'Error', description: 'Failed to delete items', variant: 'destructive' });
                }
              }}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Clear All
            </Button>
          </div>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editItem} onOpenChange={(open) => !open && setEditItem(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Item</DialogTitle>
          </DialogHeader>
          <ItemForm onCategoryChange={setNewCategory} />
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
              <TableHead>Year</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>UPC</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Price A</TableHead>
              <TableHead>Branch</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              {isAdmin && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={isAdmin ? 10 : 9} className="text-center py-12">
                  <Package className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
                  <p className="text-muted-foreground">No items found</p>
                </TableCell>
              </TableRow>
            ) : (
              <>
                {filteredItems.map((item) => (
                  <TableRow key={item.id} className="animate-fade-in">
                    <TableCell className="text-muted-foreground">{item.year || '-'}</TableCell>
                    <TableCell className="font-medium">{item.item_name}</TableCell>
                    <TableCell className="text-muted-foreground">{item.upc || item.item_code || '-'}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{item.description || '-'}</TableCell>
                    <TableCell>
                      {item.category?.name && (
                        <span className="inline-flex items-center rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground">
                          {item.category.name}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {(item.price || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{item.branch || '-'}</TableCell>
                    <TableCell className="text-right">
                      <span className={cn(
                        "font-semibold",
                        item.available_stock <= item.low_stock_threshold && "text-destructive"
                      )}>
                        {item.available_stock}
                      </span>
                      <span className="text-muted-foreground"> / {item.total_stock}</span>
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
                    ₱{filteredItems.reduce((sum, item) => sum + (item.price || 0), 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell colSpan={isAdmin ? 4 : 3}></TableCell>
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
