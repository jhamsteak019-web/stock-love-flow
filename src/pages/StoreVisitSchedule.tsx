import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { useToast } from '@/hooks/use-toast';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, isSameMonth } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Plus, ChevronLeft, ChevronRight, CalendarIcon, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StoreVisitSchedule {
  id: string;
  area: string;
  store_name: string;
  category: string | null;
  visit_date: string;
  remarks: string | null;
  branch_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const AREAS = ['NCR', 'NORTH AREA', 'SOUTH AREA', 'VISAYAS AREA', 'MINDANAO AREA'];
const CATEGORIES = ['BSW', 'BSWU', 'BWU', 'BSU', 'BW', 'BS', 'BU', 'SW', 'SU', 'WU', 'B', 'S', 'W', 'U'];

const StoreVisitSchedule = () => {
  const { user, userRole } = useAuth();
  const { selectedBranch } = useBranch();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<StoreVisitSchedule | null>(null);

  // Form state
  const [formArea, setFormArea] = useState('');
  const [formStoreName, setFormStoreName] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formVisitDate, setFormVisitDate] = useState<Date | undefined>(undefined);
  const [formRemarks, setFormRemarks] = useState('');

  const isAdmin = userRole === 'admin';
  const canEdit = userRole === 'admin' || userRole === 'staff' || userRole === 'uploader';

  // Calculate date range for current month view
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Fetch schedules
  const { data: schedules = [], isLoading } = useQuery({
    queryKey: ['store-visit-schedules', selectedBranch?.id, format(currentMonth, 'yyyy-MM')],
    queryFn: async () => {
      let query = supabase
        .from('store_visit_schedules')
        .select('*')
        .gte('visit_date', format(monthStart, 'yyyy-MM-dd'))
        .lte('visit_date', format(monthEnd, 'yyyy-MM-dd'))
        .is('deleted_at', null)
        .order('area')
        .order('store_name')
        .order('visit_date');

      if (selectedBranch?.id) {
        query = query.eq('branch_id', selectedBranch.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as StoreVisitSchedule[];
    },
  });

  // Group schedules by area and store
  const groupedSchedules = useMemo(() => {
    const grouped: Record<string, Record<string, { category: string | null; visits: Record<string, StoreVisitSchedule> }>> = {};
    
    schedules.forEach((schedule) => {
      if (!grouped[schedule.area]) {
        grouped[schedule.area] = {};
      }
      if (!grouped[schedule.area][schedule.store_name]) {
        grouped[schedule.area][schedule.store_name] = {
          category: schedule.category,
          visits: {},
        };
      }
      const dateKey = format(new Date(schedule.visit_date), 'yyyy-MM-dd');
      grouped[schedule.area][schedule.store_name].visits[dateKey] = schedule;
    });
    
    return grouped;
  }, [schedules]);

  // Get unique stores for the schedule
  const uniqueStores = useMemo(() => {
    const stores: { area: string; store_name: string; category: string | null }[] = [];
    Object.entries(groupedSchedules).forEach(([area, storeData]) => {
      Object.entries(storeData).forEach(([store_name, data]) => {
        stores.push({ area, store_name, category: data.category });
      });
    });
    return stores;
  }, [groupedSchedules]);

  // Add mutation
  const addMutation = useMutation({
    mutationFn: async (data: { area: string; store_name: string; category: string; visit_date: string; remarks: string }) => {
      const { error } = await supabase.from('store_visit_schedules').insert({
        area: data.area,
        store_name: data.store_name,
        category: data.category || null,
        visit_date: data.visit_date,
        remarks: data.remarks || null,
        branch_id: selectedBranch?.id,
        created_by: user?.email,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['store-visit-schedules'] });
      toast({ title: 'Success', description: 'Store visit schedule added' });
      resetForm();
      setIsAddDialogOpen(false);
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (data: { id: string; area: string; store_name: string; category: string; visit_date: string; remarks: string }) => {
      const { error } = await supabase
        .from('store_visit_schedules')
        .update({
          area: data.area,
          store_name: data.store_name,
          category: data.category || null,
          visit_date: data.visit_date,
          remarks: data.remarks || null,
        })
        .eq('id', data.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['store-visit-schedules'] });
      toast({ title: 'Success', description: 'Store visit schedule updated' });
      resetForm();
      setEditingSchedule(null);
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('store_visit_schedules')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['store-visit-schedules'] });
      toast({ title: 'Success', description: 'Store visit schedule deleted' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const resetForm = () => {
    setFormArea('');
    setFormStoreName('');
    setFormCategory('');
    setFormVisitDate(undefined);
    setFormRemarks('');
  };

  const handleSubmit = () => {
    if (!formArea || !formStoreName || !formVisitDate) {
      toast({ title: 'Error', description: 'Please fill in required fields', variant: 'destructive' });
      return;
    }

    const data = {
      area: formArea,
      store_name: formStoreName,
      category: formCategory,
      visit_date: format(formVisitDate, 'yyyy-MM-dd'),
      remarks: formRemarks,
    };

    if (editingSchedule) {
      updateMutation.mutate({ ...data, id: editingSchedule.id });
    } else {
      addMutation.mutate(data);
    }
  };

  const handleEdit = (schedule: StoreVisitSchedule) => {
    setEditingSchedule(schedule);
    setFormArea(schedule.area);
    setFormStoreName(schedule.store_name);
    setFormCategory(schedule.category || '');
    setFormVisitDate(new Date(schedule.visit_date));
    setFormRemarks(schedule.remarks || '');
  };

  const handleCellClick = (area: string, storeName: string, category: string | null, date: Date, existingSchedule?: StoreVisitSchedule) => {
    if (!canEdit) return;
    
    if (existingSchedule) {
      handleEdit(existingSchedule);
    } else {
      setFormArea(area);
      setFormStoreName(storeName);
      setFormCategory(category || '');
      setFormVisitDate(date);
      setFormRemarks('');
      setIsAddDialogOpen(true);
    }
  };

  return (
    <div className="space-y-4 p-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-xl font-bold">Store Visit Schedule</CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="font-medium min-w-[140px] text-center">
              {format(currentMonth, 'MMMM yyyy')}
            </span>
            <Button variant="outline" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            {canEdit && (
              <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-1" />
                    Add Schedule
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Store Visit Schedule</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Area *</Label>
                      <Select value={formArea} onValueChange={setFormArea}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select area" />
                        </SelectTrigger>
                        <SelectContent>
                          {AREAS.map((area) => (
                            <SelectItem key={area} value={area}>{area}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Store Name *</Label>
                      <Input 
                        value={formStoreName} 
                        onChange={(e) => setFormStoreName(e.target.value)}
                        placeholder="e.g., METRO Paranaque"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Category</Label>
                      <Select value={formCategory} onValueChange={setFormCategory}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORIES.map((cat) => (
                            <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Visit Date *</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !formVisitDate && "text-muted-foreground")}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {formVisitDate ? format(formVisitDate, 'PPP') : 'Pick a date'}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar mode="single" selected={formVisitDate} onSelect={setFormVisitDate} initialFocus />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="space-y-2">
                      <Label>Remarks</Label>
                      <Input 
                        value={formRemarks} 
                        onChange={(e) => setFormRemarks(e.target.value)}
                        placeholder="e.g., Store Visit"
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => { resetForm(); setIsAddDialogOpen(false); }}>
                        Cancel
                      </Button>
                      <Button onClick={handleSubmit} disabled={addMutation.isPending}>
                        Add Schedule
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">Loading...</div>
          ) : (
            <ScrollArea className="w-full">
              <div className="min-w-max">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="sticky left-0 bg-muted/50 z-10 min-w-[150px]">Store</TableHead>
                      <TableHead className="sticky left-[150px] bg-muted/50 z-10 w-[60px]">CAT</TableHead>
                      {daysInMonth.map((day) => (
                        <TableHead key={day.toISOString()} className="text-center min-w-[120px] text-xs">
                          <div>{format(day, 'MMM d')}</div>
                          <div className="text-muted-foreground">{format(day, 'EEE')}</div>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {AREAS.map((area) => {
                      const areaStores = Object.entries(groupedSchedules[area] || {});
                      if (areaStores.length === 0 && !schedules.some(s => s.area === area)) return null;
                      
                      return (
                        <>
                          <TableRow key={area} className="bg-primary/10">
                            <TableCell colSpan={daysInMonth.length + 2} className="font-bold text-primary">
                              {area}
                            </TableCell>
                          </TableRow>
                          {areaStores.map(([storeName, storeData]) => (
                            <TableRow key={`${area}-${storeName}`} className="hover:bg-muted/30">
                              <TableCell className="sticky left-0 bg-background z-10 font-medium text-sm">
                                {storeName}
                              </TableCell>
                              <TableCell className="sticky left-[150px] bg-background z-10 text-xs text-center font-medium text-primary">
                                {storeData.category}
                              </TableCell>
                              {daysInMonth.map((day) => {
                                const dateKey = format(day, 'yyyy-MM-dd');
                                const schedule = storeData.visits[dateKey];
                                
                                return (
                                  <TableCell 
                                    key={dateKey} 
                                    className={cn(
                                      "text-center text-xs p-1 border cursor-pointer hover:bg-accent transition-colors",
                                      schedule && "bg-primary/10"
                                    )}
                                    onClick={() => handleCellClick(area, storeName, storeData.category, day, schedule)}
                                  >
                                    {schedule && (
                                      <div className="space-y-0.5">
                                        <div className="text-[10px] text-muted-foreground">
                                          {format(new Date(schedule.visit_date), 'MMM d, yyyy')}
                                        </div>
                                        <div className="font-medium text-xs text-primary">
                                          {schedule.remarks || 'Store Visit'}
                                        </div>
                                      </div>
                                    )}
                                  </TableCell>
                                );
                              })}
                            </TableRow>
                          ))}
                        </>
                      );
                    })}
                    {uniqueStores.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={daysInMonth.length + 2} className="text-center py-8 text-muted-foreground">
                          No store visit schedules found for this month. Click "Add Schedule" to create one.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editingSchedule} onOpenChange={(open) => !open && setEditingSchedule(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Store Visit Schedule</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Area *</Label>
              <Select value={formArea} onValueChange={setFormArea}>
                <SelectTrigger>
                  <SelectValue placeholder="Select area" />
                </SelectTrigger>
                <SelectContent>
                  {AREAS.map((area) => (
                    <SelectItem key={area} value={area}>{area}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Store Name *</Label>
              <Input 
                value={formStoreName} 
                onChange={(e) => setFormStoreName(e.target.value)}
                placeholder="e.g., METRO Paranaque"
              />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={formCategory} onValueChange={setFormCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Visit Date *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !formVisitDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formVisitDate ? format(formVisitDate, 'PPP') : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={formVisitDate} onSelect={setFormVisitDate} initialFocus />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>Remarks</Label>
              <Input 
                value={formRemarks} 
                onChange={(e) => setFormRemarks(e.target.value)}
                placeholder="e.g., Store Visit"
              />
            </div>
            <div className="flex justify-between">
              {isAdmin && (
                <Button 
                  variant="destructive" 
                  onClick={() => editingSchedule && deleteMutation.mutate(editingSchedule.id)}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete
                </Button>
              )}
              <div className="flex gap-2 ml-auto">
                <Button variant="outline" onClick={() => { resetForm(); setEditingSchedule(null); }}>
                  Cancel
                </Button>
                <Button onClick={handleSubmit} disabled={updateMutation.isPending}>
                  Update Schedule
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StoreVisitSchedule;
