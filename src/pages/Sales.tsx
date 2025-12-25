import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';
import { Plus, CalendarIcon, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface SalesRecord {
  id: string;
  category: string;
  mp: string;
  branch_name: string;
  sale_date: string;
  mhb: number;
  mlp: number;
  msh: number;
  mum: number;
  ts: number;
  created_by: string | null;
  created_at: string;
}

const CATEGORIES = ['BSW', 'BSWU', 'BWU'];
const MP_OPTIONS = ['1', '2', '3', '4', '5'];
const BRANCHES = [
  'Metro Alabang', 'Metro Angeles', 'Ayala Cebu', 'Ayala Feliz', 'Metro Bacolod',
  'Metro Dais', 'Metro Baybay', 'Metro Cabuyao', 'Metro Carcar', 'Metro Caticlan',
  'Metro Danao', 'Metro Imus', 'Metro Lapu-Lapu', 'Metro Legazpi', 'Metro Lucena',
  'Metro Mandaue', 'Metro Market Market', 'Metro Tacloban', 'Metro Tagaytay', 'Metro Toledo'
];

const Sales = () => {
  const { user, userRole } = useAuth();
  const [sales, setSales] = useState<SalesRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [filterDate, setFilterDate] = useState<Date>(new Date());
  
  const [formData, setFormData] = useState({
    category: '',
    mp: '',
    branch_name: '',
    mhb: 0,
    mlp: 0,
    msh: 0,
    mum: 0,
    ts: 0,
  });

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
      setSales(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchSales();
  }, [filterDate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.category || !formData.mp || !formData.branch_name) {
      toast.error('Please fill in all required fields');
      return;
    }

    const { error } = await supabase.from('sales').insert({
      ...formData,
      sale_date: format(selectedDate, 'yyyy-MM-dd'),
      created_by: user?.id,
    });

    if (error) {
      toast.error('Failed to add sales record');
      console.error(error);
    } else {
      toast.success('Sales record added successfully');
      setIsDialogOpen(false);
      setFormData({
        category: '',
        mp: '',
        branch_name: '',
        mhb: 0,
        mlp: 0,
        msh: 0,
        mum: 0,
        ts: 0,
      });
      fetchSales();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this record?')) return;

    const { error } = await supabase.from('sales').delete().eq('id', id);

    if (error) {
      toast.error('Failed to delete record');
      console.error(error);
    } else {
      toast.success('Record deleted');
      fetchSales();
    }
  };

  // Calculate totals
  const totals = sales.reduce(
    (acc, sale) => ({
      mhb: acc.mhb + Number(sale.mhb || 0),
      mlp: acc.mlp + Number(sale.mlp || 0),
      msh: acc.msh + Number(sale.msh || 0),
      mum: acc.mum + Number(sale.mum || 0),
      ts: acc.ts + Number(sale.ts || 0),
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
                {format(filterDate, 'MMMM d, yyyy')}
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
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  Add Sale
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Add Sales Record</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Category</Label>
                      <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORIES.map((cat) => (
                            <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>MP</Label>
                      <Select value={formData.mp} onValueChange={(v) => setFormData({ ...formData, mp: v })}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent>
                          {MP_OPTIONS.map((mp) => (
                            <SelectItem key={mp} value={mp}>{mp}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Branch</Label>
                    <Select value={formData.branch_name} onValueChange={(v) => setFormData({ ...formData, branch_name: v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select branch" />
                      </SelectTrigger>
                      <SelectContent>
                        {BRANCHES.map((branch) => (
                          <SelectItem key={branch} value={branch}>{branch}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-start text-left font-normal">
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {format(selectedDate, 'PPP')}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={selectedDate}
                          onSelect={(date) => date && setSelectedDate(date)}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="grid grid-cols-5 gap-2">
                    {['mhb', 'mlp', 'msh', 'mum', 'ts'].map((field) => (
                      <div key={field} className="space-y-1">
                        <Label className="text-xs uppercase">{field}</Label>
                        <Input
                          type="number"
                          value={formData[field as keyof typeof formData]}
                          onChange={(e) => setFormData({ ...formData, [field]: Number(e.target.value) })}
                          className="text-sm"
                        />
                      </div>
                    ))}
                  </div>

                  <Button type="submit" className="w-full">Add Record</Button>
                </form>
              </DialogContent>
            </Dialog>
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
                    <TableHead className="w-12 text-center font-bold">No.</TableHead>
                    <TableHead className="w-16 text-center font-bold">CAT</TableHead>
                    <TableHead className="w-12 text-center font-bold">MP</TableHead>
                    <TableHead className="font-bold">Branch Name</TableHead>
                    <TableHead className="w-24 text-right font-bold">MHB</TableHead>
                    <TableHead className="w-24 text-right font-bold">MLP</TableHead>
                    <TableHead className="w-24 text-right font-bold">MSH</TableHead>
                    <TableHead className="w-24 text-right font-bold">MUM</TableHead>
                    <TableHead className="w-24 text-right font-bold">TS</TableHead>
                    {userRole === 'admin' && <TableHead className="w-12"></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sales.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={userRole === 'admin' ? 10 : 9} className="text-center py-8 text-muted-foreground">
                        No sales records for this date
                      </TableCell>
                    </TableRow>
                  ) : (
                    sales.map((sale, index) => (
                      <TableRow key={sale.id} className={index % 2 === 0 ? 'bg-background' : 'bg-muted/30'}>
                        <TableCell className="text-center">{index + 1}</TableCell>
                        <TableCell className="text-center font-medium">{sale.category}</TableCell>
                        <TableCell className="text-center">{sale.mp}</TableCell>
                        <TableCell>{sale.branch_name}</TableCell>
                        <TableCell className="text-right tabular-nums">{Number(sale.mhb).toLocaleString()}</TableCell>
                        <TableCell className="text-right tabular-nums">{Number(sale.mlp).toLocaleString()}</TableCell>
                        <TableCell className="text-right tabular-nums">{Number(sale.msh).toLocaleString()}</TableCell>
                        <TableCell className="text-right tabular-nums">{Number(sale.mum).toLocaleString()}</TableCell>
                        <TableCell className="text-right tabular-nums">{Number(sale.ts).toLocaleString()}</TableCell>
                        {userRole === 'admin' && (
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => handleDelete(sale.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))
                  )}
                  {sales.length > 0 && (
                    <TableRow className="bg-primary/10 font-bold border-t-2 border-primary">
                      <TableCell colSpan={4} className="text-right">
                        Metro Sales Total:
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{totals.mhb.toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums">{totals.mlp.toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums">{totals.msh.toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums">{totals.mum.toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums">{totals.ts.toLocaleString()}</TableCell>
                      {userRole === 'admin' && <TableCell></TableCell>}
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              {sales.length > 0 && (
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