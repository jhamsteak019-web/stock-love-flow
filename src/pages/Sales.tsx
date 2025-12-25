import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';
import { Plus, Trash2, Save, X } from 'lucide-react';
import { format, addDays } from 'date-fns';

interface DatePage {
  date: Date;
  id: string;
}

interface SalesRow {
  id?: string;
  category: string;
  mp: string;
  branch_name: string;
  // Data per date - keyed by date string
  dateData: Record<string, {
    mhb: number;
    mlp: number;
    msh: number;
    mum: number;
    ts: number;
  }>;
  running_sale: number;
  sales_plan: number;
  dec_2024: number;
  isNew?: boolean;
  isDirty?: boolean;
}

const Sales = () => {
  const { user, userRole } = useAuth();
  const [rows, setRows] = useState<SalesRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [datePages, setDatePages] = useState<DatePage[]>([
    { date: new Date(), id: crypto.randomUUID() }
  ]);

  const fetchSales = async () => {
    setLoading(true);
    
    // Fetch sales for all dates
    const dateStrings = datePages.map(dp => format(dp.date, 'yyyy-MM-dd'));
    
    const { data, error } = await supabase
      .from('sales')
      .select('*')
      .in('sale_date', dateStrings)
      .order('category')
      .order('branch_name');

    if (error) {
      toast.error('Failed to fetch sales data');
      console.error(error);
    } else {
      // Group by branch
      const branchMap = new Map<string, SalesRow>();
      
      (data || []).forEach(sale => {
        const key = `${sale.category}-${sale.mp}-${sale.branch_name}`;
        const dateStr = sale.sale_date;
        
        if (!branchMap.has(key)) {
          branchMap.set(key, {
            id: sale.id,
            category: sale.category,
            mp: sale.mp,
            branch_name: sale.branch_name,
            dateData: {},
            running_sale: Number(sale.running_sale) || 0,
            sales_plan: Number(sale.sales_plan) || 0,
            dec_2024: Number(sale.dec_2024) || 0,
            isNew: false,
            isDirty: false,
          });
        }
        
        const row = branchMap.get(key)!;
        row.dateData[dateStr] = {
          mhb: Number(sale.mhb) || 0,
          mlp: Number(sale.mlp) || 0,
          msh: Number(sale.msh) || 0,
          mum: Number(sale.mum) || 0,
          ts: Number(sale.ts) || 0,
        };
      });
      
      setRows(Array.from(branchMap.values()));
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchSales();
  }, [datePages]);

  const handleCellChange = (index: number, field: keyof SalesRow, value: string | number) => {
    setRows(prev => prev.map((row, i) => {
      if (i === index) {
        return { ...row, [field]: value, isDirty: true };
      }
      return row;
    }));
  };

  const handleDateDataChange = (index: number, dateStr: string, field: string, value: number) => {
    setRows(prev => prev.map((row, i) => {
      if (i === index) {
        return {
          ...row,
          dateData: {
            ...row.dateData,
            [dateStr]: {
              ...row.dateData[dateStr] || { mhb: 0, mlp: 0, msh: 0, mum: 0, ts: 0 },
              [field]: value,
            }
          },
          isDirty: true,
        };
      }
      return row;
    }));
  };

  const addNewRow = () => {
    const initialDateData: Record<string, { mhb: number; mlp: number; msh: number; mum: number; ts: number }> = {};
    datePages.forEach(dp => {
      initialDateData[format(dp.date, 'yyyy-MM-dd')] = { mhb: 0, mlp: 0, msh: 0, mum: 0, ts: 0 };
    });
    
    setRows(prev => [...prev, {
      category: '',
      mp: '',
      branch_name: '',
      dateData: initialDateData,
      running_sale: 0,
      sales_plan: 0,
      dec_2024: 0,
      isNew: true,
      isDirty: true,
    }]);
  };

  const addNewDatePage = () => {
    const lastDate = datePages[datePages.length - 1]?.date || new Date();
    const newDate = addDays(lastDate, 1);
    setDatePages(prev => [...prev, { date: newDate, id: crypto.randomUUID() }]);
    
    // Add empty data for new date to all rows
    const newDateStr = format(newDate, 'yyyy-MM-dd');
    setRows(prev => prev.map(row => ({
      ...row,
      dateData: {
        ...row.dateData,
        [newDateStr]: { mhb: 0, mlp: 0, msh: 0, mum: 0, ts: 0 }
      }
    })));
  };

  const removeDatePage = (pageId: string) => {
    if (datePages.length <= 1) {
      toast.error('At least one date page is required');
      return;
    }
    setDatePages(prev => prev.filter(p => p.id !== pageId));
  };

  const updateDatePage = (pageId: string, newDate: Date) => {
    setDatePages(prev => prev.map(p => 
      p.id === pageId ? { ...p, date: newDate } : p
    ));
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
    
    try {
      for (const row of rows) {
        if (!row.isDirty) continue;
        
        if (!row.category || !row.mp || !row.branch_name) {
          toast.error('Please fill in CAT, MP, and Branch Name for all rows');
          setSaving(false);
          return;
        }

        // Save data for each date
        for (const datePage of datePages) {
          const dateStr = format(datePage.date, 'yyyy-MM-dd');
          const dateData = row.dateData[dateStr] || { mhb: 0, mlp: 0, msh: 0, mum: 0, ts: 0 };
          
          const rowData = {
            category: row.category,
            mp: row.mp,
            branch_name: row.branch_name,
            mhb: dateData.mhb,
            mlp: dateData.mlp,
            msh: dateData.msh,
            mum: dateData.mum,
            ts: dateData.ts,
            running_sale: row.running_sale,
            sales_plan: row.sales_plan,
            dec_2024: row.dec_2024,
            sale_date: dateStr,
            created_by: user?.id,
          };

          // Check if record exists
          const { data: existing } = await supabase
            .from('sales')
            .select('id')
            .eq('category', row.category)
            .eq('mp', row.mp)
            .eq('branch_name', row.branch_name)
            .eq('sale_date', dateStr)
            .maybeSingle();

          if (existing) {
            const { error } = await supabase.from('sales').update(rowData).eq('id', existing.id);
            if (error) throw error;
          } else {
            const { error } = await supabase.from('sales').insert(rowData);
            if (error) throw error;
          }
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

  // Calculate difference and % achieved
  const calcDiffQuota = (running: number, plan: number) => running - plan;
  const calcPercentAchieved = (running: number, plan: number) => {
    if (plan === 0) return 0;
    return (running / plan) * 100;
  };
  const calcDiff2024 = (running: number, dec2024: number) => running - dec2024;
  const calcPercent2024 = (running: number, dec2024: number) => {
    if (dec2024 === 0) return 0;
    return ((running - dec2024) / dec2024) * 100;
  };

  // Calculate totals per date
  const calculateDateTotals = (dateStr: string) => {
    return rows.reduce(
      (acc, row) => {
        const data = row.dateData[dateStr] || { mhb: 0, mlp: 0, msh: 0, mum: 0, ts: 0 };
        return {
          mhb: acc.mhb + data.mhb,
          mlp: acc.mlp + data.mlp,
          msh: acc.msh + data.msh,
          mum: acc.mum + data.mum,
          ts: acc.ts + data.ts,
        };
      },
      { mhb: 0, mlp: 0, msh: 0, mum: 0, ts: 0 }
    );
  };

  const totals = rows.reduce(
    (acc, row) => ({
      running_sale: acc.running_sale + Number(row.running_sale || 0),
      sales_plan: acc.sales_plan + Number(row.sales_plan || 0),
      dec_2024: acc.dec_2024 + Number(row.dec_2024 || 0),
    }),
    { running_sale: 0, sales_plan: 0, dec_2024: 0 }
  );

  const totalDiffQuota = calcDiffQuota(totals.running_sale, totals.sales_plan);
  const totalPercentAchieved = calcPercentAchieved(totals.running_sale, totals.sales_plan);
  const totalDiff2024 = calcDiff2024(totals.running_sale, totals.dec_2024);
  const totalPercent2024 = calcPercent2024(totals.running_sale, totals.dec_2024);

  const formatNumber = (num: number) => num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const formatPercent = (num: number) => `${Math.round(num)}%`;

  const getColorClass = (value: number) => {
    if (value < 0) return 'text-red-600 bg-red-50';
    if (value > 0) return 'text-green-600 bg-green-50';
    return '';
  };

  const firstDate = datePages[0]?.date || new Date();
  const currentMonth = format(firstDate, 'MMM').toUpperCase();
  const currentYear = format(firstDate, 'yyyy');
  const prevYear = String(Number(currentYear) - 1);

  const colCount = 4 + (datePages.length * 5) + 7 + (userRole === 'admin' ? 1 : 0);

  return (
    <div className="space-y-4">
      {/* Action buttons */}
      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={addNewRow} className="gap-2 border-2">
          <Plus className="h-4 w-4" />
          Add Row
        </Button>
        <Button onClick={saveAllChanges} disabled={saving || !hasChanges} className="gap-2">
          <Save className="h-4 w-4" />
          {saving ? 'Saving...' : 'Save All'}
        </Button>
      </div>

      {/* Excel-like table */}
      <div className="overflow-x-auto border border-border rounded-lg bg-background">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              {/* Header Row 1 - Date headers */}
              <tr className="border-b border-border">
                <th className="border border-border p-2 bg-muted/30 w-12" rowSpan={2}></th>
                <th className="border border-border p-2 bg-muted/30 w-16" rowSpan={2}></th>
                <th className="border border-border p-2 bg-muted/30 w-12" rowSpan={2}></th>
                <th className="border border-border p-2 bg-muted/30" rowSpan={2}></th>
                
                {/* Date columns */}
                {datePages.map((datePage, idx) => (
                  <th key={datePage.id} colSpan={5} className={`border border-border p-2 text-center ${idx % 2 === 0 ? 'bg-red-50' : 'bg-green-50'}`}>
                    <div className="flex items-center justify-center gap-2">
                      <Popover>
                        <PopoverTrigger asChild>
                          <button className="text-primary font-bold hover:underline cursor-pointer">
                            {format(datePage.date, 'EEEE, MMMM d, yyyy')}
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="center">
                          <Calendar
                            mode="single"
                            selected={datePage.date}
                            onSelect={(date) => date && updateDatePage(datePage.id, date)}
                            initialFocus
                            className="pointer-events-auto"
                          />
                        </PopoverContent>
                      </Popover>
                      {datePages.length > 1 && (
                        <button 
                          onClick={() => removeDatePage(datePage.id)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </th>
                ))}
                
                {/* Add New Page button */}
                <th className="border border-border p-2 bg-yellow-100 text-center" rowSpan={3}>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={addNewDatePage} 
                    className="gap-1 text-xs bg-white hover:bg-yellow-50"
                  >
                    <Plus className="h-3 w-3" />
                    Add New Page
                  </Button>
                </th>
                
                <th className="border border-border p-2 bg-yellow-100 text-center font-bold" rowSpan={3}>
                  Running Sale<br/>{currentMonth} 1-{format(firstDate, 'd')}
                </th>
                <th className="border border-border p-2 bg-yellow-100 text-center font-bold" rowSpan={3}>
                  SALES PLAN
                </th>
                <th className="border border-border p-2 bg-yellow-100 text-center font-bold" rowSpan={3}>
                  DIFFERENCE<br/>vs Quota
                </th>
                <th className="border border-border p-2 bg-yellow-100 text-center font-bold" rowSpan={3}>
                  %<br/>ACHIEVED
                </th>
                <th colSpan={3} className="border border-border p-2 bg-blue-100 text-center font-bold">
                  {prevYear} VS {currentYear}
                </th>
                {userRole === 'admin' && <th className="border border-border p-2 bg-muted/30 w-10" rowSpan={3}></th>}
              </tr>
              
              {/* Header Row 2 - MHB MLP MSH MUM TS for each date */}
              <tr className="border-b border-border">
                {datePages.map((datePage, idx) => (
                  <>
                    <th key={`${datePage.id}-mhb`} className={`border border-border p-2 font-bold text-center w-20 ${idx % 2 === 0 ? 'bg-red-100' : 'bg-green-100'}`}>MHB</th>
                    <th key={`${datePage.id}-mlp`} className={`border border-border p-2 font-bold text-center w-20 ${idx % 2 === 0 ? 'bg-red-100' : 'bg-green-100'}`}>MLP</th>
                    <th key={`${datePage.id}-msh`} className={`border border-border p-2 font-bold text-center w-20 ${idx % 2 === 0 ? 'bg-red-100' : 'bg-green-100'}`}>MSH</th>
                    <th key={`${datePage.id}-mum`} className={`border border-border p-2 font-bold text-center w-20 ${idx % 2 === 0 ? 'bg-red-100' : 'bg-green-100'}`}>MUM</th>
                    <th key={`${datePage.id}-ts`} className={`border border-border p-2 font-bold text-center w-24 ${idx % 2 === 0 ? 'bg-red-100' : 'bg-green-100'}`}>TS</th>
                  </>
                ))}
                <th className="border border-border p-2 bg-blue-100 font-bold text-center w-24">{currentMonth} {prevYear}</th>
                <th className="border border-border p-2 bg-blue-100 font-bold text-center w-24">DIFFERENCE</th>
                <th className="border border-border p-2 bg-blue-100 font-bold text-center w-20">% ACHIEVED</th>
              </tr>
              
              {/* Header Row 3 - No., CAT, MP, METRO GROUP labels */}
              <tr className="border-b border-border bg-muted/50">
                <th className="border border-border p-2 font-bold text-center w-12">No.</th>
                <th className="border border-border p-2 font-bold text-center w-16">CAT</th>
                <th className="border border-border p-2 font-bold text-center w-12">MP</th>
                <th className="border border-border p-2 font-bold text-left">METRO GROUP {format(firstDate, 'MMM yyyy').toUpperCase()}</th>
                {datePages.map((datePage, idx) => (
                  <>
                    <th key={`${datePage.id}-h-mhb`} className={`border border-border p-2 w-20 ${idx % 2 === 0 ? 'bg-red-50' : 'bg-green-50'}`}></th>
                    <th key={`${datePage.id}-h-mlp`} className={`border border-border p-2 w-20 ${idx % 2 === 0 ? 'bg-red-50' : 'bg-green-50'}`}></th>
                    <th key={`${datePage.id}-h-msh`} className={`border border-border p-2 w-20 ${idx % 2 === 0 ? 'bg-red-50' : 'bg-green-50'}`}></th>
                    <th key={`${datePage.id}-h-mum`} className={`border border-border p-2 w-20 ${idx % 2 === 0 ? 'bg-red-50' : 'bg-green-50'}`}></th>
                    <th key={`${datePage.id}-h-ts`} className={`border border-border p-2 w-24 ${idx % 2 === 0 ? 'bg-red-50' : 'bg-green-50'}`}></th>
                  </>
                ))}
                <th className="border border-border p-2 bg-blue-50"></th>
                <th className="border border-border p-2 bg-blue-50"></th>
                <th className="border border-border p-2 bg-blue-50"></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="text-center py-8 text-muted-foreground border border-border">
                    No sales records. Click "Add Row" to start.
                  </td>
                </tr>
              ) : (
                rows.map((row, index) => {
                  const diffQuota = calcDiffQuota(row.running_sale, row.sales_plan);
                  const percentAchieved = calcPercentAchieved(row.running_sale, row.sales_plan);
                  const diff2024 = calcDiff2024(row.running_sale, row.dec_2024);
                  const percent2024 = calcPercent2024(row.running_sale, row.dec_2024);

                  return (
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
                      
                      {/* Date data columns */}
                      {datePages.map((datePage, idx) => {
                        const dateStr = format(datePage.date, 'yyyy-MM-dd');
                        const data = row.dateData[dateStr] || { mhb: 0, mlp: 0, msh: 0, mum: 0, ts: 0 };
                        const bgClass = idx % 2 === 0 ? 'bg-red-50/30' : 'bg-green-50/30';
                        
                        return (
                          <>
                            <td key={`${datePage.id}-${index}-mhb`} className={`border border-border p-0 ${bgClass}`}>
                              <Input
                                type="number"
                                value={data.mhb || ''}
                                onChange={(e) => handleDateDataChange(index, dateStr, 'mhb', Number(e.target.value) || 0)}
                                className="h-8 text-right text-sm tabular-nums border-0 rounded-none focus-visible:ring-1 focus-visible:ring-inset pr-2 bg-transparent"
                                disabled={userRole !== 'admin'}
                              />
                            </td>
                            <td key={`${datePage.id}-${index}-mlp`} className={`border border-border p-0 ${bgClass}`}>
                              <Input
                                type="number"
                                value={data.mlp || ''}
                                onChange={(e) => handleDateDataChange(index, dateStr, 'mlp', Number(e.target.value) || 0)}
                                className="h-8 text-right text-sm tabular-nums border-0 rounded-none focus-visible:ring-1 focus-visible:ring-inset pr-2 bg-transparent"
                                disabled={userRole !== 'admin'}
                              />
                            </td>
                            <td key={`${datePage.id}-${index}-msh`} className={`border border-border p-0 ${bgClass}`}>
                              <Input
                                type="number"
                                value={data.msh || ''}
                                onChange={(e) => handleDateDataChange(index, dateStr, 'msh', Number(e.target.value) || 0)}
                                className="h-8 text-right text-sm tabular-nums border-0 rounded-none focus-visible:ring-1 focus-visible:ring-inset pr-2 bg-transparent"
                                disabled={userRole !== 'admin'}
                              />
                            </td>
                            <td key={`${datePage.id}-${index}-mum`} className={`border border-border p-0 ${bgClass}`}>
                              <Input
                                type="number"
                                value={data.mum || ''}
                                onChange={(e) => handleDateDataChange(index, dateStr, 'mum', Number(e.target.value) || 0)}
                                className="h-8 text-right text-sm tabular-nums border-0 rounded-none focus-visible:ring-1 focus-visible:ring-inset pr-2 bg-transparent"
                                disabled={userRole !== 'admin'}
                              />
                            </td>
                            <td key={`${datePage.id}-${index}-ts`} className={`border border-border p-0 ${bgClass}`}>
                              <Input
                                type="number"
                                value={data.ts || ''}
                                onChange={(e) => handleDateDataChange(index, dateStr, 'ts', Number(e.target.value) || 0)}
                                className="h-8 text-right text-sm tabular-nums border-0 rounded-none focus-visible:ring-1 focus-visible:ring-inset pr-2 bg-transparent"
                                disabled={userRole !== 'admin'}
                              />
                            </td>
                          </>
                        );
                      })}
                      
                      {/* Empty cell under Add New Page button */}
                      <td className="border border-border p-2 bg-yellow-50"></td>
                      
                      {/* Running Sale */}
                      <td className="border border-border p-0 bg-yellow-50">
                        <Input
                          type="number"
                          value={row.running_sale || ''}
                          onChange={(e) => handleCellChange(index, 'running_sale', Number(e.target.value) || 0)}
                          className="h-8 text-right text-sm tabular-nums border-0 rounded-none focus-visible:ring-1 focus-visible:ring-inset pr-2 bg-transparent"
                          disabled={userRole !== 'admin'}
                        />
                      </td>
                      {/* Sales Plan */}
                      <td className="border border-border p-0 bg-yellow-50">
                        <Input
                          type="number"
                          value={row.sales_plan || ''}
                          onChange={(e) => handleCellChange(index, 'sales_plan', Number(e.target.value) || 0)}
                          className="h-8 text-right text-sm tabular-nums border-0 rounded-none focus-visible:ring-1 focus-visible:ring-inset pr-2 bg-transparent"
                          disabled={userRole !== 'admin'}
                        />
                      </td>
                      {/* Difference vs Quota */}
                      <td className={`border border-border p-2 text-right tabular-nums ${getColorClass(diffQuota)}`}>
                        {formatNumber(diffQuota)}
                      </td>
                      {/* % Achieved */}
                      <td className={`border border-border p-2 text-right tabular-nums ${getColorClass(percentAchieved - 100)}`}>
                        {formatPercent(percentAchieved)}
                      </td>
                      {/* Dec 2024 */}
                      <td className="border border-border p-0 bg-blue-50">
                        <Input
                          type="number"
                          value={row.dec_2024 || ''}
                          onChange={(e) => handleCellChange(index, 'dec_2024', Number(e.target.value) || 0)}
                          className="h-8 text-right text-sm tabular-nums border-0 rounded-none focus-visible:ring-1 focus-visible:ring-inset pr-2 bg-transparent"
                          disabled={userRole !== 'admin'}
                        />
                      </td>
                      {/* Difference 2024 */}
                      <td className={`border border-border p-2 text-right tabular-nums ${getColorClass(diff2024)}`}>
                        {formatNumber(diff2024)}
                      </td>
                      {/* % Achieved 2024 */}
                      <td className={`border border-border p-2 text-right tabular-nums ${getColorClass(percent2024)}`}>
                        {formatPercent(percent2024)}
                      </td>
                      {/* Delete button */}
                      {userRole === 'admin' && (
                        <td className="border border-border p-1 text-center">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive hover:text-destructive"
                            onClick={() => deleteRow(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
              
              {/* Totals row */}
              {rows.length > 0 && (
                <tr className="bg-muted/50 font-bold">
                  <td className="border border-border p-2 text-center">{rows.length}</td>
                  <td className="border border-border p-2"></td>
                  <td className="border border-border p-2"></td>
                  <td className="border border-border p-2">Metro Sales Total</td>
                  
                  {/* Date totals */}
                  {datePages.map((datePage, idx) => {
                    const dateStr = format(datePage.date, 'yyyy-MM-dd');
                    const dateTotals = calculateDateTotals(dateStr);
                    const bgClass = idx % 2 === 0 ? 'bg-red-100' : 'bg-green-100';
                    
                    return (
                      <>
                        <td key={`${datePage.id}-total-mhb`} className={`border border-border p-2 text-right tabular-nums ${bgClass}`}>{formatNumber(dateTotals.mhb)}</td>
                        <td key={`${datePage.id}-total-mlp`} className={`border border-border p-2 text-right tabular-nums ${bgClass}`}>{formatNumber(dateTotals.mlp)}</td>
                        <td key={`${datePage.id}-total-msh`} className={`border border-border p-2 text-right tabular-nums ${bgClass}`}>{formatNumber(dateTotals.msh)}</td>
                        <td key={`${datePage.id}-total-mum`} className={`border border-border p-2 text-right tabular-nums ${bgClass}`}>{formatNumber(dateTotals.mum)}</td>
                        <td key={`${datePage.id}-total-ts`} className={`border border-border p-2 text-right tabular-nums ${bgClass}`}>{formatNumber(dateTotals.ts)}</td>
                      </>
                    );
                  })}
                  
                  <td className="border border-border p-2 bg-yellow-100"></td>
                  <td className="border border-border p-2 text-right tabular-nums bg-yellow-100">{formatNumber(totals.running_sale)}</td>
                  <td className="border border-border p-2 text-right tabular-nums bg-yellow-100">{formatNumber(totals.sales_plan)}</td>
                  <td className={`border border-border p-2 text-right tabular-nums ${getColorClass(totalDiffQuota)}`}>{formatNumber(totalDiffQuota)}</td>
                  <td className={`border border-border p-2 text-right tabular-nums ${getColorClass(totalPercentAchieved - 100)}`}>{formatPercent(totalPercentAchieved)}</td>
                  <td className="border border-border p-2 text-right tabular-nums bg-blue-100">{formatNumber(totals.dec_2024)}</td>
                  <td className={`border border-border p-2 text-right tabular-nums ${getColorClass(totalDiff2024)}`}>{formatNumber(totalDiff2024)}</td>
                  <td className={`border border-border p-2 text-right tabular-nums ${getColorClass(totalPercent2024)}`}>{formatPercent(totalPercent2024)}</td>
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
