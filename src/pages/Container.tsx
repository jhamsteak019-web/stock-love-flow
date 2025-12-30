import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Plus, Search, Pencil, Trash2, Container as ContainerIcon, Camera, RefreshCw } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';

interface ContainerItem {
  id: string;
  date: string;
  out_factory: string | null;
  photo_url: string | null;
  date_receive_factory: string | null;
  receive_photo_url: string | null;
  category: string | null;
  notes: string | null;
  created_at: string;
}

const CATEGORY_OPTIONS = ['MHB', 'MLP', 'MSH', 'MUM'];

const Container = () => {
  const { user, userRole } = useAuth();
  const queryClient = useQueryClient();
  const photoInputRef = useRef<HTMLInputElement>(null);
  const receivePhotoInputRef = useRef<HTMLInputElement>(null);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ContainerItem | null>(null);
  const [uploadingPhotoId, setUploadingPhotoId] = useState<string | null>(null);
  const [uploadingReceivePhotoId, setUploadingReceivePhotoId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    out_factory: '',
    date_receive_factory: '',
    category: '',
    notes: ''
  });

  const canEdit = userRole === 'admin' || userRole === 'staff';
  const canDelete = userRole === 'admin';

  // Fetch containers
  const { data: containers = [], isLoading, refetch } = useQuery({
    queryKey: ['containers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('containers')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as ContainerItem[];
    }
  });

  // Add container
  const addMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase
        .from('containers')
        .insert({
          date: data.date,
          out_factory: data.out_factory || null,
          date_receive_factory: data.date_receive_factory || null,
          category: data.category || null,
          notes: data.notes || null,
          created_by: user?.id
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['containers'] });
      toast.success('Container added successfully');
      setIsAddDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast.error(`Failed to add: ${error.message}`);
    }
  });

  // Update container
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ContainerItem> }) => {
      const { error } = await supabase
        .from('containers')
        .update(data)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['containers'] });
      toast.success('Container updated successfully');
      setIsEditDialogOpen(false);
      setEditingItem(null);
    },
    onError: (error: any) => {
      toast.error(`Failed to update: ${error.message}`);
    }
  });

  // Delete container
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('containers')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['containers'] });
      toast.success('Container deleted successfully');
    },
    onError: (error: any) => {
      toast.error(`Failed to delete: ${error.message}`);
    }
  });

  // Upload photo
  const uploadPhoto = async (file: File, containerId: string, type: 'photo' | 'receive') => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${containerId}-${type}-${Date.now()}.${fileExt}`;
    
    const { error: uploadError } = await supabase.storage
      .from('container-photos')
      .upload(fileName, file);
    
    if (uploadError) throw uploadError;
    
    const { data: urlData } = supabase.storage
      .from('container-photos')
      .getPublicUrl(fileName);
    
    return urlData.publicUrl;
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>, containerId: string, type: 'photo' | 'receive') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (type === 'photo') {
      setUploadingPhotoId(containerId);
    } else {
      setUploadingReceivePhotoId(containerId);
    }

    try {
      const url = await uploadPhoto(file, containerId, type);
      await updateMutation.mutateAsync({
        id: containerId,
        data: type === 'photo' ? { photo_url: url } : { receive_photo_url: url }
      });
      toast.success('Photo uploaded successfully');
    } catch (error: any) {
      toast.error(`Failed to upload: ${error.message}`);
    } finally {
      setUploadingPhotoId(null);
      setUploadingReceivePhotoId(null);
    }
  };

  const resetForm = () => {
    setFormData({
      date: format(new Date(), 'yyyy-MM-dd'),
      out_factory: '',
      date_receive_factory: '',
      category: '',
      notes: ''
    });
  };

  const handleEdit = (item: ContainerItem) => {
    setEditingItem(item);
    setFormData({
      date: item.date,
      out_factory: item.out_factory || '',
      date_receive_factory: item.date_receive_factory || '',
      category: item.category || '',
      notes: item.notes || ''
    });
    setIsEditDialogOpen(true);
  };

  const handleSubmitAdd = () => {
    if (!formData.date) {
      toast.error('Date is required');
      return;
    }
    addMutation.mutate(formData);
  };

  const handleSubmitEdit = () => {
    if (!editingItem) return;
    updateMutation.mutate({
      id: editingItem.id,
      data: {
        date: formData.date,
        out_factory: formData.out_factory || null,
        date_receive_factory: formData.date_receive_factory || null,
        category: formData.category || null,
        notes: formData.notes || null
      }
    });
  };

  // Filter containers
  const filteredContainers = containers.filter(item => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      item.out_factory?.toLowerCase().includes(search) ||
      item.category?.toLowerCase().includes(search) ||
      item.notes?.toLowerCase().includes(search)
    );
  });

  return (
    <div className="space-y-6 p-4 md:p-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="flex items-center gap-2">
            <ContainerIcon className="h-5 w-5" />
            Container ({filteredContainers.length})
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            {canEdit && (
              <Button onClick={() => setIsAddDialogOpen(true)} size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {/* Search */}
          <div className="flex items-center gap-4 mb-6">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredContainers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <ContainerIcon className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">No containers yet</h3>
              <p className="text-muted-foreground mb-4">Get started by adding your first container.</p>
              {canEdit && (
                <Button onClick={() => setIsAddDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Container
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date Out Factory</TableHead>
                    <TableHead>Photo</TableHead>
                    <TableHead>Date Receive Warehouse</TableHead>
                    <TableHead>Delivery Days</TableHead>
                    <TableHead>Upload Photo</TableHead>
                    <TableHead>Category Manual</TableHead>
                    <TableHead>Notes</TableHead>
                    {canEdit && <TableHead>Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredContainers.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.out_factory || ''}</TableCell>
                      <TableCell>
                        <label className="cursor-pointer relative group">
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => handlePhotoUpload(e, item.id, 'photo')}
                            disabled={uploadingPhotoId === item.id || !canEdit}
                          />
                          {item.photo_url ? (
                            <div className="relative">
                              <img 
                                src={item.photo_url} 
                                alt="Container" 
                                className="h-12 w-12 object-cover rounded hover:opacity-80"
                              />
                              {canEdit && (
                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 rounded flex items-center justify-center transition-opacity">
                                  {uploadingPhotoId === item.id ? (
                                    <RefreshCw className="h-4 w-4 animate-spin text-white" />
                                  ) : (
                                    <Camera className="h-4 w-4 text-white" />
                                  )}
                                </div>
                              )}
                            </div>
                          ) : canEdit ? (
                            <div className="h-12 w-12 border-2 border-dashed border-muted-foreground/30 rounded flex items-center justify-center hover:border-primary">
                              {uploadingPhotoId === item.id ? (
                                <RefreshCw className="h-4 w-4 animate-spin" />
                              ) : (
                                <Camera className="h-4 w-4 text-muted-foreground" />
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </label>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {item.date_receive_factory 
                          ? format(new Date(item.date_receive_factory), 'MMM dd, yyyy')
                          : '-'
                        }
                      </TableCell>
                      <TableCell className="text-center">
                        {item.date && item.date_receive_factory 
                          ? differenceInDays(new Date(item.date_receive_factory), new Date(item.date))
                          : '-'
                        }
                      </TableCell>
                      <TableCell>
                        <label className="cursor-pointer relative group">
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => handlePhotoUpload(e, item.id, 'receive')}
                            disabled={uploadingReceivePhotoId === item.id || !canEdit}
                          />
                          {item.receive_photo_url ? (
                            <div className="relative">
                              <img 
                                src={item.receive_photo_url} 
                                alt="Receive" 
                                className="h-12 w-12 object-cover rounded hover:opacity-80"
                              />
                              {canEdit && (
                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 rounded flex items-center justify-center transition-opacity">
                                  {uploadingReceivePhotoId === item.id ? (
                                    <RefreshCw className="h-4 w-4 animate-spin text-white" />
                                  ) : (
                                    <Camera className="h-4 w-4 text-white" />
                                  )}
                                </div>
                              )}
                            </div>
                          ) : canEdit ? (
                            <div className="h-12 w-12 border-2 border-dashed border-muted-foreground/30 rounded flex items-center justify-center hover:border-primary">
                              {uploadingReceivePhotoId === item.id ? (
                                <RefreshCw className="h-4 w-4 animate-spin" />
                              ) : (
                                <Camera className="h-4 w-4 text-muted-foreground" />
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </label>
                      </TableCell>
                      <TableCell>{item.category || '-'}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{item.notes || '-'}</TableCell>
                      {canEdit && (
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            {canDelete && (
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="text-destructive hover:text-destructive"
                                onClick={() => deleteMutation.mutate(item.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
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

      {/* Add Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Container</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date *</Label>
                <Input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Date Receive Factory</Label>
                <Input
                  type="date"
                  value={formData.date_receive_factory}
                  onChange={(e) => setFormData({ ...formData, date_receive_factory: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Out Factory</Label>
              <Input
                placeholder="Enter out factory"
                value={formData.out_factory}
                onChange={(e) => setFormData({ ...formData, out_factory: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}>
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
              <Label>Notes</Label>
              <Textarea
                placeholder="Enter notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsAddDialogOpen(false); resetForm(); }}>
              Cancel
            </Button>
            <Button onClick={handleSubmitAdd} disabled={addMutation.isPending}>
              {addMutation.isPending ? 'Adding...' : 'Add Container'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Container</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date *</Label>
                <Input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Date Receive Factory</Label>
                <Input
                  type="date"
                  value={formData.date_receive_factory}
                  onChange={(e) => setFormData({ ...formData, date_receive_factory: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Out Factory</Label>
              <Input
                placeholder="Enter out factory"
                value={formData.out_factory}
                onChange={(e) => setFormData({ ...formData, out_factory: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}>
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
              <Label>Notes</Label>
              <Textarea
                placeholder="Enter notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsEditDialogOpen(false); setEditingItem(null); }}>
              Cancel
            </Button>
            <Button onClick={handleSubmitEdit} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Container;
