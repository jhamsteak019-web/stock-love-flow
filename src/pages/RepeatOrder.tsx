import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Trash2, RotateCcw, Search, RefreshCcw } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface RepeatOrderItem {
  id: string;
  item_name: string;
  quantity: number;
  destination: string;
  notes: string | null;
  status: string;
  created_at: string;
  created_by: string | null;
  deleted_at: string | null;
}

const RepeatOrder = () => {
  const { user, userRole } = useAuth();
  const queryClient = useQueryClient();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('active');
  
  const [formData, setFormData] = useState({
    item_name: '',
    quantity: 1,
    destination: '',
    notes: '',
  });

  const isAdmin = userRole === 'admin';
  const isStaff = userRole === 'staff';
  const canEdit = isAdmin || isStaff;

  // Fetch active repeat orders
  const { data: activeOrders = [], isLoading: isLoadingActive, refetch: refetchActive } = useQuery({
    queryKey: ['repeat-orders', 'active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('repeat_orders')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as RepeatOrderItem[];
    },
  });

  // Fetch deleted repeat orders
  const { data: deletedOrders = [], isLoading: isLoadingDeleted, refetch: refetchDeleted } = useQuery({
    queryKey: ['repeat-orders', 'deleted'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('repeat_orders')
        .select('*')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false });
      
      if (error) throw error;
      return data as RepeatOrderItem[];
    },
  });

  // Add mutation
  const addMutation = useMutation({
    mutationFn: async (newOrder: Omit<RepeatOrderItem, 'id' | 'created_at' | 'created_by' | 'deleted_at' | 'status'>) => {
      const { data, error } = await supabase
        .from('repeat_orders')
        .insert({
          ...newOrder,
          created_by: user?.id,
          status: 'pending',
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
        .from('repeat_orders')
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
        .from('repeat_orders')
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
        .from('repeat_orders')
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
      item_name: '',
      quantity: 1,
      destination: '',
      notes: '',
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.item_name.trim()) {
      toast.error('Item name is required');
      return;
    }
    addMutation.mutate(formData);
  };

  const filteredActiveOrders = activeOrders.filter(order =>
    order.item_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.destination.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredDeletedOrders = deletedOrders.filter(order =>
    order.item_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.destination.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const isLoading = isLoadingActive || isLoadingDeleted;

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
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add New Repeat Order</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="item_name">Item Name *</Label>
                      <Input
                        id="item_name"
                        value={formData.item_name}
                        onChange={(e) => setFormData({ ...formData, item_name: e.target.value })}
                        placeholder="Enter item name"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="quantity">Quantity</Label>
                      <Input
                        id="quantity"
                        type="number"
                        min="1"
                        value={formData.quantity}
                        onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 1 })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="destination">Destination</Label>
                      <Input
                        id="destination"
                        value={formData.destination}
                        onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
                        placeholder="Enter destination"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="notes">Notes</Label>
                      <Textarea
                        id="notes"
                        value={formData.notes}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                        placeholder="Enter notes"
                        rows={3}
                      />
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
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item Name</TableHead>
                        <TableHead>Quantity</TableHead>
                        <TableHead>Destination</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Notes</TableHead>
                        <TableHead>Created</TableHead>
                        {canEdit && <TableHead className="text-right">Actions</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredActiveOrders.map((order) => (
                        <TableRow key={order.id}>
                          <TableCell className="font-medium">{order.item_name}</TableCell>
                          <TableCell>{order.quantity}</TableCell>
                          <TableCell>{order.destination || '-'}</TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                              order.status === 'completed' 
                                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                : order.status === 'pending'
                                ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                                : 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400'
                            }`}>
                              {order.status}
                            </span>
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">{order.notes || '-'}</TableCell>
                          <TableCell>{format(new Date(order.created_at), 'MMM dd, yyyy')}</TableCell>
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
                </div>
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
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item Name</TableHead>
                        <TableHead>Quantity</TableHead>
                        <TableHead>Destination</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Notes</TableHead>
                        <TableHead>Deleted At</TableHead>
                        {isAdmin && <TableHead className="text-right">Actions</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredDeletedOrders.map((order) => (
                        <TableRow key={order.id}>
                          <TableCell className="font-medium">{order.item_name}</TableCell>
                          <TableCell>{order.quantity}</TableCell>
                          <TableCell>{order.destination || '-'}</TableCell>
                          <TableCell>
                            <span className="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400">
                              {order.status}
                            </span>
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">{order.notes || '-'}</TableCell>
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
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default RepeatOrder;
