import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Slider } from '@/components/ui/slider';
import { Plus, Trash2, RotateCcw, Search, RefreshCcw, Calendar as CalendarIcon, FileText, Settings2, Pencil, Upload, Image, X, ZoomIn, ZoomOut, ChevronLeft, ChevronRight } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

interface RepeatOrderItem {
  id: string;
  branch_store: string | null;
  category: string | null;
  date_give_store: string | null;
  date_give_warehouse: string | null;
  date_out_warehouse: string | null;
  status: string;
  photo_url: string | null;
  created_at: string;
  created_by: string | null;
  deleted_at: string | null;
}

interface ColumnConfig {
  key: string;
  label: string;
  visible: boolean;
  width: number;
}

const STATUS_OPTIONS = ['pending', 'in_progress', 'completed', 'cancelled'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const MAX_PHOTOS = 10;

const DEFAULT_COLUMNS: ColumnConfig[] = [
  { key: 'branch_store', label: 'Branch/Store', visible: true, width: 150 },
  { key: 'category', label: 'Category', visible: true, width: 120 },
  { key: 'date_give_store', label: 'Date Give Store', visible: true, width: 140 },
  { key: 'date_give_warehouse', label: 'Date Give Warehouse', visible: true, width: 160 },
  { key: 'status', label: 'Status', visible: true, width: 120 },
  { key: 'date_out_warehouse', label: 'Date Out Warehouse', visible: true, width: 160 },
  { key: 'photo', label: 'Photo', visible: true, width: 280 },
  { key: 'action', label: 'Action', visible: true, width: 100 },
];

// Helper to parse photo URLs from photo_url field (JSON array or single URL)
const parsePhotoUrls = (photoUrl: string | null): string[] => {
  if (!photoUrl) return [];
  try {
    const parsed = JSON.parse(photoUrl);
    return Array.isArray(parsed) ? parsed : [photoUrl];
  } catch {
    return photoUrl ? [photoUrl] : [];
  }
};

const RepeatOrder = () => {
  const { user, userRole } = useAuth();
  const queryClient = useQueryClient();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<RepeatOrderItem | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('active');
  const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [uploadingPhotoId, setUploadingPhotoId] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<{ url: string; orderId: string; allPhotos: string[]; currentIndex: number } | null>(null);
  const [photoZoomLevel, setPhotoZoomLevel] = useState(1);
  const [dateOutWarehousePopover, setDateOutWarehousePopover] = useState<{ orderId: string; isOpen: boolean } | null>(null);
  
  // Filters
  const currentDate = new Date();
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth().toString());
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear().toString());
  const [selectedStatus, setSelectedStatus] = useState('all');
  
  // Column settings
  const [columns, setColumns] = useState<ColumnConfig[]>(DEFAULT_COLUMNS);
  
  const [formData, setFormData] = useState({
    branch_store: '',
    category: '',
    date_give_store: '',
    date_give_warehouse: '',
    date_out_warehouse: '',
    status: 'pending',
  });

  const [editFormData, setEditFormData] = useState({
    branch_store: '',
    category: '',
    date_give_store: '',
    date_give_warehouse: '',
    date_out_warehouse: '',
    status: 'pending',
  });

  const isAdmin = userRole === 'admin';
  const canEdit = isAdmin;

  // Generate year options
  const yearOptions = Array.from({ length: 6 }, (_, i) => 
    (currentDate.getFullYear() - i).toString()
  );

  // Fetch active repeat orders
  const { data: activeOrders = [], isLoading: isLoadingActive } = useQuery({
    queryKey: ['repeat-orders', 'active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('repeat_orders' as any)
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return (data || []) as unknown as RepeatOrderItem[];
    },
  });

  // Fetch deleted repeat orders
  const { data: deletedOrders = [], isLoading: isLoadingDeleted } = useQuery({
    queryKey: ['repeat-orders', 'deleted'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('repeat_orders' as any)
        .select('*')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false });
      
      if (error) throw error;
      return (data || []) as unknown as RepeatOrderItem[];
    },
  });

  // Update mutation for inline editing
  const updateMutation = useMutation({
    mutationFn: async ({ id, field, value }: { id: string; field: string; value: string | null }) => {
      const { error } = await supabase
        .from('repeat_orders' as any)
        .update({ [field]: value || null })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repeat-orders'] });
      toast.success('Updated successfully');
      setEditingCell(null);
    },
    onError: (error) => {
      toast.error('Failed to update: ' + error.message);
    },
  });

  // Add mutation
  const addMutation = useMutation({
    mutationFn: async (newOrder: { branch_store: string; category: string; date_give_store: string; date_give_warehouse: string; date_out_warehouse: string; status: string }) => {
      const { data, error } = await supabase
        .from('repeat_orders' as any)
        .insert({
          branch_store: newOrder.branch_store || null,
          category: newOrder.category || null,
          date_give_store: newOrder.date_give_store || null,
          date_give_warehouse: newOrder.date_give_warehouse || null,
          date_out_warehouse: newOrder.date_out_warehouse || null,
          status: newOrder.status,
          created_by: user?.id,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repeat-orders'] });
      toast.success('Repeat order added successfully');
      setIsAddDialogOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast.error('Failed to add repeat order: ' + error.message);
    },
  });

  // Edit mutation
  const editMutation = useMutation({
    mutationFn: async (order: { id: string; branch_store: string; category: string; date_give_store: string; date_give_warehouse: string; date_out_warehouse: string; status: string }) => {
      const { error } = await supabase
        .from('repeat_orders' as any)
        .update({
          branch_store: order.branch_store || null,
          category: order.category || null,
          date_give_store: order.date_give_store || null,
          date_give_warehouse: order.date_give_warehouse || null,
          date_out_warehouse: order.date_out_warehouse || null,
          status: order.status,
        })
        .eq('id', order.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repeat-orders'] });
      toast.success('Order updated successfully');
      setIsEditDialogOpen(false);
      setEditingOrder(null);
    },
    onError: (error) => {
      toast.error('Failed to update order: ' + error.message);
    },
  });

  // Soft delete mutation
  const softDeleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('repeat_orders' as any)
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repeat-orders'] });
      toast.success('Order moved to Recently Deleted');
    },
    onError: (error) => {
      toast.error('Failed to delete order: ' + error.message);
    },
  });

  // Restore mutation
  const restoreMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('repeat_orders' as any)
        .update({ deleted_at: null })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repeat-orders'] });
      toast.success('Order restored successfully');
    },
    onError: (error) => {
      toast.error('Failed to restore order: ' + error.message);
    },
  });

  // Permanent delete mutation
  const permanentDeleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('repeat_orders' as any)
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repeat-orders'] });
      toast.success('Order permanently deleted');
    },
    onError: (error) => {
      toast.error('Failed to permanently delete order: ' + error.message);
    },
  });

  // Clear all mutation
  const clearAllMutation = useMutation({
    mutationFn: async () => {
      const ids = filteredActiveOrders.map(order => order.id);
      if (ids.length === 0) return;
      
      const { error } = await supabase
        .from('repeat_orders' as any)
        .update({ deleted_at: new Date().toISOString() })
        .in('id', ids);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repeat-orders'] });
      toast.success('All filtered orders moved to Recently Deleted');
    },
    onError: (error) => {
      toast.error('Failed to clear orders: ' + error.message);
    },
  });

  // Photo upload handler - supports multiple photos
  const handlePhotoUpload = async (orderId: string, file: File, existingPhotos: string[]) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }

    if (existingPhotos.length >= MAX_PHOTOS) {
      toast.error(`Maximum ${MAX_PHOTOS} photos allowed`);
      return;
    }

    setUploadingPhotoId(orderId);
    
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${orderId}-${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('repeat-order-photos')
        .upload(fileName, file, { upsert: true });
      
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('repeat-order-photos')
        .getPublicUrl(fileName);

      const updatedPhotos = [...existingPhotos, publicUrl];
      
      const { error: updateError } = await supabase
        .from('repeat_orders' as any)
        .update({ photo_url: JSON.stringify(updatedPhotos) })
        .eq('id', orderId);
      
      if (updateError) throw updateError;

      queryClient.invalidateQueries({ queryKey: ['repeat-orders'] });
      toast.success(`Photo ${updatedPhotos.length}/${MAX_PHOTOS} uploaded`);
    } catch (error: any) {
      toast.error('Failed to upload photo: ' + error.message);
    } finally {
      setUploadingPhotoId(null);
    }
  };

  // Handle date out warehouse selection from calendar
  const handleDateOutWarehouseSelect = async (orderId: string, date: Date | undefined) => {
    if (!date) return;
    
    const formattedDate = format(date, 'yyyy-MM-dd');
    
    try {
      const { error } = await supabase
        .from('repeat_orders' as any)
        .update({ date_out_warehouse: formattedDate })
        .eq('id', orderId);
      
      if (error) throw error;
      
      queryClient.invalidateQueries({ queryKey: ['repeat-orders'] });
      toast.success('Date Out Warehouse updated');
      setDateOutWarehousePopover(null);
    } catch (error: any) {
      toast.error('Failed to update date: ' + error.message);
    }
  };

  // Delete single photo from array
  const handlePhotoDelete = async (orderId: string, photoUrl: string, allPhotos: string[]) => {
    try {
      const fileName = photoUrl.split('/').pop();
      if (fileName) {
        await supabase.storage.from('repeat-order-photos').remove([fileName]);
      }

      const updatedPhotos = allPhotos.filter(url => url !== photoUrl);
      
      const { error } = await supabase
        .from('repeat_orders' as any)
        .update({ photo_url: updatedPhotos.length > 0 ? JSON.stringify(updatedPhotos) : null })
        .eq('id', orderId);
      
      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['repeat-orders'] });
      toast.success('Photo removed');
      setPhotoPreview(null);
    } catch (error: any) {
      toast.error('Failed to remove photo: ' + error.message);
    }
  };

  const resetForm = () => {
    setFormData({
      branch_store: '',
      category: '',
      date_give_store: '',
      date_give_warehouse: '',
      date_out_warehouse: '',
      status: 'pending',
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.branch_store.trim()) {
      toast.error('Branch/Store is required');
      return;
    }
    addMutation.mutate(formData);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOrder) return;
    if (!editFormData.branch_store.trim()) {
      toast.error('Branch/Store is required');
      return;
    }
    editMutation.mutate({
      id: editingOrder.id,
      ...editFormData,
    });
  };

  const openEditDialog = (order: RepeatOrderItem) => {
    setEditingOrder(order);
    setEditFormData({
      branch_store: order.branch_store || '',
      category: order.category || '',
      date_give_store: order.date_give_store || '',
      date_give_warehouse: order.date_give_warehouse || '',
      date_out_warehouse: order.date_out_warehouse || '',
      status: order.status,
    });
    setIsEditDialogOpen(true);
  };

  const handleColumnWidthChange = (key: string, value: number[]) => {
    setColumns(prev => prev.map(col => 
      col.key === key ? { ...col, width: value[0] } : col
    ));
  };

  const isColumnVisible = (key: string) => columns.find(col => col.key === key)?.visible ?? true;
  const getColumnWidth = (key: string) => columns.find(col => col.key === key)?.width ?? 150;

  const startEditing = (id: string, field: string, currentValue: string | null) => {
    if (!canEdit) return;
    setEditingCell({ id, field });
    setEditValue(currentValue || '');
  };

  const handleSaveEdit = (id: string, field: string) => {
    updateMutation.mutate({ id, field, value: editValue });
  };

  const handleKeyDown = (e: React.KeyboardEvent, id: string, field: string) => {
    if (e.key === 'Enter') {
      handleSaveEdit(id, field);
    } else if (e.key === 'Escape') {
      setEditingCell(null);
    }
  };

  // Filter orders
  const filterOrders = (orders: RepeatOrderItem[]) => {
    return orders.filter(order => {
      const matchesSearch = 
        (order.branch_store?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (order.category?.toLowerCase() || '').includes(searchTerm.toLowerCase());
      
      const matchesStatus = selectedStatus === 'all' || order.status === selectedStatus;
      
      const orderDate = new Date(order.created_at);
      const matchesMonth = orderDate.getMonth().toString() === selectedMonth;
      const matchesYear = orderDate.getFullYear().toString() === selectedYear;
      
      return matchesSearch && matchesStatus && matchesMonth && matchesYear;
    });
  };

  const filteredActiveOrders = filterOrders(activeOrders);
  const filteredDeletedOrders = deletedOrders.filter(order =>
    (order.branch_store?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (order.category?.toLowerCase() || '').includes(searchTerm.toLowerCase())
  );

  const isLoading = isLoadingActive || isLoadingDeleted;

  const formatDate = (date: string | null) => {
    if (!date) return '-';
    try {
      return format(new Date(date), 'MMM dd, yyyy');
    } catch {
      return '-';
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
      case 'in_progress':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
      case 'cancelled':
        return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
      default:
        return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
    }
  };

  const handleSavePDF = () => {
    const doc = new jsPDF();
    
    doc.setFontSize(16);
    doc.text('Repeat Orders Report', 14, 15);
    doc.setFontSize(10);
    doc.text(`${MONTHS[parseInt(selectedMonth)]} ${selectedYear}`, 14, 22);
    doc.text(`Generated: ${format(new Date(), 'MMM dd, yyyy HH:mm')}`, 14, 28);

    const tableColumns = columns
      .filter(col => col.visible)
      .map(col => col.label);

    const tableRows = filteredActiveOrders.map(order => {
      const row: string[] = [];
      columns.filter(col => col.visible).forEach(col => {
        switch (col.key) {
          case 'branch_store': row.push(order.branch_store || '-'); break;
          case 'category': row.push(order.category || '-'); break;
          case 'date_give_store': row.push(formatDate(order.date_give_store)); break;
          case 'date_give_warehouse': row.push(formatDate(order.date_give_warehouse)); break;
          case 'status': row.push(order.status.replace('_', ' ')); break;
          case 'date_out_warehouse': row.push(formatDate(order.date_out_warehouse)); break;
        }
      });
      return row;
    });

    (doc as any).autoTable({
      head: [tableColumns],
      body: tableRows,
      startY: 35,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [59, 130, 246] },
    });

    doc.save(`repeat-orders-${MONTHS[parseInt(selectedMonth)]}-${selectedYear}.pdf`);
    toast.success('PDF saved successfully');
  };

  const renderEditableCell = (order: RepeatOrderItem, field: string, value: string | null, isDate: boolean = false) => {
    return (
      <div className="px-2 py-1 min-h-[28px] flex items-center">
        {isDate ? formatDate(value) : (value || '-')}
      </div>
    );
  };

  const renderStatusCell = (order: RepeatOrderItem) => {
    return (
      <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${getStatusBadgeClass(order.status)}`}>
        {order.status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col gap-4">
          <div className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <RefreshCcw className="h-5 w-5" />
              Repeat Orders
            </CardTitle>
            {canEdit && (
              <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Order
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Add New Repeat Order</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="branch_store">Branch/Store *</Label>
                      <Input
                        id="branch_store"
                        value={formData.branch_store}
                        onChange={(e) => setFormData({ ...formData, branch_store: e.target.value })}
                        placeholder="Enter branch/store"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="category">Category</Label>
                      <Input
                        id="category"
                        value={formData.category}
                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                        placeholder="Enter category"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="date_give_store">Date Give Store</Label>
                      <Input
                        id="date_give_store"
                        type="date"
                        value={formData.date_give_store}
                        onChange={(e) => setFormData({ ...formData, date_give_store: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="date_give_warehouse">Date Give Warehouse</Label>
                      <Input
                        id="date_give_warehouse"
                        type="date"
                        value={formData.date_give_warehouse}
                        onChange={(e) => setFormData({ ...formData, date_give_warehouse: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="date_out_warehouse">Date Out Warehouse</Label>
                      <Input
                        id="date_out_warehouse"
                        type="date"
                        value={formData.date_out_warehouse}
                        onChange={(e) => setFormData({ ...formData, date_out_warehouse: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="status">Status</Label>
                      <Select
                        value={formData.status}
                        onValueChange={(value) => setFormData({ ...formData, status: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTIONS.map((status) => (
                            <SelectItem key={status} value={status}>
                              {status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={addMutation.isPending}>
                        {addMutation.isPending ? 'Adding...' : 'Add Order'}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </div>

          {/* Filters Row */}
          <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 text-muted-foreground" />
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((month, index) => (
                    <SelectItem key={month} value={index.toString()}>
                      {month}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((year) => (
                  <SelectItem key={year} value={year}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                {STATUS_OPTIONS.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm">
                  <Settings2 className="h-4 w-4 mr-2" />
                  Column Settings
                </Button>
              </SheetTrigger>
              <SheetContent className="w-[320px]">
                <SheetHeader>
                  <SheetTitle>Column Settings</SheetTitle>
                  <p className="text-sm text-muted-foreground">Customize table columns</p>
                </SheetHeader>
                <div className="mt-6 space-y-6">
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-4">COLUMN WIDTHS</h4>
                    <div className="space-y-6">
                      {columns.map((column) => (
                        <div key={column.key} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">{column.label}</span>
                            <span className="text-xs text-muted-foreground">{column.width}px</span>
                          </div>
                          <Slider
                            value={[column.width]}
                            onValueChange={(value) => handleColumnWidthChange(column.key, value)}
                            min={80}
                            max={300}
                            step={5}
                            className="w-full"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </SheetContent>
            </Sheet>

            <div className="flex-1" />

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleSavePDF}>
                <FileText className="h-4 w-4 mr-2" />
                Save PDF
              </Button>
              {isAdmin && (
                <Button 
                  variant="destructive" 
                  size="sm" 
                  onClick={() => clearAllMutation.mutate()}
                  disabled={clearAllMutation.isPending || filteredActiveOrders.length === 0}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear All
                </Button>
              )}
            </div>
          </div>

          {/* Search */}
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search orders..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="active">
                Active ({filteredActiveOrders.length})
              </TabsTrigger>
              <TabsTrigger value="deleted">
                Recently Deleted ({deletedOrders.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="active">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                </div>
              ) : filteredActiveOrders.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No repeat orders found
                </div>
              ) : (
                <ScrollArea className="w-full whitespace-nowrap rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {isColumnVisible('branch_store') && <TableHead style={{ width: getColumnWidth('branch_store'), minWidth: getColumnWidth('branch_store') }}>Branch/Store</TableHead>}
                        {isColumnVisible('category') && <TableHead style={{ width: getColumnWidth('category'), minWidth: getColumnWidth('category') }}>Category</TableHead>}
                        {isColumnVisible('date_give_store') && <TableHead style={{ width: getColumnWidth('date_give_store'), minWidth: getColumnWidth('date_give_store') }}>Date Give Store</TableHead>}
                        {isColumnVisible('date_give_warehouse') && <TableHead style={{ width: getColumnWidth('date_give_warehouse'), minWidth: getColumnWidth('date_give_warehouse') }}>Date Give Warehouse</TableHead>}
                        {isColumnVisible('status') && <TableHead style={{ width: getColumnWidth('status'), minWidth: getColumnWidth('status') }}>Status</TableHead>}
                        {isColumnVisible('date_out_warehouse') && <TableHead style={{ width: getColumnWidth('date_out_warehouse'), minWidth: getColumnWidth('date_out_warehouse') }}>Date Out Warehouse</TableHead>}
                        {isColumnVisible('photo') && <TableHead style={{ width: getColumnWidth('photo'), minWidth: getColumnWidth('photo') }}>Photo</TableHead>}
                        {canEdit && isColumnVisible('action') && <TableHead style={{ width: getColumnWidth('action'), minWidth: getColumnWidth('action') }}>Action</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredActiveOrders.map((order) => (
                        <TableRow key={order.id}>
                          {isColumnVisible('branch_store') && (
                            <TableCell style={{ width: getColumnWidth('branch_store') }}>
                              {renderEditableCell(order, 'branch_store', order.branch_store)}
                            </TableCell>
                          )}
                          {isColumnVisible('category') && (
                            <TableCell style={{ width: getColumnWidth('category') }}>
                              {renderEditableCell(order, 'category', order.category)}
                            </TableCell>
                          )}
                          {isColumnVisible('date_give_store') && (
                            <TableCell style={{ width: getColumnWidth('date_give_store') }}>
                              {renderEditableCell(order, 'date_give_store', order.date_give_store, true)}
                            </TableCell>
                          )}
                          {isColumnVisible('date_give_warehouse') && (
                            <TableCell style={{ width: getColumnWidth('date_give_warehouse') }}>
                              {renderEditableCell(order, 'date_give_warehouse', order.date_give_warehouse, true)}
                            </TableCell>
                          )}
                          {isColumnVisible('status') && (
                            <TableCell style={{ width: getColumnWidth('status') }}>
                              {renderStatusCell(order)}
                            </TableCell>
                          )}
                          {isColumnVisible('date_out_warehouse') && (
                            <TableCell style={{ width: getColumnWidth('date_out_warehouse') }}>
                              {renderEditableCell(order, 'date_out_warehouse', order.date_out_warehouse, true)}
                            </TableCell>
                          )}
                          {isColumnVisible('photo') && (
                            <TableCell style={{ width: getColumnWidth('photo') }}>
                              {(() => {
                                const photos = parsePhotoUrls(order.photo_url);
                                return (
                                  <div className="flex items-center gap-1 flex-wrap">
                                    {photos.map((url, idx) => (
                                      <div key={idx} className="relative group">
                                        <img
                                          src={url}
                                          alt={`Photo ${idx + 1}`}
                                          className="h-8 w-8 object-cover rounded cursor-pointer hover:opacity-80 transition-opacity"
                                          onClick={() => setPhotoPreview({ url, orderId: order.id, allPhotos: photos, currentIndex: idx })}
                                        />
                                        {canEdit && (
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handlePhotoDelete(order.id, url, photos);
                                            }}
                                            className="absolute -top-1 -right-1 h-3 w-3 bg-destructive text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                                          >
                                            <X className="h-2 w-2" />
                                          </button>
                                        )}
                                      </div>
                                    ))}
                                    {canEdit && photos.length < MAX_PHOTOS && (
                                      <label className="cursor-pointer">
                                        <input
                                          type="file"
                                          accept="image/*"
                                          className="hidden"
                                          onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) handlePhotoUpload(order.id, file, photos);
                                          }}
                                          disabled={uploadingPhotoId === order.id}
                                        />
                                        {uploadingPhotoId === order.id ? (
                                          <div className="h-8 w-8 flex items-center justify-center">
                                            <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                                          </div>
                                        ) : (
                                          <div className="h-8 w-8 border-2 border-dashed border-muted-foreground/50 rounded flex items-center justify-center hover:border-primary hover:bg-muted/50 transition-colors">
                                            <Plus className="h-3 w-3 text-muted-foreground" />
                                          </div>
                                        )}
                                      </label>
                                    )}
                                    {!canEdit && photos.length === 0 && (
                                      <span className="text-muted-foreground text-sm">-</span>
                                    )}
                                    {photos.length > 0 && (
                                      <span className="text-xs text-muted-foreground ml-1">{photos.length}/{MAX_PHOTOS}</span>
                                    )}
                                  </div>
                                );
                              })()}
                            </TableCell>
                          )}
                          {canEdit && isColumnVisible('action') && (
                            <TableCell style={{ width: getColumnWidth('action') }}>
                              <div className="flex items-center gap-1">
                                {isAdmin && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => openEditDialog(order)}
                                  >
                                    <Pencil className="h-4 w-4 text-blue-600" />
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => softDeleteMutation.mutate(order.id)}
                                  disabled={softDeleteMutation.isPending}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <ScrollBar orientation="horizontal" />
                </ScrollArea>
              )}
            </TabsContent>

            <TabsContent value="deleted">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                </div>
              ) : filteredDeletedOrders.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No deleted orders found
                </div>
              ) : (
                <ScrollArea className="w-full whitespace-nowrap rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[150px]">Branch/Store</TableHead>
                        <TableHead className="min-w-[120px]">Category</TableHead>
                        <TableHead className="min-w-[130px]">Date Give Store</TableHead>
                        <TableHead className="min-w-[150px]">Date Give Warehouse</TableHead>
                        <TableHead className="min-w-[100px]">Status</TableHead>
                        <TableHead className="min-w-[150px]">Date Out Warehouse</TableHead>
                        <TableHead className="min-w-[130px]">Deleted At</TableHead>
                        {isAdmin && <TableHead className="min-w-[100px] text-right">Actions</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredDeletedOrders.map((order) => (
                        <TableRow key={order.id}>
                          <TableCell className="font-medium">{order.branch_store || '-'}</TableCell>
                          <TableCell>{order.category || '-'}</TableCell>
                          <TableCell>{formatDate(order.date_give_store)}</TableCell>
                          <TableCell>{formatDate(order.date_give_warehouse)}</TableCell>
                          <TableCell>
                            <span className="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400">
                              {order.status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                            </span>
                          </TableCell>
                          <TableCell>{formatDate(order.date_out_warehouse)}</TableCell>
                          <TableCell>
                            {order.deleted_at ? format(new Date(order.deleted_at), 'MMM dd, yyyy HH:mm') : '-'}
                          </TableCell>
                          {isAdmin && (
                            <TableCell className="text-right space-x-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => restoreMutation.mutate(order.id)}
                                disabled={restoreMutation.isPending}
                              >
                                <RotateCcw className="h-4 w-4 text-blue-600" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => permanentDeleteMutation.mutate(order.id)}
                                disabled={permanentDeleteMutation.isPending}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <ScrollBar orientation="horizontal" />
                </ScrollArea>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Repeat Order</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit_branch_store">Branch/Store *</Label>
              <Input
                id="edit_branch_store"
                value={editFormData.branch_store}
                onChange={(e) => setEditFormData({ ...editFormData, branch_store: e.target.value })}
                placeholder="Enter branch/store"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_category">Category</Label>
              <Input
                id="edit_category"
                value={editFormData.category}
                onChange={(e) => setEditFormData({ ...editFormData, category: e.target.value })}
                placeholder="Enter category"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_date_give_store">Date Give Store</Label>
              <Input
                id="edit_date_give_store"
                type="date"
                value={editFormData.date_give_store}
                onChange={(e) => setEditFormData({ ...editFormData, date_give_store: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_date_give_warehouse">Date Give Warehouse</Label>
              <Input
                id="edit_date_give_warehouse"
                type="date"
                value={editFormData.date_give_warehouse}
                onChange={(e) => setEditFormData({ ...editFormData, date_give_warehouse: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_date_out_warehouse">Date Out Warehouse</Label>
              <Input
                id="edit_date_out_warehouse"
                type="date"
                value={editFormData.date_out_warehouse}
                onChange={(e) => setEditFormData({ ...editFormData, date_out_warehouse: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_status">Status</Label>
              <Select
                value={editFormData.status}
                onValueChange={(value) => setEditFormData({ ...editFormData, status: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={editMutation.isPending}>
                {editMutation.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Photo Preview Dialog */}
      <Dialog open={!!photoPreview} onOpenChange={() => { setPhotoPreview(null); setPhotoZoomLevel(1); }}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>
                Photo Preview
                {photoPreview && photoPreview.allPhotos.length > 1 && (
                  <span className="text-muted-foreground ml-2">
                    ({photoPreview.currentIndex + 1}/{photoPreview.allPhotos.length})
                  </span>
                )}
              </span>
              <div className="flex items-center gap-2 mr-6">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setPhotoZoomLevel(prev => Math.max(0.5, prev - 0.25))}
                  disabled={photoZoomLevel <= 0.5}
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <span className="text-sm font-medium min-w-[60px] text-center">
                  {Math.round(photoZoomLevel * 100)}%
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setPhotoZoomLevel(prev => Math.min(3, prev + 0.25))}
                  disabled={photoZoomLevel >= 3}
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
              </div>
            </DialogTitle>
          </DialogHeader>
          {photoPreview && (
            <div className="flex flex-col gap-4">
              <div className="relative">
                {/* Left Navigation Arrow */}
                {photoPreview.allPhotos.length > 1 && (
                  <Button
                    variant="outline"
                    size="icon"
                    className="absolute left-2 top-1/2 -translate-y-1/2 z-10 bg-background/80 backdrop-blur-sm"
                    onClick={() => {
                      const newIndex = photoPreview.currentIndex > 0 
                        ? photoPreview.currentIndex - 1 
                        : photoPreview.allPhotos.length - 1;
                      setPhotoPreview({
                        ...photoPreview,
                        url: photoPreview.allPhotos[newIndex],
                        currentIndex: newIndex
                      });
                      setPhotoZoomLevel(1);
                    }}
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </Button>
                )}

                <ScrollArea className="max-h-[60vh] w-full border rounded-lg">
                  <div 
                    className="min-w-max p-4" 
                    style={{ width: photoZoomLevel > 1 ? `${photoZoomLevel * 100}%` : '100%' }}
                  >
                    <img
                      src={photoPreview.url}
                      alt="Order photo"
                      className="rounded-lg transition-transform duration-200 origin-top-left"
                      style={{ 
                        transform: `scale(${photoZoomLevel})`,
                        transformOrigin: 'top left'
                      }}
                    />
                  </div>
                  <ScrollBar orientation="horizontal" />
                  <ScrollBar orientation="vertical" />
                </ScrollArea>

                {/* Right Navigation Arrow */}
                {photoPreview.allPhotos.length > 1 && (
                  <Button
                    variant="outline"
                    size="icon"
                    className="absolute right-2 top-1/2 -translate-y-1/2 z-10 bg-background/80 backdrop-blur-sm"
                    onClick={() => {
                      const newIndex = photoPreview.currentIndex < photoPreview.allPhotos.length - 1 
                        ? photoPreview.currentIndex + 1 
                        : 0;
                      setPhotoPreview({
                        ...photoPreview,
                        url: photoPreview.allPhotos[newIndex],
                        currentIndex: newIndex
                      });
                      setPhotoZoomLevel(1);
                    }}
                  >
                    <ChevronRight className="h-5 w-5" />
                  </Button>
                )}
              </div>

              {/* Thumbnail Strip */}
              {photoPreview.allPhotos.length > 1 && (
                <div className="flex gap-2 justify-center overflow-x-auto pb-2">
                  {photoPreview.allPhotos.map((photo, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setPhotoPreview({
                          ...photoPreview,
                          url: photo,
                          currentIndex: idx
                        });
                        setPhotoZoomLevel(1);
                      }}
                      className={`h-12 w-12 rounded overflow-hidden border-2 flex-shrink-0 transition-all ${
                        idx === photoPreview.currentIndex
                          ? 'border-primary ring-2 ring-primary/50'
                          : 'border-muted hover:border-primary/50'
                      }`}
                    >
                      <img
                        src={photo}
                        alt={`Thumbnail ${idx + 1}`}
                        className="h-full w-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}

              {canEdit && (
                <div className="flex justify-center">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      const order = activeOrders.find(o => o.id === photoPreview.orderId);
                      if (order) {
                        const photos = parsePhotoUrls(order.photo_url);
                        handlePhotoDelete(photoPreview.orderId, photoPreview.url, photos);
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Remove Photo
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RepeatOrder;
