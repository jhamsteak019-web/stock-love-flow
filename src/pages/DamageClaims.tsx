import { useState, useMemo, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { useToast } from '@/hooks/use-toast';
import { AlertTriangle, Plus, Upload, Search, X, Trash2, Pencil, ChevronLeft, ChevronRight, FileWarning, Package, Calendar as CalendarIcon, ClipboardList, FileDown } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format, parse } from 'date-fns';
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

const getStatusColor = (status: string | null) => {
  if (!status) return '';
  const s = status.toLowerCase();
  if (s.includes('approved') || s.includes('completed') || s.includes('done')) return 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800';
  if (s.includes('pending') || s.includes('process')) return 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800';
  if (s.includes('reject') || s.includes('denied')) return 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800';
  return 'bg-muted text-muted-foreground border-border';
};

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
        branch_name: item.branch_name || '',
        sspoa_no: item.sspoa_no || null,
        sspoa_mhb: item.sspoa_mhb || null,
        sspoa_mlp: item.sspoa_mlp || null,
        sspoa_msh: item.sspoa_msh || null,
        sspoa_mum: item.sspoa_mum || null,
        cat_mhb: item.cat_mhb || 0,
        cat_mlp: item.cat_mlp || 0,
        cat_msh: item.cat_msh || 0,
        cat_mum: item.cat_mum || 0,
        total: item.total || 0,
        damage: item.damage || null,
        date_sent: item.date_sent || null,
        status: item.status || null,
        remarks: item.remarks || null,
        box_qty: item.box_qty || 0,
        date_of_backload: item.date_of_backload || null,
        date_of_received: item.date_of_received || null,
        remarks2: item.remarks2 || null,
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
    onError: (err: any) => toast({ title: 'Error', description: err?.message || 'Failed to delete', variant: 'destructive' }),
  });

  const handleFormChange = useCallback((field: string, value: string | number) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value };
      if (['cat_mhb', 'cat_mlp', 'cat_msh', 'cat_mum'].includes(field)) {
        updated.total = (Number(updated.cat_mhb) || 0) + (Number(updated.cat_mlp) || 0) + (Number(updated.cat_msh) || 0) + (Number(updated.cat_mum) || 0);
      }
      return updated;
    });
  }, []);

  const handleExportPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Damage Claims Report', pageWidth / 2, 15, { align: 'center' });
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${format(new Date(), 'MMM dd, yyyy hh:mm a')}  |  Total Records: ${filtered.length}`, pageWidth / 2, 21, { align: 'center' });

    const headers = [['Branch', 'SSPOA No.', 'S-MHB', 'S-MLP', 'S-MSH', 'S-MUM', 'MHB', 'MLP', 'MSH', 'MUM', 'Total', 'Damage', 'Date Sent', 'Status', 'Remarks', 'Box Qty', 'Backload', 'Received', 'Remarks 2']];

    const body = filtered.map(c => [
      c.branch_name || '',
      c.sspoa_no || '',
      c.sspoa_mhb || '',
      c.sspoa_mlp || '',
      c.sspoa_msh || '',
      c.sspoa_mum || '',
      c.cat_mhb || '',
      c.cat_mlp || '',
      c.cat_msh || '',
      c.cat_mum || '',
      c.total || 0,
      c.damage || '',
      c.date_sent || '',
      c.status || '',
      c.remarks || '',
      c.box_qty || '',
      c.date_of_backload || '',
      c.date_of_received || '',
      c.remarks2 || '',
    ]);

    // Grand total row
    body.push([
      'GRAND TOTAL', '', '', '', '', '',
      totals.cat_mhb || 0, totals.cat_mlp || 0, totals.cat_msh || 0, totals.cat_mum || 0,
      totals.total || 0, '', '', '', '', totals.box_qty || 0, '', '', ''
    ]);

    autoTable(doc, {
      head: headers,
      body,
      startY: 26,
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 1.5, overflow: 'linebreak', lineWidth: 0.1 },
      headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold', fontSize: 7, halign: 'center' },
      columnStyles: {
        0: { cellWidth: 22 },
        10: { fontStyle: 'bold', halign: 'center' },
      },
      didParseCell: (data) => {
        // Style grand total row
        if (data.row.index === body.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [240, 240, 255];
        }
        // Center number columns
        if (data.column.index >= 2 && data.column.index <= 10) {
          data.cell.styles.halign = 'center';
        }
        if (data.column.index === 15) {
          data.cell.styles.halign = 'center';
        }
      },
      margin: { left: 5, right: 5 },
    });

    doc.save(`Damage_Claims_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
    toast({ title: 'PDF Downloaded', description: 'Damage Claims report saved as PDF' });
  };

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
    <div className="space-y-6 animate-fade-in">
      {/* Header Card */}
      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-destructive/10 shadow-sm">
              <AlertTriangle className="h-6 w-6 text-destructive" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Damage Claims</h1>
              <p className="text-sm text-muted-foreground mt-0.5">Track and manage product damage reports</p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search claims..."
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                className="pl-9 w-[220px] h-9"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 hover:bg-muted rounded-full p-0.5 transition-colors">
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              )}
            </div>
            <Button size="sm" variant="outline" onClick={handleExportPDF} className="h-9 gap-1.5">
              <FileDown className="h-4 w-4" /> Save PDF
            </Button>
            {canUpload && (
              <>
                <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} className="h-9 gap-1.5">
                  <Upload className="h-4 w-4" /> Import
                </Button>
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImport} />
                <Button size="sm" onClick={handleAdd} className="h-9 gap-1.5">
                  <Plus className="h-4 w-4" /> Add Claim
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="rounded-xl border bg-card p-4 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2 mb-2">
            <ClipboardList className="h-4 w-4 text-primary" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Records</span>
          </div>
          <p className="text-2xl font-bold">{filtered.length}</p>
        </div>
        {[
          { label: 'MHB', value: totals.cat_mhb, color: 'text-blue-600 dark:text-blue-400' },
          { label: 'MLP', value: totals.cat_mlp, color: 'text-violet-600 dark:text-violet-400' },
          { label: 'MSH', value: totals.cat_msh, color: 'text-emerald-600 dark:text-emerald-400' },
          { label: 'MUM', value: totals.cat_mum, color: 'text-orange-600 dark:text-orange-400' },
        ].map(item => (
          <div key={item.label} className="rounded-xl border bg-card p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 mb-2">
              <Package className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{item.label}</span>
            </div>
            <p className={cn("text-2xl font-bold", item.color)}>{item.value || 0}</p>
          </div>
        ))}
        <div className="rounded-xl border bg-primary/5 p-4 shadow-sm hover:shadow-md transition-shadow border-primary/20">
          <div className="flex items-center gap-2 mb-2">
            <FileWarning className="h-4 w-4 text-primary" />
            <span className="text-xs font-medium text-primary uppercase tracking-wider">Total</span>
          </div>
          <p className="text-2xl font-bold text-primary">{totals.total}</p>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto" style={{ maxHeight: 'calc(100vh - 380px)' }}>
          <table className="w-full text-sm" style={{ minWidth: '2200px' }}>
            <thead className="sticky top-0 z-10">
              <tr className="bg-muted/70 border-b">
                <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wider whitespace-nowrap" style={{ minWidth: 140 }}>Branch Name</th>
                <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wider whitespace-nowrap" style={{ minWidth: 120 }}>SSPOA No.</th>
                <th className="px-4 py-3 text-center font-semibold text-xs uppercase tracking-wider whitespace-nowrap border-l border-border/50" colSpan={4}>
                  <span className="text-blue-600 dark:text-blue-400">SSPOA Numbers</span>
                </th>
                <th className="px-4 py-3 text-center font-semibold text-xs uppercase tracking-wider whitespace-nowrap border-l border-border/50" colSpan={4}>
                  <span className="text-violet-600 dark:text-violet-400">Category</span>
                </th>
                <th className="px-4 py-3 text-center font-bold text-xs uppercase tracking-wider whitespace-nowrap border-l border-border/50 bg-primary/5" style={{ minWidth: 70 }}>
                  <span className="text-primary">Total</span>
                </th>
                <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wider whitespace-nowrap border-l border-border/50" style={{ minWidth: 90 }}>Damage</th>
                <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wider whitespace-nowrap" style={{ minWidth: 120 }}>
                  Date Sent<br/><span className="text-[10px] font-normal normal-case text-muted-foreground">(SM Head Office)</span>
                </th>
                <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wider whitespace-nowrap" style={{ minWidth: 100 }}>Status</th>
                <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wider whitespace-nowrap" style={{ minWidth: 100 }}>Remarks</th>
                <th className="px-4 py-3 text-center font-semibold text-xs uppercase tracking-wider whitespace-nowrap border-l border-border/50" style={{ minWidth: 70 }}>
                  Box<br/><span className="text-[10px] font-normal normal-case text-muted-foreground">(qty)</span>
                </th>
                <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wider whitespace-nowrap" style={{ minWidth: 120 }}>
                  Backload<br/><span className="text-[10px] font-normal normal-case text-muted-foreground">(SM Store)</span>
                </th>
                <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wider whitespace-nowrap" style={{ minWidth: 120 }}>
                  Received<br/><span className="text-[10px] font-normal normal-case text-muted-foreground">(Warehouse)</span>
                </th>
                <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wider whitespace-nowrap" style={{ minWidth: 100 }}>Remarks 2</th>
                {(canEdit || canDelete) && <th className="px-4 py-3 text-center font-semibold text-xs uppercase tracking-wider whitespace-nowrap sticky right-0 bg-muted/70" style={{ minWidth: 90 }}>Actions</th>}
              </tr>
              {/* Sub-headers */}
              <tr className="bg-muted/40 border-b">
                <th className="px-4 py-1.5"></th>
                <th className="px-4 py-1.5"></th>
                {['MHB', 'MLP', 'MSH', 'MUM'].map((label, i) => (
                  <th key={label} className={cn("px-4 py-1.5 text-center text-[10px] font-semibold uppercase tracking-widest text-blue-600/70 dark:text-blue-400/70", i === 0 && "border-l border-border/50")} style={{ minWidth: 70 }}>{label}</th>
                ))}
                {['MHB', 'MLP', 'MSH', 'MUM'].map((label, i) => (
                  <th key={`cat-${label}`} className={cn("px-4 py-1.5 text-center text-[10px] font-semibold uppercase tracking-widest text-violet-600/70 dark:text-violet-400/70", i === 0 && "border-l border-border/50")} style={{ minWidth: 70 }}>{label}</th>
                ))}
                <th className="px-4 py-1.5 border-l border-border/50"></th>
                <th className="px-4 py-1.5"></th>
                <th className="px-4 py-1.5"></th>
                <th className="px-4 py-1.5"></th>
                <th className="px-4 py-1.5"></th>
                <th className="px-4 py-1.5 border-l border-border/50"></th>
                <th className="px-4 py-1.5"></th>
                <th className="px-4 py-1.5"></th>
                <th className="px-4 py-1.5"></th>
                {(canEdit || canDelete) && <th className="px-4 py-1.5 sticky right-0 bg-muted/40"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {isLoading ? (
                <tr><td colSpan={20} className="text-center py-16">
                  <div className="flex flex-col items-center gap-3">
                    <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full spin-smooth" />
                    <span className="text-muted-foreground text-sm">Loading claims...</span>
                  </div>
                </td></tr>
              ) : paginated.length === 0 ? (
                <tr><td colSpan={20} className="text-center py-16">
                  <div className="flex flex-col items-center gap-3">
                    <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
                      <FileWarning className="h-7 w-7 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">No records found</p>
                      <p className="text-sm text-muted-foreground mt-0.5">Add a new claim or adjust your search</p>
                    </div>
                  </div>
                </td></tr>
              ) : (
                <>
                  {paginated.map((c, idx) => (
                    <tr key={c.id} className={cn(
                      "hover:bg-muted/40 transition-colors group",
                      idx % 2 === 0 ? 'bg-transparent' : 'bg-muted/10'
                    )}>
                      <td className="px-4 py-2.5 font-semibold whitespace-nowrap text-foreground">{c.branch_name}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap font-mono text-xs">{c.sspoa_no}</td>
                      <td className="px-4 py-2.5 text-center font-mono text-xs border-l border-border/30">{c.sspoa_mhb}</td>
                      <td className="px-4 py-2.5 text-center font-mono text-xs">{c.sspoa_mlp}</td>
                      <td className="px-4 py-2.5 text-center font-mono text-xs">{c.sspoa_msh}</td>
                      <td className="px-4 py-2.5 text-center font-mono text-xs">{c.sspoa_mum}</td>
                      <td className="px-4 py-2.5 text-center font-semibold border-l border-border/30 text-blue-600 dark:text-blue-400">{c.cat_mhb || ''}</td>
                      <td className="px-4 py-2.5 text-center font-semibold text-violet-600 dark:text-violet-400">{c.cat_mlp || ''}</td>
                      <td className="px-4 py-2.5 text-center font-semibold text-emerald-600 dark:text-emerald-400">{c.cat_msh || ''}</td>
                      <td className="px-4 py-2.5 text-center font-semibold text-orange-600 dark:text-orange-400">{c.cat_mum || ''}</td>
                      <td className="px-4 py-2.5 text-center font-bold text-primary border-l border-border/30 bg-primary/5">{c.total || 0}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap border-l border-border/30">{c.damage}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">{c.date_sent}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        {c.status ? (
                          <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border", getStatusColor(c.status))}>
                            {c.status}
                          </span>
                        ) : ''}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">{c.remarks}</td>
                      <td className="px-4 py-2.5 text-center font-semibold border-l border-border/30">{c.box_qty || ''}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">{c.date_of_backload}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">{c.date_of_received}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">{c.remarks2}</td>
                      {(canEdit || canDelete) && (
                        <td className="px-4 py-2.5 text-center sticky right-0 bg-card group-hover:bg-muted/40 transition-colors">
                          <div className="flex items-center justify-center gap-0.5">
                            {canEdit && (
                              <Button size="icon" variant="ghost" className="h-7 w-7 hover:bg-primary/10 hover:text-primary" onClick={() => handleEdit(c)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {canDelete && (
                              <Button size="icon" variant="ghost" className="h-7 w-7 hover:bg-destructive/10 hover:text-destructive" onClick={() => setDeleteId(c.id)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                  {/* Totals row */}
                  <tr className="bg-muted/60 font-bold border-t-2 border-primary/20 sticky bottom-0">
                    <td className="px-4 py-3 text-sm uppercase tracking-wider">Grand Total</td>
                    <td className="px-4 py-3"></td>
                    <td className="px-4 py-3 border-l border-border/30"></td>
                    <td className="px-4 py-3"></td>
                    <td className="px-4 py-3"></td>
                    <td className="px-4 py-3"></td>
                    <td className="px-4 py-3 text-center text-blue-600 dark:text-blue-400 border-l border-border/30">{totals.cat_mhb || ''}</td>
                    <td className="px-4 py-3 text-center text-violet-600 dark:text-violet-400">{totals.cat_mlp || ''}</td>
                    <td className="px-4 py-3 text-center text-emerald-600 dark:text-emerald-400">{totals.cat_msh || ''}</td>
                    <td className="px-4 py-3 text-center text-orange-600 dark:text-orange-400">{totals.cat_mum || ''}</td>
                    <td className="px-4 py-3 text-center text-primary bg-primary/10 border-l border-border/30 text-base">{totals.total}</td>
                    <td className="px-4 py-3 border-l border-border/30"></td>
                    <td className="px-4 py-3"></td>
                    <td className="px-4 py-3"></td>
                    <td className="px-4 py-3"></td>
                    <td className="px-4 py-3 text-center border-l border-border/30">{totals.box_qty || ''}</td>
                    <td className="px-4 py-3"></td>
                    <td className="px-4 py-3"></td>
                    <td className="px-4 py-3"></td>
                    {(canEdit || canDelete) && <td className="px-4 py-3 sticky right-0 bg-muted/60"></td>}
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between rounded-xl border bg-card p-3 shadow-sm">
          <p className="text-sm text-muted-foreground">
            Showing <span className="font-semibold text-foreground">{(currentPage - 1) * ITEMS_PER_PAGE + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)}</span> of <span className="font-semibold text-foreground">{filtered.length}</span>
          </p>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="h-8 w-8 p-0">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let page: number;
              if (totalPages <= 5) page = i + 1;
              else if (currentPage <= 3) page = i + 1;
              else if (currentPage >= totalPages - 2) page = totalPages - 4 + i;
              else page = currentPage - 2 + i;
              return (
                <Button
                  key={page}
                  size="sm"
                  variant={currentPage === page ? 'default' : 'outline'}
                  onClick={() => setCurrentPage(page)}
                  className="h-8 w-8 p-0 text-xs"
                >
                  {page}
                </Button>
              );
            })}
            <Button size="sm" variant="outline" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} className="h-8 w-8 p-0">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editingItem ? <Pencil className="h-5 w-5 text-primary" /> : <Plus className="h-5 w-5 text-primary" />}
              {editingItem ? 'Edit' : 'Add'} Damage Claim
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            {/* Basic Info */}
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Basic Information</h3>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">Branch Name *</Label><Input value={formData.branch_name || ''} onChange={e => handleFormChange('branch_name', e.target.value)} className="mt-1" /></div>
                <div><Label className="text-xs">SSPOA No.</Label><Input value={formData.sspoa_no || ''} onChange={e => handleFormChange('sspoa_no', e.target.value)} className="mt-1" /></div>
              </div>
            </div>
            {/* SSPOA Numbers */}
            <div>
              <h3 className="text-sm font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-3">SSPOA Numbers</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div><Label className="text-xs">MHB</Label><Input value={formData.sspoa_mhb || ''} onChange={e => handleFormChange('sspoa_mhb', e.target.value)} className="mt-1" /></div>
                <div><Label className="text-xs">MLP</Label><Input value={formData.sspoa_mlp || ''} onChange={e => handleFormChange('sspoa_mlp', e.target.value)} className="mt-1" /></div>
                <div><Label className="text-xs">MSH</Label><Input value={formData.sspoa_msh || ''} onChange={e => handleFormChange('sspoa_msh', e.target.value)} className="mt-1" /></div>
                <div><Label className="text-xs">MUM</Label><Input value={formData.sspoa_mum || ''} onChange={e => handleFormChange('sspoa_mum', e.target.value)} className="mt-1" /></div>
              </div>
            </div>
            {/* Category */}
            <div>
              <h3 className="text-sm font-semibold text-violet-600 dark:text-violet-400 uppercase tracking-wider mb-3">Category Quantities</h3>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div><Label className="text-xs">MHB</Label><Input type="number" value={formData.cat_mhb || ''} onChange={e => handleFormChange('cat_mhb', Number(e.target.value))} className="mt-1" /></div>
                <div><Label className="text-xs">MLP</Label><Input type="number" value={formData.cat_mlp || ''} onChange={e => handleFormChange('cat_mlp', Number(e.target.value))} className="mt-1" /></div>
                <div><Label className="text-xs">MSH</Label><Input type="number" value={formData.cat_msh || ''} onChange={e => handleFormChange('cat_msh', Number(e.target.value))} className="mt-1" /></div>
                <div><Label className="text-xs">MUM</Label><Input type="number" value={formData.cat_mum || ''} onChange={e => handleFormChange('cat_mum', Number(e.target.value))} className="mt-1" /></div>
                <div><Label className="text-xs font-bold text-primary">Total</Label><Input type="number" value={formData.total || 0} readOnly className="mt-1 bg-primary/5 border-primary/20 font-bold text-primary" /></div>
              </div>
            </div>
            {/* Details */}
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Claim Details</h3>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">Damage</Label><Input value={formData.damage || ''} onChange={e => handleFormChange('damage', e.target.value)} className="mt-1" /></div>
                <div><Label className="text-xs">Status</Label><Input value={formData.status || ''} onChange={e => handleFormChange('status', e.target.value)} className="mt-1" /></div>
                <div>
                  <Label className="text-xs">Date Sent (SM Head Office)</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full mt-1 justify-start text-left font-normal h-9 text-sm", !formData.date_sent && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {formData.date_sent || <span>Pick a date</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 z-[9999]" align="start">
                      <Calendar mode="single" selected={formData.date_sent ? new Date(formData.date_sent) : undefined} onSelect={(date) => handleFormChange('date_sent', date ? format(date, 'yyyy-MM-dd') : '')} initialFocus className="p-3 pointer-events-auto" />
                    </PopoverContent>
                  </Popover>
                </div>
                <div><Label className="text-xs">Box (qty)</Label><Input type="number" value={formData.box_qty || ''} onChange={e => handleFormChange('box_qty', Number(e.target.value))} className="mt-1" /></div>
                <div><Label className="text-xs">Remarks</Label><Input value={formData.remarks || ''} onChange={e => handleFormChange('remarks', e.target.value)} className="mt-1" /></div>
                <div>
                  <Label className="text-xs">Date of Backload (SM Store)</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full mt-1 justify-start text-left font-normal h-9 text-sm", !formData.date_of_backload && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {formData.date_of_backload || <span>Pick a date</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 z-[9999]" align="start">
                      <Calendar mode="single" selected={formData.date_of_backload ? new Date(formData.date_of_backload) : undefined} onSelect={(date) => handleFormChange('date_of_backload', date ? format(date, 'yyyy-MM-dd') : '')} initialFocus className="p-3 pointer-events-auto" />
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <Label className="text-xs">Date of Received (Warehouse)</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full mt-1 justify-start text-left font-normal h-9 text-sm", !formData.date_of_received && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {formData.date_of_received || <span>Pick a date</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 z-[9999]" align="start">
                      <Calendar mode="single" selected={formData.date_of_received ? new Date(formData.date_of_received) : undefined} onSelect={(date) => handleFormChange('date_of_received', date ? format(date, 'yyyy-MM-dd') : '')} initialFocus className="p-3 pointer-events-auto" />
                    </PopoverContent>
                  </Popover>
                </div>
                <div><Label className="text-xs">Remarks 2</Label><Input value={formData.remarks2 || ''} onChange={e => handleFormChange('remarks2', e.target.value)} className="mt-1" /></div>
              </div>
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowAddModal(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={addMutation.isPending || updateMutation.isPending}>
              {(addMutation.isPending || updateMutation.isPending) && <div className="h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full spin-smooth mr-2" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Preview Modal */}
      <Dialog open={showImportModal} onOpenChange={setShowImportModal}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-primary" />
              Import Preview
              <Badge variant="secondary" className="ml-2">{importPreview.length} records</Badge>
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-x-auto max-h-[60vh] rounded-lg border">
            <table className="w-full text-xs">
              <thead className="bg-muted sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Branch</th>
                  <th className="px-3 py-2 text-center font-semibold">MHB</th>
                  <th className="px-3 py-2 text-center font-semibold">MLP</th>
                  <th className="px-3 py-2 text-center font-semibold">MSH</th>
                  <th className="px-3 py-2 text-center font-semibold">MUM</th>
                  <th className="px-3 py-2 text-center font-bold text-primary">Total</th>
                  <th className="px-3 py-2 text-left font-semibold">Damage</th>
                  <th className="px-3 py-2 text-left font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {importPreview.map((item, i) => (
                  <tr key={i} className={i % 2 === 0 ? '' : 'bg-muted/20'}>
                    <td className="px-3 py-1.5 font-medium">{item.branch_name}</td>
                    <td className="px-3 py-1.5 text-center">{item.cat_mhb}</td>
                    <td className="px-3 py-1.5 text-center">{item.cat_mlp}</td>
                    <td className="px-3 py-1.5 text-center">{item.cat_msh}</td>
                    <td className="px-3 py-1.5 text-center">{item.cat_mum}</td>
                    <td className="px-3 py-1.5 text-center font-bold text-primary">{item.total}</td>
                    <td className="px-3 py-1.5">{item.damage}</td>
                    <td className="px-3 py-1.5">{item.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowImportModal(false); setImportPreview([]); }}>Cancel</Button>
            <Button onClick={confirmImport} disabled={addMutation.isPending} className="gap-1.5">
              {addMutation.isPending && <div className="h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full spin-smooth" />}
              <Upload className="h-4 w-4" />
              Import {importPreview.length} records
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              Delete this record?
            </AlertDialogTitle>
            <AlertDialogDescription>This action will remove the damage claim record. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteId) deleteMutation.mutate(deleteId); setDeleteId(null); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default DamageClaims;
