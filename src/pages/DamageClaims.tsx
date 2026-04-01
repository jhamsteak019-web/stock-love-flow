import { useState, useMemo, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { useToast } from '@/hooks/use-toast';
import { AlertTriangle, Plus, Upload, Search, X, Trash2, Pencil, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';

interface DamageClaim {
  id: string;
  branch_name: string;
  sspoa_no: string | null;
  sspoa_mhb: string | null;
  sspoa_mlp: string | null;
  sspoa_msh: string | null;
  sspoa_mum: string | null;
  cat_mhb: number | null;
  cat_mlp: number | null;
  cat_msh: number | null;
  cat_mum: number | null;
  total: number | null;
  damage: string | null;
  date_sent: string | null;
  status: string | null;
  remarks: string | null;
  box_qty: number | null;
  date_of_backload: string | null;
  date_of_received: string | null;
  remarks2: string | null;
  branch_id: string | null;
  created_by: string | null;
  created_at: string;
}

const ITEMS_PER_PAGE = 30;

const emptyForm = (): Partial<DamageClaim> => ({
  branch_name: '',
  sspoa_no: '',
  sspoa_mhb: '',
  sspoa_mlp: '',
  sspoa_msh: '',
  sspoa_mum: '',
  cat_mhb: 0,
  cat_mlp: 0,
  cat_msh: 0,
  cat_mum: 0,
  total: 0,
  damage: '',
  date_sent: '',
  status: '',
  remarks: '',
  box_qty: 0,
  date_of_backload: '',
  date_of_received: '',
  remarks2: '',
});

const DamageClaims = () => {
  const { user, userRole } = useAuth();
  const { selectedBranch } = useBranch();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState<DamageClaim | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<DamageClaim>>(emptyForm());
  const [importPreview, setImportPreview] = useState<Partial<DamageClaim>[]>([]);
  const [showImportModal, setShowImportModal] = useState(false);

  const isAdmin = userRole === 'admin';
  const canUpload = ['admin', 'staff', 'encoder', 'assistant'].includes(userRole || '');
  const canEdit = ['admin', 'assistant'].includes(userRole || '');
  const canDelete = isAdmin;

  // Fetch data
  const { data: claims = [], isLoading } = useQuery({
    queryKey: ['damage-claims', selectedBranch?.id],
    queryFn: async () => {
      let query = supabase
        .from('damage_claims')
        .select('*')
        .is('deleted_at', null)
        .order('branch_name', { ascending: true });
      if (selectedBranch?.id) {
        query = query.eq('branch_id', selectedBranch.id);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as DamageClaim[];
    },
  });

  // Filtered + paginated
  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return claims;
    const q = searchQuery.toLowerCase();
    return claims.filter(c =>
      c.branch_name.toLowerCase().includes(q) ||
      c.sspoa_no?.toLowerCase().includes(q) ||
      c.damage?.toLowerCase().includes(q) ||
      c.status?.toLowerCase().includes(q) ||
      c.remarks?.toLowerCase().includes(q)
    );
  }, [claims, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginated = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  // Totals
  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, c) => ({
        cat_mhb: acc.cat_mhb + (c.cat_mhb || 0),
        cat_mlp: acc.cat_mlp + (c.cat_mlp || 0),
        cat_msh: acc.cat_msh + (c.cat_msh || 0),
        cat_mum: acc.cat_mum + (c.cat_mum || 0),
        total: acc.total + (c.total || 0),
        box_qty: acc.box_qty + (c.box_qty || 0),
      }),
      { cat_mhb: 0, cat_mlp: 0, cat_msh: 0, cat_mum: 0, total: 0, box_qty: 0 }
    );
  }, [filtered]);

  // Mutations
  const addMutation = useMutation({
    mutationFn: async (items: Partial<DamageClaim>[]) => {
      const inserts = items.map(item => ({
        ...item,
        branch_id: selectedBranch?.id || null,
        created_by: user?.email || null,
      }));
      const { error } = await supabase.from('damage_claims').insert(inserts);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['damage-claims'] });
      toast({ title: 'Success', description: 'Damage claim(s) added' });
    },
    onError: () => toast({ title: 'Error', description: 'Failed to add', variant: 'destructive' }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<DamageClaim> & { id: string }) => {
      const { error } = await supabase.from('damage_claims').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['damage-claims'] });
      toast({ title: 'Success', description: 'Updated' });
    },
    onError: () => toast({ title: 'Error', description: 'Failed to update', variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('damage_claims').update({ deleted_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['damage-claims'] });
      toast({ title: 'Deleted', description: 'Damage claim removed' });
    },
    onError: () => toast({ title: 'Error', description: 'Failed to delete', variant: 'destructive' }),
  });

  // Form handlers
  const handleFormChange = useCallback((field: string, value: string | number) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value };
      // Auto-calculate total
      if (['cat_mhb', 'cat_mlp', 'cat_msh', 'cat_mum'].includes(field)) {
        updated.total = (Number(updated.cat_mhb) || 0) + (Number(updated.cat_mlp) || 0) + (Number(updated.cat_msh) || 0) + (Number(updated.cat_mum) || 0);
      }
      return updated;
    });
  }, []);

  const handleAdd = () => {
    setFormData(emptyForm());
    setEditingItem(null);
    setShowAddModal(true);
  };

  const handleEdit = (item: DamageClaim) => {
    setEditingItem(item);
    setFormData({ ...item });
    setShowAddModal(true);
  };

  const handleSave = () => {
    if (!formData.branch_name?.trim()) {
      toast({ title: 'Error', description: 'Branch Name is required', variant: 'destructive' });
      return;
    }
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, ...formData });
    } else {
      addMutation.mutate([formData]);
    }
    setShowAddModal(false);
  };

  // Import Excel
  const handleImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
        
        const parsed: Partial<DamageClaim>[] = rows.map(row => {
          const catMhb = Number(row['MHB'] || row['cat_mhb'] || row['CATEGORY MHB'] || 0) || 0;
          const catMlp = Number(row['MLP'] || row['cat_mlp'] || row['CATEGORY MLP'] || 0) || 0;
          const catMsh = Number(row['MSH'] || row['cat_msh'] || row['CATEGORY MSH'] || 0) || 0;
          const catMum = Number(row['MUM'] || row['cat_mum'] || row['CATEGORY MUM'] || 0) || 0;
          return {
            branch_name: String(row['BRANCH NAME'] || row['branch_name'] || ''),
            sspoa_no: String(row['SSPOA NO.'] || row['sspoa_no'] || ''),
            sspoa_mhb: String(row['SSPOA MHB'] || row['sspoa_mhb'] || row['SSPOA NO. MHB'] || ''),
            sspoa_mlp: String(row['SSPOA MLP'] || row['sspoa_mlp'] || row['SSPOA NO. MLP'] || ''),
            sspoa_msh: String(row['SSPOA MSH'] || row['sspoa_msh'] || row['SSPOA NO. MSH'] || ''),
            sspoa_mum: String(row['SSPOA MUM'] || row['sspoa_mum'] || row['SSPOA NO. MUM'] || ''),
            cat_mhb: catMhb,
            cat_mlp: catMlp,
            cat_msh: catMsh,
            cat_mum: catMum,
            total: catMhb + catMlp + catMsh + catMum,
            damage: String(row['DAMAGE'] || row['damage'] || ''),
            date_sent: String(row['Date Sent'] || row['Date Sent (SM Head Office)'] || row['date_sent'] || ''),
            status: String(row['STATUS'] || row['status'] || ''),
            remarks: String(row['REMARKS'] || row['remarks'] || ''),
            box_qty: Number(row['Box (qty)'] || row['box_qty'] || 0) || 0,
            date_of_backload: String(row['Date of Backload'] || row['Date of Backload (SM Store)'] || row['date_of_backload'] || ''),
            date_of_received: String(row['Date of Received'] || row['Date of Received (Warehouse)'] || row['date_of_received'] || ''),
            remarks2: String(row['REMARKS2'] || row['remarks2'] || ''),
          };
        }).filter(r => r.branch_name?.trim());

        if (parsed.length === 0) {
          toast({ title: 'Error', description: 'No valid data found in file', variant: 'destructive' });
          return;
        }
        setImportPreview(parsed);
        setShowImportModal(true);
      } catch {
        toast({ title: 'Error', description: 'Failed to parse file', variant: 'destructive' });
      }
    };
    reader.readAsBinaryString(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [toast]);

  const confirmImport = () => {
    addMutation.mutate(importPreview);
    setShowImportModal(false);
    setImportPreview([]);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10">
            <AlertTriangle className="h-5 w-5 text-destructive" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Damage Claims</h1>
            <p className="text-sm text-muted-foreground">{filtered.length} records</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="pl-9 w-[200px]"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-2 top-2.5">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </div>
          {canUpload && (
            <>
              <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-4 w-4 mr-1" /> Import
              </Button>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImport} />
              <Button size="sm" onClick={handleAdd}>
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto" style={{ maxHeight: 'calc(100vh - 220px)' }}>
          <table className="w-full text-sm" style={{ minWidth: '2200px' }}>
            <thead className="bg-muted/50 sticky top-0 z-10">
              <tr className="border-b">
                <th className="px-3 py-2 text-left font-semibold whitespace-nowrap" style={{ minWidth: 140 }}>BRANCH NAME</th>
                <th className="px-3 py-2 text-left font-semibold whitespace-nowrap" style={{ minWidth: 120 }}>SSPOA NO.</th>
                <th className="px-3 py-2 text-center font-semibold whitespace-nowrap bg-muted/30" colSpan={4}>SSPOA NO.</th>
                <th className="px-3 py-2 text-center font-semibold whitespace-nowrap bg-accent/20" colSpan={4}>CATEGORY</th>
                <th className="px-3 py-2 text-center font-bold whitespace-nowrap bg-primary/10" style={{ minWidth: 70 }}>TOTAL</th>
                <th className="px-3 py-2 text-left font-semibold whitespace-nowrap" style={{ minWidth: 90 }}>DAMAGE</th>
                <th className="px-3 py-2 text-left font-semibold whitespace-nowrap" style={{ minWidth: 120 }}>Date Sent<br/><span className="text-xs font-normal">(SM Head Office)</span></th>
                <th className="px-3 py-2 text-left font-semibold whitespace-nowrap" style={{ minWidth: 90 }}>STATUS</th>
                <th className="px-3 py-2 text-left font-semibold whitespace-nowrap" style={{ minWidth: 100 }}>REMARKS</th>
                <th className="px-3 py-2 text-center font-semibold whitespace-nowrap" style={{ minWidth: 70 }}>Box<br/>(qty)</th>
                <th className="px-3 py-2 text-left font-semibold whitespace-nowrap" style={{ minWidth: 120 }}>Date of Backload<br/><span className="text-xs font-normal">(SM Store)</span></th>
                <th className="px-3 py-2 text-left font-semibold whitespace-nowrap" style={{ minWidth: 120 }}>Date of Received<br/><span className="text-xs font-normal">(Warehouse)</span></th>
                <th className="px-3 py-2 text-left font-semibold whitespace-nowrap" style={{ minWidth: 100 }}>REMARKS</th>
                {(canEdit || canDelete) && <th className="px-3 py-2 text-center font-semibold whitespace-nowrap" style={{ minWidth: 80 }}>Actions</th>}
              </tr>
              {/* Sub-headers for SSPOA NO. and CATEGORY */}
              <tr className="border-b bg-muted/30">
                <th className="px-3 py-1"></th>
                <th className="px-3 py-1"></th>
                <th className="px-3 py-1 text-center text-xs font-medium" style={{ minWidth: 70 }}>MHB</th>
                <th className="px-3 py-1 text-center text-xs font-medium" style={{ minWidth: 70 }}>MLP</th>
                <th className="px-3 py-1 text-center text-xs font-medium" style={{ minWidth: 70 }}>MSH</th>
                <th className="px-3 py-1 text-center text-xs font-medium" style={{ minWidth: 70 }}>MUM</th>
                <th className="px-3 py-1 text-center text-xs font-medium bg-accent/10" style={{ minWidth: 70 }}>MHB</th>
                <th className="px-3 py-1 text-center text-xs font-medium bg-accent/10" style={{ minWidth: 70 }}>MLP</th>
                <th className="px-3 py-1 text-center text-xs font-medium bg-accent/10" style={{ minWidth: 70 }}>MSH</th>
                <th className="px-3 py-1 text-center text-xs font-medium bg-accent/10" style={{ minWidth: 70 }}>MUM</th>
                <th className="px-3 py-1"></th>
                <th className="px-3 py-1"></th>
                <th className="px-3 py-1"></th>
                <th className="px-3 py-1"></th>
                <th className="px-3 py-1"></th>
                <th className="px-3 py-1"></th>
                <th className="px-3 py-1"></th>
                <th className="px-3 py-1"></th>
                <th className="px-3 py-1"></th>
                {(canEdit || canDelete) && <th className="px-3 py-1"></th>}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={20} className="text-center py-8 text-muted-foreground">Loading...</td></tr>
              ) : paginated.length === 0 ? (
                <tr><td colSpan={20} className="text-center py-8 text-muted-foreground">No records found</td></tr>
              ) : (
                <>
                  {paginated.map((c) => (
                    <tr key={c.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2 font-medium whitespace-nowrap">{c.branch_name}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{c.sspoa_no}</td>
                      <td className="px-3 py-2 text-center">{c.sspoa_mhb}</td>
                      <td className="px-3 py-2 text-center">{c.sspoa_mlp}</td>
                      <td className="px-3 py-2 text-center">{c.sspoa_msh}</td>
                      <td className="px-3 py-2 text-center">{c.sspoa_mum}</td>
                      <td className="px-3 py-2 text-center bg-accent/5">{c.cat_mhb || ''}</td>
                      <td className="px-3 py-2 text-center bg-accent/5">{c.cat_mlp || ''}</td>
                      <td className="px-3 py-2 text-center bg-accent/5">{c.cat_msh || ''}</td>
                      <td className="px-3 py-2 text-center bg-accent/5">{c.cat_mum || ''}</td>
                      <td className="px-3 py-2 text-center font-bold bg-primary/5">{c.total || 0}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{c.damage}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{c.date_sent}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{c.status}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{c.remarks}</td>
                      <td className="px-3 py-2 text-center">{c.box_qty || ''}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{c.date_of_backload}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{c.date_of_received}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{c.remarks2}</td>
                      {(canEdit || canDelete) && (
                        <td className="px-3 py-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {canEdit && (
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleEdit(c)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {canDelete && (
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(c.id)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                  {/* Totals row */}
                  <tr className="border-t-2 bg-muted/50 font-bold">
                    <td className="px-3 py-2">Total</td>
                    <td className="px-3 py-2"></td>
                    <td className="px-3 py-2"></td>
                    <td className="px-3 py-2"></td>
                    <td className="px-3 py-2"></td>
                    <td className="px-3 py-2"></td>
                    <td className="px-3 py-2 text-center">{totals.cat_mhb || ''}</td>
                    <td className="px-3 py-2 text-center">{totals.cat_mlp || ''}</td>
                    <td className="px-3 py-2 text-center">{totals.cat_msh || ''}</td>
                    <td className="px-3 py-2 text-center">{totals.cat_mum || ''}</td>
                    <td className="px-3 py-2 text-center">{totals.total}</td>
                    <td className="px-3 py-2"></td>
                    <td className="px-3 py-2"></td>
                    <td className="px-3 py-2"></td>
                    <td className="px-3 py-2"></td>
                    <td className="px-3 py-2 text-center">{totals.box_qty || ''}</td>
                    <td className="px-3 py-2"></td>
                    <td className="px-3 py-2"></td>
                    <td className="px-3 py-2"></td>
                    {(canEdit || canDelete) && <td className="px-3 py-2"></td>}
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Page {currentPage} of {totalPages}</p>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="outline" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Edit' : 'Add'} Damage Claim</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Branch Name *</Label><Input value={formData.branch_name || ''} onChange={e => handleFormChange('branch_name', e.target.value)} /></div>
            <div><Label>SSPOA No.</Label><Input value={formData.sspoa_no || ''} onChange={e => handleFormChange('sspoa_no', e.target.value)} /></div>
            <div><Label>SSPOA MHB</Label><Input value={formData.sspoa_mhb || ''} onChange={e => handleFormChange('sspoa_mhb', e.target.value)} /></div>
            <div><Label>SSPOA MLP</Label><Input value={formData.sspoa_mlp || ''} onChange={e => handleFormChange('sspoa_mlp', e.target.value)} /></div>
            <div><Label>SSPOA MSH</Label><Input value={formData.sspoa_msh || ''} onChange={e => handleFormChange('sspoa_msh', e.target.value)} /></div>
            <div><Label>SSPOA MUM</Label><Input value={formData.sspoa_mum || ''} onChange={e => handleFormChange('sspoa_mum', e.target.value)} /></div>
            <div><Label>Category MHB</Label><Input type="number" value={formData.cat_mhb || ''} onChange={e => handleFormChange('cat_mhb', Number(e.target.value))} /></div>
            <div><Label>Category MLP</Label><Input type="number" value={formData.cat_mlp || ''} onChange={e => handleFormChange('cat_mlp', Number(e.target.value))} /></div>
            <div><Label>Category MSH</Label><Input type="number" value={formData.cat_msh || ''} onChange={e => handleFormChange('cat_msh', Number(e.target.value))} /></div>
            <div><Label>Category MUM</Label><Input type="number" value={formData.cat_mum || ''} onChange={e => handleFormChange('cat_mum', Number(e.target.value))} /></div>
            <div><Label>Total (auto)</Label><Input type="number" value={formData.total || 0} readOnly className="bg-muted" /></div>
            <div><Label>Damage</Label><Input value={formData.damage || ''} onChange={e => handleFormChange('damage', e.target.value)} /></div>
            <div><Label>Date Sent (SM Head Office)</Label><Input value={formData.date_sent || ''} onChange={e => handleFormChange('date_sent', e.target.value)} /></div>
            <div><Label>Status</Label><Input value={formData.status || ''} onChange={e => handleFormChange('status', e.target.value)} /></div>
            <div><Label>Remarks</Label><Input value={formData.remarks || ''} onChange={e => handleFormChange('remarks', e.target.value)} /></div>
            <div><Label>Box (qty)</Label><Input type="number" value={formData.box_qty || ''} onChange={e => handleFormChange('box_qty', Number(e.target.value))} /></div>
            <div><Label>Date of Backload (SM Store)</Label><Input value={formData.date_of_backload || ''} onChange={e => handleFormChange('date_of_backload', e.target.value)} /></div>
            <div><Label>Date of Received (Warehouse)</Label><Input value={formData.date_of_received || ''} onChange={e => handleFormChange('date_of_received', e.target.value)} /></div>
            <div className="col-span-2"><Label>Remarks 2</Label><Input value={formData.remarks2 || ''} onChange={e => handleFormChange('remarks2', e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddModal(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={addMutation.isPending || updateMutation.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Preview Modal */}
      <Dialog open={showImportModal} onOpenChange={setShowImportModal}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import Preview ({importPreview.length} records)</DialogTitle>
          </DialogHeader>
          <div className="overflow-x-auto max-h-[60vh]">
            <table className="w-full text-xs">
              <thead className="bg-muted sticky top-0">
                <tr>
                  <th className="px-2 py-1 text-left">Branch</th>
                  <th className="px-2 py-1">MHB</th>
                  <th className="px-2 py-1">MLP</th>
                  <th className="px-2 py-1">MSH</th>
                  <th className="px-2 py-1">MUM</th>
                  <th className="px-2 py-1">Total</th>
                  <th className="px-2 py-1 text-left">Damage</th>
                  <th className="px-2 py-1 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {importPreview.map((item, i) => (
                  <tr key={i} className="border-b">
                    <td className="px-2 py-1">{item.branch_name}</td>
                    <td className="px-2 py-1 text-center">{item.cat_mhb}</td>
                    <td className="px-2 py-1 text-center">{item.cat_mlp}</td>
                    <td className="px-2 py-1 text-center">{item.cat_msh}</td>
                    <td className="px-2 py-1 text-center">{item.cat_mum}</td>
                    <td className="px-2 py-1 text-center font-bold">{item.total}</td>
                    <td className="px-2 py-1">{item.damage}</td>
                    <td className="px-2 py-1">{item.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowImportModal(false); setImportPreview([]); }}>Cancel</Button>
            <Button onClick={confirmImport} disabled={addMutation.isPending}>Import {importPreview.length} records</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this record?</AlertDialogTitle>
            <AlertDialogDescription>This action will remove the damage claim record.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteId) deleteMutation.mutate(deleteId); setDeleteId(null); }} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default DamageClaims;
