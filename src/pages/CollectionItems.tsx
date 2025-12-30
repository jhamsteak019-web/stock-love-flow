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
import { Upload, Plus, Trash2, Search, Image, FileSpreadsheet, Loader2, CheckCircle2, XCircle, Eye, Pencil, ChevronLeft, ChevronRight, Download, Calendar, Heart } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CollectionPhotoCell } from '@/components/collection/CollectionPhotoCell';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';

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
  is_favorite: boolean;
}

interface PreviewItem {
  item_name: string;
  upc: string | null;
  description: string | null;
  category: string | null;
  price: number;
  photo_url: string | null;
}

const CATEGORY_OPTIONS = ['MHB', 'MLP', 'MSH', 'MUM'];
const CATEGORY_OPTIONS_2 = ['CE', 'CL', 'LX', 'CX', 'XD', 'XP'];

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
  const [upcSearching, setUpcSearching] = useState(false);

  // Search for item by UPC and auto-fill fields
  const handleUpcSearch = async (upc: string) => {
    if (!upc.trim() || upc.length < 5) return;
    
    setUpcSearching(true);
    try {
      const { data, error } = await supabase
        .from('collection_items')
        .select('*')
        .ilike('description', `%UPC: ${upc}%`)
        .limit(1);
      
      if (error) throw error;
      
      if (data && data.length > 0) {
        const item = data[0];
        // Parse description to get model/size info
        const descParts = item.description?.split(' | ') || [];
        const modelInfo = descParts.length > 1 ? descParts[1] : '';
        const priceMatch = item.notes?.match(/Price: ([\d.]+)/);
        const price = priceMatch ? parseFloat(priceMatch[1]) : 0;
        
        setNewItem(prev => ({
          ...prev,
          item_name: item.item_name || '',
          description: modelInfo,
          category: item.category || '',
          price: price
        }));
        toast.success('Item found! Fields auto-filled.');
      } else {
        toast.info('No matching item found for this UPC');
      }
    } catch (error: any) {
      toast.error(`Search failed: ${error.message}`);
    } finally {
      setUpcSearching(false);
    }
  };
  const [editingItem, setEditingItem] = useState<CollectionItem | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    item_name: '',
    upc: '',
    description: '',
    category: '',
    price: 0
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedCategory2, setSelectedCategory2] = useState<string>('all');
  const itemsPerPage = 50;

  // Fetch collection items - fetch all items by paginating through results
  const { data: items = [], isLoading } = useQuery({
    queryKey: ['collection-items'],
    queryFn: async () => {
      const allItems: CollectionItem[] = [];
      const pageSize = 1000;
      let page = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('collection_items')
          .select('*')
          .order('created_at', { ascending: false })
          .range(page * pageSize, (page + 1) * pageSize - 1);
        
        if (error) throw error;
        
        if (data && data.length > 0) {
          allItems.push(...(data as CollectionItem[]));
          hasMore = data.length === pageSize;
          page++;
        } else {
          hasMore = false;
        }
      }

      return allItems;
    }
  });

  // Get available years from item names (year prefix at start of name, e.g., "2025MCLSH...")
  const availableYears = [...new Set(items.map(item => {
    const yearMatch = item.item_name.match(/^(\d{4})/);
    return yearMatch ? yearMatch[1] : '';
  }).filter(Boolean))].sort((a, b) => parseInt(b) - parseInt(a));

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

  // Toggle favorite mutation
  const toggleFavoriteMutation = useMutation({
    mutationFn: async ({ id, isFavorite }: { id: string; isFavorite: boolean }) => {
      const { error } = await supabase
        .from('collection_items')
        .update({ is_favorite: !isFavorite })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, { isFavorite }) => {
      queryClient.invalidateQueries({ queryKey: ['collection-items'] });
      queryClient.invalidateQueries({ queryKey: ['favorite-items'] });
      toast.success(isFavorite ? 'Removed from favorites' : 'Added to favorites');
    },
    onError: (error: any) => {
      toast.error(`Failed to update: ${error.message}`);
    }
  });

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

  // Confirm and import items - skip existing items
  const handleConfirmImport = async () => {
    setIsImporting(true);
    setImportStatus('importing');
    setImportProgress(0);
    setImportedCount(0);

    try {
      // First, fetch all existing item names to check for duplicates
      setImportProgress(10);
      const { data: existingItems, error: fetchError } = await supabase
        .from('collection_items')
        .select('item_name');
      
      if (fetchError) throw fetchError;

      // Create a Set of existing item names for fast lookup
      const existingNames = new Set(existingItems?.map(item => item.item_name.toLowerCase().trim()) || []);
      
      // Filter out items that already exist
      const newItems = previewItems.filter(item => 
        !existingNames.has(item.item_name.toLowerCase().trim())
      );

      const skippedCount = previewItems.length - newItems.length;
      
      if (newItems.length === 0) {
        toast.info(`All ${previewItems.length} items already exist. No new items to import.`);
        setImportStatus('done');
        setTimeout(() => {
          setIsImportDialogOpen(false);
          resetImportState();
        }, 2000);
        return;
      }

      setImportProgress(20);

      const batchSize = 500;
      const totalBatches = Math.ceil(newItems.length / batchSize);
      let successCount = 0;

      for (let i = 0; i < totalBatches; i++) {
        const batch = newItems.slice(i * batchSize, (i + 1) * batchSize);
        
        const itemsToInsert = batch.map(item => ({
          item_name: item.item_name,
          description: item.upc ? `UPC: ${item.upc} | ${item.description || ''}` : item.description,
          category: item.category,
          quantity: item.price,
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
        setImportProgress(20 + Math.round(((i + 1) / totalBatches) * 80));
      }

      setImportStatus('done');
      queryClient.invalidateQueries({ queryKey: ['collection-items'] });
      
      if (skippedCount > 0) {
        toast.success(`Imported ${successCount} new items. Skipped ${skippedCount} existing items.`);
      } else {
        toast.success(`Successfully imported ${successCount} items`);
      }
      
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

  // Helper to extract color code from item name (e.g., "2026MCXSH6527504-1343" -> "13")
  const extractColorCode = (itemName: string): string => {
    // Pattern: the 2 digits after the dash before the size
    const match = itemName.match(/-(\d{2})\d{2}$/);
    return match ? match[1] : '';
  };

  // Filter items - when searching, group by same color code
  const filteredItems = (() => {
    let result = items;

    // Filter by year prefix in item name (e.g., "2025MCLSH..." starts with "2025")
    if (selectedYear !== 'all') {
      result = result.filter(item => item.item_name.startsWith(selectedYear));
    }

    // Filter by category (first dropdown)
    if (selectedCategory !== 'all') {
      result = result.filter(item => item.category === selectedCategory);
    }

    // Filter by category 2 (second dropdown)
    if (selectedCategory2 !== 'all') {
      result = result.filter(item => item.category === selectedCategory2);
    }

    // Apply search filter
    if (!searchTerm.trim()) return result;

    const search = searchTerm.toLowerCase();
    
    // First, find all matching items
    const matchingItems = result.filter(item =>
      item.item_name.toLowerCase().includes(search) ||
      item.category?.toLowerCase().includes(search) ||
      item.description?.toLowerCase().includes(search)
    );

    // If we have matches, filter to only show items with the same color code as the first match
    if (matchingItems.length > 0) {
      const firstItemColorCode = extractColorCode(matchingItems[0].item_name);
      
      // If we found a color code, filter to only same color items
      if (firstItemColorCode) {
        return matchingItems.filter(item => extractColorCode(item.item_name) === firstItemColorCode);
      }
    }

    return matchingItems;
  })();

  // Sort items: items with photos first, then by created_at
  const sortedItems = [...filteredItems].sort((a, b) => {
    const aHasPhoto = a.photo_url ? 1 : 0;
    const bHasPhoto = b.photo_url ? 1 : 0;
    if (bHasPhoto !== aHasPhoto) {
      return bHasPhoto - aHasPhoto; // Items with photos first
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime(); // Then by date
  });

  // Pagination
  const totalPages = Math.ceil(sortedItems.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedItems = sortedItems.slice(startIndex, endIndex);

  // Reset to page 1 when search/filters change
  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  const handleYearChange = (value: string) => {
    setSelectedYear(value);
    setCurrentPage(1);
  };

  const handleCategoryChange = (value: string) => {
    setSelectedCategory(value);
    setCurrentPage(1);
  };

  const handleCategory2Change = (value: string) => {
    setSelectedCategory2(value);
    setCurrentPage(1);
  };

  // Export collection items to Excel with embedded images
  const handleExport = async () => {
    if (filteredItems.length === 0) {
      toast.error('No items to export');
      return;
    }

    toast.info('Preparing export with images...');

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Collection Items');

    // Define columns - Image first
    worksheet.columns = [
      { header: 'Image', key: 'image', width: 20 },
      { header: 'Name', key: 'name', width: 30 },
      { header: 'UPC', key: 'upc', width: 15 },
      { header: 'Description', key: 'description', width: 40 },
      { header: 'Category', key: 'category', width: 12 },
      { header: 'Price', key: 'price', width: 12 },
    ];

    // Style header row
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };

    // Add data rows with images
    for (let i = 0; i < filteredItems.length; i++) {
      const item = filteredItems[i];
      const descParts = item.description?.split(' | ') || [];
      const upc = descParts[0]?.startsWith('UPC: ') ? descParts[0].replace('UPC: ', '') : '';
      const description = upc ? descParts.slice(1).join(' | ') : item.description;
      const priceMatch = item.notes?.match(/Price: ([\d.]+)/);
      const price = priceMatch ? parseFloat(priceMatch[1]) : (item.quantity || 0);

      const rowIndex = i + 2; // Row 1 is header
      const row = worksheet.addRow({
        image: '',
        name: item.item_name,
        upc: upc || '',
        description: description || '',
        category: item.category || '',
        price: price,
      });

      // Set row height for images
      row.height = 60;

      // Add image if available - now in column 0 (first column)
      if (item.photo_url) {
        try {
          const response = await fetch(item.photo_url);
          const blob = await response.blob();
          const arrayBuffer = await blob.arrayBuffer();
          const base64 = btoa(
            new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
          );
          
          const extension = item.photo_url.split('.').pop()?.toLowerCase() || 'png';
          const imageType = extension === 'jpg' ? 'jpeg' : extension;
          
          const imageId = workbook.addImage({
            base64: base64,
            extension: imageType as 'png' | 'jpeg' | 'gif',
          });

          worksheet.addImage(imageId, {
            tl: { col: 0, row: rowIndex - 1 },
            ext: { width: 80, height: 55 }
          });
        } catch (error) {
          console.error('Failed to load image:', item.photo_url, error);
        }
      }
    }

    // Generate and download file
    const date = new Date().toISOString().split('T')[0];
    const filename = `collection_items_${date}.xlsx`;

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    window.URL.revokeObjectURL(url);

    toast.success(`Exported ${filteredItems.length} items with images to ${filename}`);
  };

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
          <Button 
            variant="outline" 
            onClick={handleExport}
            disabled={filteredItems.length === 0}
          >
            <Download className="h-4 w-4 mr-2" />
            Export Excel
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
                  <Label htmlFor="upc">Search by UPC</Label>
                  <div className="flex gap-2">
                    <Input
                      id="upc"
                      value={newItem.upc}
                      onChange={(e) => setNewItem({ ...newItem, upc: e.target.value })}
                      placeholder="Enter UPC to search..."
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleUpcSearch(newItem.upc);
                        }
                      }}
                    />
                    <Button 
                      type="button"
                      variant="secondary"
                      onClick={() => handleUpcSearch(newItem.upc)}
                      disabled={upcSearching || !newItem.upc.trim()}
                    >
                      {upcSearching ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Search className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Press Enter or click search to auto-fill Name, Size & Category
                  </p>
                </div>
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
                  <Select
                    value={newItem.category}
                    onValueChange={(value) => setNewItem({ ...newItem, category: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORY_OPTIONS.map(cat => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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

      {/* Search and Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative sm:w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search items..."
                value={searchTerm}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={selectedYear} onValueChange={handleYearChange}>
              <SelectTrigger className="w-full sm:w-[100px]">
                <Calendar className="h-4 w-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Years</SelectItem>
                {availableYears.map(year => (
                  <SelectItem key={year} value={year}>{year}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedCategory} onValueChange={handleCategoryChange}>
              <SelectTrigger className="w-full sm:w-[100px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {CATEGORY_OPTIONS.map(cat => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedCategory2} onValueChange={handleCategory2Change}>
              <SelectTrigger className="w-full sm:w-[100px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {CATEGORY_OPTIONS_2.map(cat => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Items Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Collection Items ({filteredItems.length.toLocaleString()})</CardTitle>
          {totalPages > 1 && (
            <div className="text-sm text-muted-foreground">
              Showing {startIndex + 1}-{Math.min(endIndex, filteredItems.length)} of {filteredItems.length.toLocaleString()}
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
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
            <>
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
                    {paginatedItems.map((item, index) => {
                      // Extract UPC and description from stored description
                      const descParts = item.description?.split(' | ') || [];
                      const upc = descParts[0]?.startsWith('UPC: ') ? descParts[0].replace('UPC: ', '') : '';
                      const description = upc ? descParts.slice(1).join(' | ') : item.description;
                      // Extract price from notes or use quantity
                      const priceMatch = item.notes?.match(/Price: ([\d.]+)/);
                      const price = priceMatch ? parseFloat(priceMatch[1]) : (item.quantity || 0);
                      
                      return (
                        <TableRow key={item.id}>
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
                                onClick={() => toggleFavoriteMutation.mutate({ id: item.id, isFavorite: item.is_favorite })}
                                disabled={toggleFavoriteMutation.isPending}
                                className="h-8 w-8"
                                title={item.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
                              >
                                <Heart className={`h-4 w-4 ${item.is_favorite ? 'text-red-500 fill-red-500' : 'text-muted-foreground'}`} />
                              </Button>
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

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-1 pt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="gap-1"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum: number;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }
                      
                      return (
                        <Button
                          key={pageNum}
                          variant={currentPage === pageNum ? "default" : "outline"}
                          size="sm"
                          onClick={() => setCurrentPage(pageNum)}
                          className="w-9 h-9 p-0"
                        >
                          {pageNum}
                        </Button>
                      );
                    })}
                  </div>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="gap-1"
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </>
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
                <Select
                  value={editForm.category}
                  onValueChange={(value) => setEditForm({ ...editForm, category: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
