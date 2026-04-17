import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { AlertTriangle, Pencil, Trash2, Search, Plus, CheckCircle2, FileWarning } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Discrepancy {
  id: string;
  batch_id: string | null;
  allocation_bill: string | null;
  destination: string | null;
  category: string | null;
  courier: string | null;
  waybill_no: string | null;
  total_boxes: number | null;
  total_qty: number | null;
  amount: number | null;
  date_out: string | null;
  date_received: string | null;
  remarks: string | null;
  discrepancy_notes: string | null;
  resolution_status: string | null;
  branch_id: string | null;
  created_at: string;
}

const Discrepancies = () => {
  const { user, userRole } = useAuth();
  const { selectedBranch } = useBranch();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Discrepancy | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Discrepancy>>({});

  const isAdmin = userRole === 'admin';
  const canEdit = ['admin', 'staff', 'assistant', 'encoder'].includes(userRole || '');
  const canDelete = isAdmin;

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['discrepancies', selectedBranch?.id],
    queryFn: async () => {
      let q = supabase.from('discrepancies').select('*').is('deleted_at', null).order('created_at', { ascending: false });
      if (selectedBranch?.id) q = q.eq('branch_id', selectedBranch.id);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as Discrepancy[];
    },
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const s = search.toLowerCase();
    return items.filter(i =>
      i.allocation_bill?.toLowerCase().includes(s) ||
      i.destination?.toLowerCase().includes(s) ||
      i.courier?.toLowerCase().includes(s) ||
      i.discrepancy_notes?.toLowerCase().includes(s) ||
      i.remarks?.toLowerCase().includes(s)
    );
  }, [items, search]);

  const updateMutation = useMutation({
    mutationFn: async (payload: Partial<Discrepancy> & { id: string }) => {
      const { id, ...rest } = payload;
      const { error } = await supabase.from('discrepancies').update(rest).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discrepancies'] });
      toast({ title: 'Updated', description: 'Discrepancy saved' });
      setEditing(null);
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('discrepancies').update({ deleted_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discrepancies'] });
      toast({ title: 'Deleted', description: 'Discrepancy removed' });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const openEdit = (item: Discrepancy) => {
    setEditing(item);
    setForm(item);
  };

  const handleSave = () => {
    if (!editing) return;
    updateMutation.mutate({ ...form, id: editing.id });
  };

  const unresolvedCount = items.filter(i => i.resolution_status !== 'resolved').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-destructive/10">
          <AlertTriangle className="h-6 w-6 text-destructive" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Discrepancy</h1>
          <p className="text-sm text-muted-foreground">Lahat ng "Not OK" deliveries mula sa History — pwedeng i-edit dito.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-destructive/10 rounded-lg">
              <FileWarning className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-2xl font-bold">{items.length}</p>
              <p className="text-xs text-muted-foreground">Total Discrepancies</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-amber-500/10 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{unresolvedCount}</p>
              <p className="text-xs text-muted-foreground">Unresolved</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 rounded-lg">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{items.length - unresolvedCount}</p>
              <p className="text-xs text-muted-foreground">Resolved</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center justify-between gap-2">
            <span>Discrepancy Records</span>
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="pl-9 h-9" />
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Allocation</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-center">Boxes</TableHead>
                  <TableHead className="text-center">Qty</TableHead>
                  <TableHead>Date Out</TableHead>
                  <TableHead>Date Received</TableHead>
                  <TableHead>Discrepancy Notes</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[110px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={10} className="text-center py-8">Loading...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-12">
                      <FileWarning className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
                      <p className="text-muted-foreground">Walang discrepancy records</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.allocation_bill || '-'}</TableCell>
                      <TableCell>{item.destination || '-'}</TableCell>
                      <TableCell>{item.category || '-'}</TableCell>
                      <TableCell className="text-center">{item.total_boxes ?? '-'}</TableCell>
                      <TableCell className="text-center">{item.total_qty ?? '-'}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{item.date_out ? format(new Date(item.date_out), 'MMM d, yyyy') : '-'}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{item.date_received ? format(new Date(item.date_received), 'MMM d, yyyy') : '-'}</TableCell>
                      <TableCell className="max-w-[220px] truncate text-sm" title={item.discrepancy_notes || ''}>{item.discrepancy_notes || '-'}</TableCell>
                      <TableCell>
                        <Badge variant={item.resolution_status === 'resolved' ? 'default' : 'destructive'}>
                          {item.resolution_status === 'resolved' ? 'Resolved' : 'Unresolved'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {canEdit && (
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(item)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {canDelete && (
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(item.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Discrepancy</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div>
              <Label>Allocation Bill</Label>
              <Input value={form.allocation_bill || ''} onChange={(e) => setForm({ ...form, allocation_bill: e.target.value })} />
            </div>
            <div>
              <Label>Destination</Label>
              <Input value={form.destination || ''} onChange={(e) => setForm({ ...form, destination: e.target.value })} />
            </div>
            <div>
              <Label>Category</Label>
              <Input value={form.category || ''} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </div>
            <div>
              <Label>Courier</Label>
              <Input value={form.courier || ''} onChange={(e) => setForm({ ...form, courier: e.target.value })} />
            </div>
            <div>
              <Label>Waybill No.</Label>
              <Input value={form.waybill_no || ''} onChange={(e) => setForm({ ...form, waybill_no: e.target.value })} />
            </div>
            <div>
              <Label>Total Boxes</Label>
              <Input type="number" value={form.total_boxes ?? ''} onChange={(e) => setForm({ ...form, total_boxes: e.target.value ? Number(e.target.value) : null })} />
            </div>
            <div>
              <Label>Total Qty</Label>
              <Input type="number" value={form.total_qty ?? ''} onChange={(e) => setForm({ ...form, total_qty: e.target.value ? Number(e.target.value) : null })} />
            </div>
            <div>
              <Label>Amount</Label>
              <Input type="number" step="0.01" value={form.amount ?? ''} onChange={(e) => setForm({ ...form, amount: e.target.value ? Number(e.target.value) : null })} />
            </div>
            <div>
              <Label>Date Out</Label>
              <Input type="date" value={form.date_out ? format(new Date(form.date_out), 'yyyy-MM-dd') : ''} onChange={(e) => setForm({ ...form, date_out: e.target.value ? new Date(e.target.value).toISOString() : null })} />
            </div>
            <div>
              <Label>Date Received</Label>
              <Input type="date" value={form.date_received ? format(new Date(form.date_received), 'yyyy-MM-dd') : ''} onChange={(e) => setForm({ ...form, date_received: e.target.value ? new Date(e.target.value).toISOString() : null })} />
            </div>
            <div className="col-span-2">
              <Label>Remarks</Label>
              <Input value={form.remarks || ''} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label>Discrepancy Notes</Label>
              <Textarea rows={3} value={form.discrepancy_notes || ''} onChange={(e) => setForm({ ...form, discrepancy_notes: e.target.value })} placeholder="Anong problema o nawawala?" />
            </div>
            <div className="col-span-2">
              <Label>Resolution Status</Label>
              <Select value={form.resolution_status || 'unresolved'} onValueChange={(v) => setForm({ ...form, resolution_status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unresolved">Unresolved</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete discrepancy?</AlertDialogTitle>
            <AlertDialogDescription>Sigurado ka bang ide-delete ang record na ito?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteId) deleteMutation.mutate(deleteId); setDeleteId(null); }}
            >Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Discrepancies;
