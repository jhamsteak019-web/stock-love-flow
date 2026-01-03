import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Plus, Trash2, RotateCcw, Search, RefreshCcw } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

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

const STATUS_OPTIONS = ['pending', 'in_progress', 'completed', 'cancelled'];

const RepeatOrder = () => {
  const { user, userRole } = useAuth();
  const queryClient = useQueryClient();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('active');
  
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

  const filteredActiveOrders = activeOrders.filter(order =>
    (order.branch_store?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (order.category?.toLowerCase() || '').includes(searchTerm.toLowerCase())
  );

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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <RefreshCcw className="h-5 w-5" />
            Repeat Orders
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search orders..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 w-[200px]"
              />
            </div>
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
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="active">
                Active ({activeOrders.length})
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
                        <TableHead className="min-w-[150px]">Branch/Store</TableHead>
                        <TableHead className="min-w-[120px]">Category</TableHead>
                        <TableHead className="min-w-[130px]">Date Give Store</TableHead>
                        <TableHead className="min-w-[150px]">Date Give Warehouse</TableHead>
                        <TableHead className="min-w-[100px]">Status</TableHead>
                        <TableHead className="min-w-[150px]">Date Out Warehouse</TableHead>
                        {canEdit && <TableHead className="min-w-[80px] text-right">Actions</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredActiveOrders.map((order) => (
                        <TableRow key={order.id}>
                          <TableCell className="font-medium">{order.branch_store || '-'}</TableCell>
                          <TableCell>{order.category || '-'}</TableCell>
                          <TableCell>{formatDate(order.date_give_store)}</TableCell>
                          <TableCell>{formatDate(order.date_give_warehouse)}</TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${getStatusBadgeClass(order.status)}`}>
                              {order.status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                            </span>
                          </TableCell>
                          <TableCell>{formatDate(order.date_out_warehouse)}</TableCell>
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
