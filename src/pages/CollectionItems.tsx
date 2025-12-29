import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { Upload, Plus, Trash2, Search, Image, FileSpreadsheet, Loader2, CheckCircle2, XCircle, Eye, Pencil } from 'lucide-react';
import { CollectionPhotoCell } from '@/components/collection/CollectionPhotoCell';
import * as XLSX from 'xlsx';

interface CollectionItem {
  id: string;
  item_name: string;
  description: string | null;
  category: string | null;
  quantity: number | null;
  photo_url: string | null;
  status: string | null;
  notes: string | null;
  created_at: string;
}

interface PreviewItem {
  item_name: string;
  upc: string | null;
  description: string | null;
  category: string | null;
  price: number;
  photo_url: string | null;
}

const CollectionItems = () => {
  const { user, userRole } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importStatus, setImportStatus] = useState<'idle' | 'reading' | 'previewing' | 'importing' | 'done' | 'error'>('idle');
  const [previewItems, setPreviewItems] = useState<PreviewItem[]>([]);
  const [importedCount, setImportedCount] = useState(0);
  const [newItem, setNewItem] = useState({
    item_name: '',
    upc: '',
    description: '',
    category: '',
    price: 0
  });
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null);
  const [editingItem, setEditingItem] = useState<CollectionItem | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    item_name: '',
    upc: '',
    description: '',
    category: '',
    price: 0
  });

  // Fetch collection items
  const { data: items = [], isLoading } = useQuery({
    queryKey: ['collection-items'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('collection_items')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as CollectionItem[];
    }
  });

  // Add single item
  const addItemMutation = useMutation({
    mutationFn: async (item: { item_name: string; description?: string; category?: string; quantity?: number; notes?: string; photo_url?: string }) => {
      const { error } = await supabase
        .from('collection_items')
        .insert({
          ...item,
          created_by: user?.id
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collection-items'] });
      toast.success('Item added successfully');
      setIsAddDialogOpen(false);
      setNewItem({ item_name: '', upc: '', description: '', category: '', price: 0 });
      setSelectedPhoto(null);
    },
    onError: (error: any) => {
      toast.error(`Failed to add item: ${error.message}`);
    }
  });

  // Update item mutation
  const updateItemMutation = useMutation({
    mutationFn: async (item: { id: string; item_name: string; description?: string; category?: string; quantity?: number; notes?: string }) => {
      const { error } = await supabase
        .from('collection_items')
        .update({
          item_name: item.item_name,
          description: item.description,
          category: item.category,
          quantity: item.quantity,
          notes: item.notes,
          updated_at: new Date().toISOString()
        })
        .eq('id', item.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collection-items'] });
      toast.success('Item updated successfully');
      setIsEditDialogOpen(false);
      setEditingItem(null);
    },
    onError: (error: any) => {
      toast.error(`Failed to update item: ${error.message}`);
    }
  });

  // Open edit dialog
  const handleEditItem = (item: CollectionItem) => {
    const descParts = item.description?.split(' | ') || [];
    const upc = descParts[0]?.startsWith('UPC: ') ? descParts[0].replace('UPC: ', '') : '';
    const description = upc ? descParts.slice(1).join(' | ') : item.description;
    const priceMatch = item.notes?.match(/Price: ([\d.]+)/);
    const price = priceMatch ? parseFloat(priceMatch[1]) : (item.quantity || 0);

    setEditingItem(item);
    setEditForm({
      item_name: item.item_name,
      upc: upc || '',
      description: description || '',
      category: item.category || '',
      price: price
    });
    setIsEditDialogOpen(true);
  };

  // Submit edit
  const handleUpdateItem = () => {
    if (!editingItem || !editForm.item_name.trim()) {
      toast.error('Item name is required');
      return;
    }

    const combinedDescription = editForm.upc 
      ? `UPC: ${editForm.upc}${editForm.description ? ' | ' + editForm.description : ''}`
      : editForm.description;

    updateItemMutation.mutate({
      id: editingItem.id,
      item_name: editForm.item_name.trim(),
      description: combinedDescription || undefined,
      category: editForm.category || undefined,
      quantity: editForm.price,
      notes: `Price: ${editForm.price}`
    });
  };

  // Delete item
  const deleteItemMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('collection_items')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collection-items'] });
      toast.success('Item deleted successfully');
    },
    onError: (error: any) => {
      toast.error(`Failed to delete item: ${error.message}`);
    }
  });

  // Clear all items
  const clearAllMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('collection_items')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all rows
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collection-items'] });
      toast.success('All items cleared successfully');
    },
    onError: (error: any) => {
      toast.error(`Failed to clear items: ${error.message}`);
    }
  });

  // Upload photo and add item
  const handleAddItem = async () => {
    if (!newItem.item_name.trim()) {
      toast.error('Item name is required');
      return;
    }

    let photoUrl = '';
    
    if (selectedPhoto) {
      const fileExt = selectedPhoto.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('collection-photos')
        .upload(fileName, selectedPhoto);
      
      if (uploadError) {
        toast.error(`Failed to upload photo: ${uploadError.message}`);
        return;
      }
      
      const { data: urlData } = supabase.storage
        .from('collection-photos')
        .getPublicUrl(fileName);
      
      photoUrl = urlData.publicUrl;
    }

    addItemMutation.mutate({
      item_name: newItem.item_name,
      description: newItem.upc ? `UPC: ${newItem.upc} | ${newItem.description}` : newItem.description,
      category: newItem.category,
      quantity: newItem.price, // Using quantity field for price
      notes: `Price: ${newItem.price}`,
      photo_url: photoUrl || undefined
    });
  };

  // Read Excel file and show preview
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportStatus('reading');
    setImportProgress(10);
    setIsImportDialogOpen(true);

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          setImportProgress(30);
          const data = new Uint8Array(event.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet);

          setImportProgress(50);

          if (jsonData.length === 0) {
            toast.error('No data found in the file');
            setImportStatus('error');
            return;
          }

          // Map Excel columns to preview items
          const mappedItems: PreviewItem[] = jsonData.map((row: any) => ({
            item_name: row['Name'] || row['name'] || row['Item Name'] || row['item_name'] || 'Unknown Item',
            upc: row['UPC'] || row['upc'] || row['Upc'] || null,
            description: row['Description'] || row['description'] || null,
            category: row['Category'] || row['category'] || null,
            price: parseFloat(row['Price'] || row['price'] || row['PRICE'] || 0) || 0,
            photo_url: row['Photo URL'] || row['photo_url'] || row['Photo'] || row['photo'] || null,
          }));

          setPreviewItems(mappedItems);
          setImportProgress(100);
          setImportStatus('previewing');
        } catch (err: any) {
          toast.error(`Failed to read file: ${err.message}`);
          setImportStatus('error');
        }
      };
      reader.readAsArrayBuffer(file);
    } catch (error: any) {
      toast.error(`Failed to read file: ${error.message}`);
      setImportStatus('error');
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Confirm and import items
  const handleConfirmImport = async () => {
    setIsImporting(true);
    setImportStatus('importing');
    setImportProgress(0);
    setImportedCount(0);

    const batchSize = 10;
    const totalBatches = Math.ceil(previewItems.length / batchSize);
    let successCount = 0;

    try {
      for (let i = 0; i < totalBatches; i++) {
        const batch = previewItems.slice(i * batchSize, (i + 1) * batchSize);
        
        const itemsToInsert = batch.map(item => ({
          item_name: item.item_name,
          description: item.upc ? `UPC: ${item.upc} | ${item.description || ''}` : item.description,
          category: item.category,
          quantity: item.price, // Store price in quantity
          notes: `Price: ${item.price}`,
          photo_url: item.photo_url,
          status: 'active',
          created_by: user?.id
        }));

        const { error } = await supabase
          .from('collection_items')
          .insert(itemsToInsert);

        if (error) throw error;

        successCount += batch.length;
        setImportedCount(successCount);
        setImportProgress(Math.round(((i + 1) / totalBatches) * 100));
        
        // Small delay for smooth animation
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      setImportStatus('done');
      queryClient.invalidateQueries({ queryKey: ['collection-items'] });
      toast.success(`Successfully imported ${successCount} items`);
      
      // Auto close after success
      setTimeout(() => {
        setIsImportDialogOpen(false);
        resetImportState();
      }, 2000);
    } catch (err: any) {
      toast.error(`Import failed: ${err.message}`);
      setImportStatus('error');
    } finally {
      setIsImporting(false);
    }
  };

  const resetImportState = () => {
    setImportStatus('idle');
    setImportProgress(0);
    setPreviewItems([]);
    setImportedCount(0);
  };

  const handleCloseImportDialog = () => {
    setIsImportDialogOpen(false);
    resetImportState();
  };

  // Filter items
  const filteredItems = items.filter(item =>
    item.item_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.category?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const isAdmin = userRole === 'admin';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Collection Items</h1>
          <p className="text-muted-foreground">Manage your collection items with photos</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isAdmin && items.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={clearAllMutation.isPending}>
                  {clearAllMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4 mr-2" />
                  )}
                  Clear All
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear All Collection Items?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete all {items.length} collection items. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => clearAllMutation.mutate()}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Yes, Clear All
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept=".xlsx,.xls,.csv"
            className="hidden"
          />
          <Button 
            variant="outline" 
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
          >
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Import Excel
          </Button>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Item
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Add Collection Item</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="item_name">Name *</Label>
                  <Input
                    id="item_name"
                    value={newItem.item_name}
                    onChange={(e) => setNewItem({ ...newItem, item_name: e.target.value })}
                    placeholder="e.g. 2025MCEHB5500001-01"
                  />
                </div>
                <div>
                  <Label htmlFor="upc">UPC</Label>
                  <Input
                    id="upc"
                    value={newItem.upc}
                    onChange={(e) => setNewItem({ ...newItem, upc: e.target.value })}
                    placeholder="e.g. 155000010100"
                  />
                </div>
                <div>
                  <Label htmlFor="description">Description</Label>
                  <Input
                    id="description"
                    value={newItem.description}
                    onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                    placeholder="e.g. MCEHB5500001FB4C"
                  />
                </div>
                <div>
                  <Label htmlFor="category">Category</Label>
                  <Input
                    id="category"
                    value={newItem.category}
                    onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
                    placeholder="e.g. MHB"
                  />
                </div>
                <div>
                  <Label htmlFor="price">Price</Label>
                  <Input
                    id="price"
                    type="number"
                    step="0.01"
                    value={newItem.price}
                    onChange={(e) => setNewItem({ ...newItem, price: parseFloat(e.target.value) || 0 })}
                    placeholder="e.g. 3000.00"
                  />
                </div>
                <div>
                  <Label>Photo</Label>
                  <input
                    type="file"
                    ref={photoInputRef}
                    onChange={(e) => setSelectedPhoto(e.target.files?.[0] || null)}
                    accept="image/*"
                    className="hidden"
                  />
                  <Button 
                    type="button" 
                    variant="outline" 
                    className="w-full"
                    onClick={() => photoInputRef.current?.click()}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {selectedPhoto ? selectedPhoto.name : 'Upload Photo'}
                  </Button>
                </div>
                <Button 
                  onClick={handleAddItem} 
                  className="w-full"
                  disabled={addItemMutation.isPending}
                >
                  {addItemMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : null}
                  Add Item
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Import Preview Dialog */}
      <Dialog open={isImportDialogOpen} onOpenChange={handleCloseImportDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              Import Collection Items
            </DialogTitle>
          </DialogHeader>

          {/* Reading State */}
          {importStatus === 'reading' && (
            <div className="py-8 space-y-4">
              <div className="flex items-center justify-center">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
              </div>
              <p className="text-center text-muted-foreground">Reading file...</p>
              <Progress value={importProgress} className="h-2" />
            </div>
          )}

          {/* Preview State */}
          {importStatus === 'previewing' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Eye className="h-5 w-5 text-primary" />
                  <span className="font-medium">Preview ({previewItems.length.toLocaleString()} items)</span>
                </div>
                <Badge variant="secondary">{previewItems.length.toLocaleString()} items ready</Badge>
              </div>
              
              {/* Show only first 50 items for performance */}
              <ScrollArea className="h-[300px] border rounded-lg">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead className="w-[50px]">#</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>UPC</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Price</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewItems.slice(0, 50).map((item, index) => (
                      <TableRow key={index}>
                        <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                        <TableCell className="font-medium">{item.item_name}</TableCell>
                        <TableCell className="font-mono text-sm">{item.upc || '-'}</TableCell>
                        <TableCell className="max-w-[150px] truncate">{item.description || '-'}</TableCell>
                        <TableCell>
                          {item.category ? (
                            <Badge variant="outline">{item.category}</Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="font-medium">{item.price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {previewItems.length > 50 && (
                  <div className="p-3 text-center text-sm text-muted-foreground border-t bg-muted/30">
                    Showing first 50 of {previewItems.length.toLocaleString()} items...
                  </div>
                )}
              </ScrollArea>

              <DialogFooter>
                <Button variant="outline" onClick={handleCloseImportDialog}>
                  Cancel
                </Button>
                <Button onClick={handleConfirmImport} disabled={isImporting}>
                  {isImporting ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4 mr-2" />
                  )}
                  Import {previewItems.length.toLocaleString()} Items
                </Button>
              </DialogFooter>
            </div>
          )}

          {/* Importing State */}
          {importStatus === 'importing' && (
            <div className="py-8 space-y-4">
              <div className="flex items-center justify-center">
                <div className="relative">
                  <Loader2 className="h-16 w-16 animate-spin text-primary" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-sm font-bold">{importProgress}%</span>
                  </div>
                </div>
              </div>
              <p className="text-center text-muted-foreground">
                Importing items... ({importedCount} of {previewItems.length})
              </p>
              <Progress value={importProgress} className="h-3 transition-all duration-300" />
            </div>
          )}

          {/* Done State */}
          {importStatus === 'done' && (
            <div className="py-8 space-y-4 animate-in zoom-in-50 duration-500">
              <div className="flex items-center justify-center">
                <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircle2 className="h-10 w-10 text-green-600" />
                </div>
              </div>
              <p className="text-center text-lg font-medium text-green-600">
                Successfully imported {importedCount} items!
              </p>
              <Progress value={100} className="h-3 bg-green-100" />
            </div>
          )}

          {/* Error State */}
          {importStatus === 'error' && (
            <div className="py-8 space-y-4">
              <div className="flex items-center justify-center">
                <div className="h-16 w-16 rounded-full bg-red-100 flex items-center justify-center">
                  <XCircle className="h-10 w-10 text-red-600" />
                </div>
              </div>
              <p className="text-center text-lg font-medium text-red-600">
                Import failed
              </p>
              <DialogFooter className="justify-center">
                <Button variant="outline" onClick={handleCloseImportDialog}>
                  Close
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Search */}
      <Card>
        <CardContent className="pt-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search items..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Items Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Collection Items ({filteredItems.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Image className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No collection items found</p>
              <p className="text-sm">Import items from Excel or add them manually</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[70px]">Photo</TableHead>
                    <TableHead className="min-w-[150px]">Name</TableHead>
                    <TableHead className="w-[120px]">UPC</TableHead>
                    <TableHead className="min-w-[180px]">Description</TableHead>
                    <TableHead className="w-[100px]">Category</TableHead>
                    <TableHead className="w-[100px] text-right">Price</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.map((item, index) => {
                    // Extract UPC and description from stored description
                    const descParts = item.description?.split(' | ') || [];
                    const upc = descParts[0]?.startsWith('UPC: ') ? descParts[0].replace('UPC: ', '') : '';
                    const description = upc ? descParts.slice(1).join(' | ') : item.description;
                    // Extract price from notes or use quantity
                    const priceMatch = item.notes?.match(/Price: ([\d.]+)/);
                    const price = priceMatch ? parseFloat(priceMatch[1]) : (item.quantity || 0);
                    
                    return (
                      <TableRow 
                        key={item.id} 
                        className="animate-in fade-in-50 duration-300"
                        style={{ animationDelay: `${index * 30}ms` }}
                      >
                        <TableCell className="p-2">
                          <CollectionPhotoCell
                            itemId={item.id}
                            photoUrl={item.photo_url}
                            itemName={item.item_name}
                            onPhotoUpdate={() => queryClient.invalidateQueries({ queryKey: ['collection-items'] })}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{item.item_name}</TableCell>
                        <TableCell className="font-mono text-sm text-muted-foreground">{upc || '-'}</TableCell>
                        <TableCell className="max-w-[200px] truncate text-muted-foreground">{description || '-'}</TableCell>
                        <TableCell>
                          {item.category ? (
                            <Badge variant="secondary" className="text-xs">{item.category}</Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="font-medium text-right">{price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEditItem(item)}
                              className="h-8 w-8"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            {isAdmin && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => deleteItemMutation.mutate(item.id)}
                                disabled={deleteItemMutation.isPending}
                                className="h-8 w-8"
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Item Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Item</DialogTitle>
            <DialogDescription>
              Update the item details below
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name *</Label>
              <Input
                id="edit-name"
                value={editForm.item_name}
                onChange={(e) => setEditForm({ ...editForm, item_name: e.target.value })}
                placeholder="Item name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-upc">UPC</Label>
              <Input
                id="edit-upc"
                value={editForm.upc}
                onChange={(e) => setEditForm({ ...editForm, upc: e.target.value })}
                placeholder="UPC code"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Input
                id="edit-description"
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                placeholder="Item description"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-category">Category</Label>
                <Input
                  id="edit-category"
                  value={editForm.category}
                  onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                  placeholder="Category"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-price">Price</Label>
                <Input
                  id="edit-price"
                  type="number"
                  value={editForm.price}
                  onChange={(e) => setEditForm({ ...editForm, price: parseFloat(e.target.value) || 0 })}
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleUpdateItem}
              disabled={updateItemMutation.isPending}
            >
              {updateItemMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CollectionItems;
