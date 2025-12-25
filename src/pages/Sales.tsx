import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';
import { CalendarIcon, Plus, Trash2, Save } from 'lucide-react';
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
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Metro Group Sales</h1>
          <p className="text-muted-foreground">Track daily sales by branch</p>
        </div>
        
        <div className="flex items-center gap-3">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="gap-2">
                <CalendarIcon className="h-4 w-4" />
                {format(filterDate, 'EEEE, MMMM d, yyyy')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={filterDate}
                onSelect={(date) => date && setFilterDate(date)}
                initialFocus
              />
            </PopoverContent>
          </Popover>

          {userRole === 'admin' && (
            <>
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
            </>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">
            METRO GROUP DEC 2025 - {format(filterDate, 'EEEE, MMMM d, yyyy')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-20 text-center font-bold">CAT</TableHead>
                    <TableHead className="w-16 text-center font-bold">MP</TableHead>
                    <TableHead className="w-48 font-bold">Branch Name</TableHead>
                    <TableHead className="w-28 text-center font-bold">MHB</TableHead>
                    <TableHead className="w-28 text-center font-bold">MLP</TableHead>
                    <TableHead className="w-28 text-center font-bold">MSH</TableHead>
                    <TableHead className="w-28 text-center font-bold">MUM</TableHead>
                    <TableHead className="w-28 text-center font-bold">TS</TableHead>
                    {userRole === 'admin' && <TableHead className="w-12"></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={userRole === 'admin' ? 9 : 8} className="text-center py-8 text-muted-foreground">
                        No sales records for this date. Click "Add Row" to start.
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((row, index) => (
                      <TableRow key={row.id || `new-${index}`} className={index % 2 === 0 ? 'bg-background' : 'bg-muted/30'}>
                        <TableCell className="p-1">
                          <Input
                            value={row.category}
                            onChange={(e) => handleCellChange(index, 'category', e.target.value)}
                            className="h-8 text-center text-sm"
                            disabled={userRole !== 'admin'}
                          />
                        </TableCell>
                        <TableCell className="p-1">
                          <Input
                            value={row.mp}
                            onChange={(e) => handleCellChange(index, 'mp', e.target.value)}
                            className="h-8 text-center text-sm"
                            disabled={userRole !== 'admin'}
                          />
                        </TableCell>
                        <TableCell className="p-1">
                          <Input
                            value={row.branch_name}
                            onChange={(e) => handleCellChange(index, 'branch_name', e.target.value)}
                            className="h-8 text-sm"
                            disabled={userRole !== 'admin'}
                          />
                        </TableCell>
                        <TableCell className="p-1">
                          <Input
                            type="number"
                            value={row.mhb || ''}
                            onChange={(e) => handleCellChange(index, 'mhb', Number(e.target.value) || 0)}
                            className="h-8 text-right text-sm tabular-nums"
                            disabled={userRole !== 'admin'}
                          />
                        </TableCell>
                        <TableCell className="p-1">
                          <Input
                            type="number"
                            value={row.mlp || ''}
                            onChange={(e) => handleCellChange(index, 'mlp', Number(e.target.value) || 0)}
                            className="h-8 text-right text-sm tabular-nums"
                            disabled={userRole !== 'admin'}
                          />
                        </TableCell>
                        <TableCell className="p-1">
                          <Input
                            type="number"
                            value={row.msh || ''}
                            onChange={(e) => handleCellChange(index, 'msh', Number(e.target.value) || 0)}
                            className="h-8 text-right text-sm tabular-nums"
                            disabled={userRole !== 'admin'}
                          />
                        </TableCell>
                        <TableCell className="p-1">
                          <Input
                            type="number"
                            value={row.mum || ''}
                            onChange={(e) => handleCellChange(index, 'mum', Number(e.target.value) || 0)}
                            className="h-8 text-right text-sm tabular-nums"
                            disabled={userRole !== 'admin'}
                          />
                        </TableCell>
                        <TableCell className="p-1">
                          <Input
                            type="number"
                            value={row.ts || ''}
                            onChange={(e) => handleCellChange(index, 'ts', Number(e.target.value) || 0)}
                            className="h-8 text-right text-sm tabular-nums"
                            disabled={userRole !== 'admin'}
                          />
                        </TableCell>
                        {userRole === 'admin' && (
                          <TableCell className="p-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => deleteRow(index)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))
                  )}
                  {rows.length > 0 && (
                    <TableRow className="bg-primary/10 font-bold border-t-2 border-primary">
                      <TableCell colSpan={3} className="text-right font-bold">
                        Metro Sales Total:
                      </TableCell>
                      <TableCell className="text-right tabular-nums p-2">{totals.mhb.toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums p-2">{totals.mlp.toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums p-2">{totals.msh.toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums p-2">{totals.mum.toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums p-2">{totals.ts.toLocaleString()}</TableCell>
                      {userRole === 'admin' && <TableCell></TableCell>}
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              {rows.length > 0 && (
                <div className="mt-4 text-right">
                  <span className="text-lg font-bold">Grand Total: </span>
                  <span className="text-xl font-bold text-primary">{grandTotal.toLocaleString()}</span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Sales;
