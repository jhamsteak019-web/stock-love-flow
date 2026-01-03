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
import { Plus, Trash2, RotateCcw, Search, RefreshCcw, Calendar, FileText, Settings2 } from 'lucide-react';
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

const DEFAULT_COLUMNS: ColumnConfig[] = [
  { key: 'branch_store', label: 'Branch/Store', visible: true, width: 150 },
  { key: 'category', label: 'Category', visible: true, width: 120 },
  { key: 'date_give_store', label: 'Date Give Store', visible: true, width: 130 },
  { key: 'date_give_warehouse', label: 'Date Give Warehouse', visible: true, width: 150 },
  { key: 'status', label: 'Status', visible: true, width: 120 },
  { key: 'date_out_warehouse', label: 'Date Out Warehouse', visible: true, width: 150 },
];

const RepeatOrder = () => {
  const { user, userRole } = useAuth();
  const queryClient = useQueryClient();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('active');
  const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  
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

  const isAdmin = userRole === 'admin';
  const isStaff = userRole === 'staff';
  const canEdit = isAdmin || isStaff;

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
    mutationFn: async (newOrder: Omit<RepeatOrderItem, 'id' | 'created_at' | 'created_by' | 'deleted_at'>) => {
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
    const isEditing = editingCell?.id === order.id && editingCell?.field === field;
    
    if (!canEdit) {
      return isDate ? formatDate(value) : (value || '-');
    }

    if (isEditing) {
      return (
        <Input
          type={isDate ? 'date' : 'text'}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={() => handleSaveEdit(order.id, field)}
          onKeyDown={(e) => handleKeyDown(e, order.id, field)}
          autoFocus
          className="h-8 w-full min-w-[100px]"
        />
      );
    }

    return (
      <div
        onClick={() => startEditing(order.id, field, value)}
        className="cursor-pointer hover:bg-muted/50 px-2 py-1 rounded min-h-[28px] flex items-center"
      >
        {isDate ? formatDate(value) : (value || '-')}
      </div>
    );
  };

  const renderStatusCell = (order: RepeatOrderItem) => {
    const isEditing = editingCell?.id === order.id && editingCell?.field === 'status';
    
    if (!canEdit) {
      return (
        <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${getStatusBadgeClass(order.status)}`}>
          {order.status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
        </span>
      );
    }

    if (isEditing) {
      return (
        <Select
          value={editValue}
          onValueChange={(value) => {
            setEditValue(value);
            updateMutation.mutate({ id: order.id, field: 'status', value });
          }}
        >
          <SelectTrigger className="h-8 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((status) => (
              <SelectItem key={status} value={status}>
                {status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    return (
      <div
        onClick={() => startEditing(order.id, 'status', order.status)}
        className="cursor-pointer"
      >
        <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${getStatusBadgeClass(order.status)}`}>
          {order.status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
        </span>
      </div>
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
              <Calendar className="h-4 w-4 text-muted-foreground" />
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
                        {canEdit && <TableHead className="w-[80px] text-right">Actions</TableHead>}
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
                          {canEdit && (
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => softDeleteMutation.mutate(order.id)}
                                disabled={softDeleteMutation.isPending}
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
    </div>
  );
};

export default RepeatOrder;
