import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Upload, Plus, Trash2, Search, Image, FileSpreadsheet, Loader2 } from 'lucide-react';
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

const CollectionItems = () => {
  const { user, userRole } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [newItem, setNewItem] = useState({
    item_name: '',
    description: '',
    category: '',
    quantity: 0,
    notes: ''
  });
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null);

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
    mutationFn: async (item: typeof newItem & { photo_url?: string }) => {
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
      setNewItem({ item_name: '', description: '', category: '', quantity: 0, notes: '' });
      setSelectedPhoto(null);
    },
    onError: (error: any) => {
      toast.error(`Failed to add item: ${error.message}`);
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
      ...newItem,
      photo_url: photoUrl || undefined
    });
  };

  // Import from Excel
  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const data = new Uint8Array(event.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet);

          if (jsonData.length === 0) {
            toast.error('No data found in the file');
            setIsImporting(false);
            return;
          }

          // Map Excel columns to database columns
          const itemsToInsert = jsonData.map((row: any) => ({
            item_name: row['Item Name'] || row['item_name'] || row['Name'] || row['name'] || 'Unknown Item',
            description: row['Description'] || row['description'] || null,
            category: row['Category'] || row['category'] || null,
            quantity: parseInt(row['Quantity'] || row['quantity'] || row['Qty'] || row['qty'] || 0) || 0,
            photo_url: row['Photo URL'] || row['photo_url'] || row['Photo'] || row['photo'] || null,
            notes: row['Notes'] || row['notes'] || row['Remarks'] || row['remarks'] || null,
            status: 'active',
            created_by: user?.id
          }));

          const { error } = await supabase
            .from('collection_items')
            .insert(itemsToInsert);

          if (error) throw error;

          queryClient.invalidateQueries({ queryKey: ['collection-items'] });
          toast.success(`Successfully imported ${itemsToInsert.length} items`);
        } catch (err: any) {
          toast.error(`Import failed: ${err.message}`);
        } finally {
          setIsImporting(false);
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
        }
      };
      reader.readAsArrayBuffer(file);
    } catch (error: any) {
      toast.error(`Failed to read file: ${error.message}`);
      setIsImporting(false);
    }
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
        <div className="flex gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileImport}
            accept=".xlsx,.xls,.csv"
            className="hidden"
          />
          <Button 
            variant="outline" 
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
          >
            {isImporting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <FileSpreadsheet className="h-4 w-4 mr-2" />
            )}
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
                  <Label htmlFor="item_name">Item Name *</Label>
                  <Input
                    id="item_name"
                    value={newItem.item_name}
                    onChange={(e) => setNewItem({ ...newItem, item_name: e.target.value })}
                    placeholder="Enter item name"
                  />
                </div>
                <div>
                  <Label htmlFor="category">Category</Label>
                  <Input
                    id="category"
                    value={newItem.category}
                    onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
                    placeholder="Enter category"
                  />
                </div>
                <div>
                  <Label htmlFor="quantity">Quantity</Label>
                  <Input
                    id="quantity"
                    type="number"
                    value={newItem.quantity}
                    onChange={(e) => setNewItem({ ...newItem, quantity: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <Label htmlFor="description">Description</Label>
                  <Input
                    id="description"
                    value={newItem.description}
                    onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                    placeholder="Enter description"
                  />
                </div>
                <div>
                  <Label htmlFor="notes">Notes</Label>
                  <Input
                    id="notes"
                    value={newItem.notes}
                    onChange={(e) => setNewItem({ ...newItem, notes: e.target.value })}
                    placeholder="Enter notes"
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
                    <TableHead>Photo</TableHead>
                    <TableHead>Item Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Status</TableHead>
                    {isAdmin && <TableHead>Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        {item.photo_url ? (
                          <img 
                            src={item.photo_url} 
                            alt={item.item_name}
                            className="w-12 h-12 object-cover rounded-lg"
                          />
                        ) : (
                          <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                            <Image className="h-5 w-5 text-muted-foreground" />
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{item.item_name}</TableCell>
                      <TableCell>
                        {item.category && (
                          <Badge variant="secondary">{item.category}</Badge>
                        )}
                      </TableCell>
                      <TableCell>{item.quantity || 0}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{item.description || '-'}</TableCell>
                      <TableCell>
                        <Badge variant={item.status === 'active' ? 'default' : 'secondary'}>
                          {item.status || 'active'}
                        </Badge>
                      </TableCell>
                      {isAdmin && (
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteItemMutation.mutate(item.id)}
                            disabled={deleteItemMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CollectionItems;
