import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';
import { Plus, Trash2, Save } from 'lucide-react';
import { format } from 'date-fns';

interface SalesRow {
  id?: string;
  category: string;
  mp: string;
  branch_name: string;
  mhb: number;
  mlp: number;
  msh: number;
  mum: number;
  ts: number;
  isNew?: boolean;
  isDirty?: boolean;
}

const Sales = () => {
  const { user, userRole } = useAuth();
  const [rows, setRows] = useState<SalesRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filterDate, setFilterDate] = useState<Date>(new Date());

  const fetchSales = async () => {
    setLoading(true);
    const dateStr = format(filterDate, 'yyyy-MM-dd');
    
    const { data, error } = await supabase
      .from('sales')
      .select('*')
      .eq('sale_date', dateStr)
      .order('category')
      .order('branch_name');

    if (error) {
      toast.error('Failed to fetch sales data');
      console.error(error);
    } else {
      const salesRows: SalesRow[] = (data || []).map(sale => ({
        id: sale.id,
        category: sale.category,
        mp: sale.mp,
        branch_name: sale.branch_name,
        mhb: Number(sale.mhb) || 0,
        mlp: Number(sale.mlp) || 0,
        msh: Number(sale.msh) || 0,
        mum: Number(sale.mum) || 0,
        ts: Number(sale.ts) || 0,
        isNew: false,
        isDirty: false,
      }));
      setRows(salesRows);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchSales();
  }, [filterDate]);

  const handleCellChange = (index: number, field: keyof SalesRow, value: string | number) => {
    setRows(prev => prev.map((row, i) => {
      if (i === index) {
        return { ...row, [field]: value, isDirty: true };
      }
      return row;
    }));
  };

  const addNewRow = () => {
    setRows(prev => [...prev, {
      category: '',
      mp: '',
      branch_name: '',
      mhb: 0,
      mlp: 0,
      msh: 0,
      mum: 0,
      ts: 0,
      isNew: true,
      isDirty: true,
    }]);
  };

  const deleteRow = async (index: number) => {
    const row = rows[index];
    
    if (row.id) {
      const { error } = await supabase.from('sales').delete().eq('id', row.id);
      if (error) {
        toast.error('Failed to delete row');
        return;
      }
    }
    
    setRows(prev => prev.filter((_, i) => i !== index));
    toast.success('Row deleted');
  };

  const saveAllChanges = async () => {
    setSaving(true);
    const dateStr = format(filterDate, 'yyyy-MM-dd');
    
    try {
      for (const row of rows) {
        if (!row.isDirty) continue;
        
        if (!row.category || !row.mp || !row.branch_name) {
          toast.error('Please fill in CAT, MP, and Branch Name for all rows');
          setSaving(false);
          return;
        }

        const rowData = {
          category: row.category,
          mp: row.mp,
          branch_name: row.branch_name,
          mhb: row.mhb,
          mlp: row.mlp,
          msh: row.msh,
          mum: row.mum,
          ts: row.ts,
          sale_date: dateStr,
          created_by: user?.id,
        };

        if (row.isNew) {
          const { error } = await supabase.from('sales').insert(rowData);
          if (error) throw error;
        } else if (row.id) {
          const { error } = await supabase.from('sales').update(rowData).eq('id', row.id);
          if (error) throw error;
        }
      }
      
      toast.success('All changes saved');
      fetchSales();
    } catch (error) {
      console.error(error);
      toast.error('Failed to save changes');
    }
    
    setSaving(false);
  };

  const hasChanges = rows.some(row => row.isDirty);

  // Calculate totals
  const totals = rows.reduce(
    (acc, row) => ({
      mhb: acc.mhb + Number(row.mhb || 0),
      mlp: acc.mlp + Number(row.mlp || 0),
      msh: acc.msh + Number(row.msh || 0),
      mum: acc.mum + Number(row.mum || 0),
      ts: acc.ts + Number(row.ts || 0),
    }),
    { mhb: 0, mlp: 0, msh: 0, mum: 0, ts: 0 }
  );

  const grandTotal = totals.mhb + totals.mlp + totals.msh + totals.mum + totals.ts;

  return (
    <div className="space-y-4">
      {/* Action buttons */}
      {userRole === 'admin' && (
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={addNewRow} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Row
          </Button>
          {hasChanges && (
            <Button onClick={saveAllChanges} disabled={saving} className="gap-2">
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : 'Save All'}
            </Button>
          )}
        </div>
      )}

      {/* Excel-like table */}
      <div className="overflow-x-auto border border-border rounded-lg bg-background">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : (
          <table className="w-full border-collapse text-sm">
            {/* Header Row 1 - Date spanning */}
            <thead>
              <tr className="border-b border-border">
                <th className="border border-border p-2 bg-muted/30 w-12"></th>
                <th className="border border-border p-2 bg-muted/30 w-16"></th>
                <th className="border border-border p-2 bg-muted/30 w-12"></th>
                <th className="border border-border p-2 bg-muted/30"></th>
                <th colSpan={5} className="border border-border p-2 bg-muted/30 text-center">
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="text-red-600 font-bold hover:underline cursor-pointer">
                        {format(filterDate, 'EEEE, MMMM d, yyyy')}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="center">
                      <Calendar
                        mode="single"
                        selected={filterDate}
                        onSelect={(date) => date && setFilterDate(date)}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </th>
                {userRole === 'admin' && <th className="border border-border p-2 bg-muted/30 w-10"></th>}
              </tr>
              {/* Header Row 2 - Column names */}
              <tr className="border-b border-border bg-muted/50">
                <th className="border border-border p-2 font-bold text-center w-12">No.</th>
                <th className="border border-border p-2 font-bold text-center w-16">CAT</th>
                <th className="border border-border p-2 font-bold text-center w-12">MP</th>
                <th className="border border-border p-2 font-bold text-left">METRO GROUP {format(filterDate, 'MMM yyyy').toUpperCase()}</th>
                <th className="border border-border p-2 font-bold text-center w-24">MHB</th>
                <th className="border border-border p-2 font-bold text-center w-24">MLP</th>
                <th className="border border-border p-2 font-bold text-center w-24">MSH</th>
                <th className="border border-border p-2 font-bold text-center w-24">MUM</th>
                <th className="border border-border p-2 font-bold text-center w-28">TS</th>
                {userRole === 'admin' && <th className="border border-border p-2 font-bold text-center w-10"></th>}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={userRole === 'admin' ? 10 : 9} className="text-center py-8 text-muted-foreground border border-border">
                    No sales records for this date. Click "Add Row" to start.
                  </td>
                </tr>
              ) : (
                rows.map((row, index) => (
                  <tr key={row.id || `new-${index}`} className={index % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
                    <td className="border border-border p-1 text-center font-medium">{index + 1}</td>
                    <td className="border border-border p-0">
                      <Input
                        value={row.category}
                        onChange={(e) => handleCellChange(index, 'category', e.target.value)}
                        className="h-8 text-center text-sm border-0 rounded-none focus-visible:ring-1 focus-visible:ring-inset"
                        disabled={userRole !== 'admin'}
                      />
                    </td>
                    <td className="border border-border p-0">
                      <Input
                        value={row.mp}
                        onChange={(e) => handleCellChange(index, 'mp', e.target.value)}
                        className="h-8 text-center text-sm border-0 rounded-none focus-visible:ring-1 focus-visible:ring-inset"
                        disabled={userRole !== 'admin'}
                      />
                    </td>
                    <td className="border border-border p-0">
                      <Input
                        value={row.branch_name}
                        onChange={(e) => handleCellChange(index, 'branch_name', e.target.value)}
                        className="h-8 text-sm border-0 rounded-none focus-visible:ring-1 focus-visible:ring-inset"
                        disabled={userRole !== 'admin'}
                      />
                    </td>
                    <td className="border border-border p-0">
                      <Input
                        type="number"
                        value={row.mhb || ''}
                        onChange={(e) => handleCellChange(index, 'mhb', Number(e.target.value) || 0)}
                        className="h-8 text-right text-sm tabular-nums border-0 rounded-none focus-visible:ring-1 focus-visible:ring-inset pr-2"
                        disabled={userRole !== 'admin'}
                      />
                    </td>
                    <td className="border border-border p-0">
                      <Input
                        type="number"
                        value={row.mlp || ''}
                        onChange={(e) => handleCellChange(index, 'mlp', Number(e.target.value) || 0)}
                        className="h-8 text-right text-sm tabular-nums border-0 rounded-none focus-visible:ring-1 focus-visible:ring-inset pr-2"
                        disabled={userRole !== 'admin'}
                      />
                    </td>
                    <td className="border border-border p-0">
                      <Input
                        type="number"
                        value={row.msh || ''}
                        onChange={(e) => handleCellChange(index, 'msh', Number(e.target.value) || 0)}
                        className="h-8 text-right text-sm tabular-nums border-0 rounded-none focus-visible:ring-1 focus-visible:ring-inset pr-2"
                        disabled={userRole !== 'admin'}
                      />
                    </td>
                    <td className="border border-border p-0">
                      <Input
                        type="number"
                        value={row.mum || ''}
                        onChange={(e) => handleCellChange(index, 'mum', Number(e.target.value) || 0)}
                        className="h-8 text-right text-sm tabular-nums border-0 rounded-none focus-visible:ring-1 focus-visible:ring-inset pr-2"
                        disabled={userRole !== 'admin'}
                      />
                    </td>
                    <td className="border border-border p-0">
                      <Input
                        type="number"
                        value={row.ts || ''}
                        onChange={(e) => handleCellChange(index, 'ts', Number(e.target.value) || 0)}
                        className="h-8 text-right text-sm tabular-nums border-0 rounded-none focus-visible:ring-1 focus-visible:ring-inset pr-2"
                        disabled={userRole !== 'admin'}
                      />
                    </td>
                    {userRole === 'admin' && (
                      <td className="border border-border p-0 text-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => deleteRow(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))
              )}
              {/* Totals Row */}
              {rows.length > 0 && (
                <tr className="bg-muted/50 font-bold border-t-2 border-primary">
                  <td className="border border-border p-2 text-center">{rows.length}</td>
                  <td className="border border-border p-2"></td>
                  <td className="border border-border p-2"></td>
                  <td className="border border-border p-2 text-right font-bold">Metro Sales Total</td>
                  <td className="border border-border p-2 text-right tabular-nums">{totals.mhb.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="border border-border p-2 text-right tabular-nums">{totals.mlp.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="border border-border p-2 text-right tabular-nums">{totals.msh.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="border border-border p-2 text-right tabular-nums">{totals.mum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="border border-border p-2 text-right tabular-nums font-bold">{grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  {userRole === 'admin' && <td className="border border-border p-2"></td>}
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default Sales;
