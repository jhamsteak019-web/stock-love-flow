import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { useToast } from '@/hooks/use-toast';
import { format, startOfMonth, endOfMonth, addMonths, subMonths, parseISO } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ChevronLeft, ChevronRight, CalendarIcon, Trash2 } from 'lucide-react';
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
const MAX_COLUMNS = 10;

const StoreVisitSchedule = () => {
  const { user, userRole } = useAuth();
  const { selectedBranch } = useBranch();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<StoreVisitSchedule | null>(null);

  // Form state
  const [formArea, setFormArea] = useState('');
  const [formStoreName, setFormStoreName] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formVisitDate, setFormVisitDate] = useState<Date | undefined>(undefined);
  const [formRemarks, setFormRemarks] = useState('');

  const isAdmin = userRole === 'admin';
  const canEdit = userRole === 'admin' || userRole === 'staff' || userRole === 'uploader' || userRole === 'teamleader' || userRole === 'oic';

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);

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
    const grouped: Record<string, Record<string, { 
      category: string | null; 
      visits: StoreVisitSchedule[];
    }>> = {};
    
    schedules.forEach((schedule) => {
      if (!grouped[schedule.area]) {
        grouped[schedule.area] = {};
      }
      if (!grouped[schedule.area][schedule.store_name]) {
        grouped[schedule.area][schedule.store_name] = {
          category: schedule.category,
          visits: [],
        };
      }
      grouped[schedule.area][schedule.store_name].visits.push(schedule);
    });

    // Sort visits by date
    Object.values(grouped).forEach(stores => {
      Object.values(stores).forEach(storeData => {
        storeData.visits.sort((a, b) => 
          new Date(a.visit_date).getTime() - new Date(b.visit_date).getTime()
        );
      });
    });
    
    return grouped;
  }, [schedules]);

  // Calculate max visits across all stores
  const maxVisits = useMemo(() => {
    let max = 0;
    Object.values(groupedSchedules).forEach(stores => {
      Object.values(stores).forEach(storeData => {
        max = Math.max(max, storeData.visits.length);
      });
    });
    return Math.max(max + 1, MAX_COLUMNS); // +1 for empty column to add new
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
      toast({ title: 'Success', description: 'Schedule added' });
      resetForm();
      setIsDialogOpen(false);
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
      toast({ title: 'Success', description: 'Schedule updated' });
      resetForm();
      setEditingSchedule(null);
      setIsDialogOpen(false);
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
      toast({ title: 'Success', description: 'Schedule deleted' });
      setEditingSchedule(null);
      setIsDialogOpen(false);
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
      toast({ title: 'Error', description: 'Please fill in Area, Store Name, and Date', variant: 'destructive' });
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

  // Click on existing schedule to edit
  const handleCellClick = (schedule: StoreVisitSchedule) => {
    if (!canEdit) return;
    setEditingSchedule(schedule);
    setFormArea(schedule.area);
    setFormStoreName(schedule.store_name);
    setFormCategory(schedule.category || '');
    setFormVisitDate(new Date(schedule.visit_date));
    setFormRemarks(schedule.remarks || '');
    setIsDialogOpen(true);
  };

  // Click on empty cell to add new
  const handleEmptyCellClick = (area: string, storeName: string, category: string | null) => {
    if (!canEdit) return;
    setEditingSchedule(null);
    setFormArea(area);
    setFormStoreName(storeName);
    setFormCategory(category || '');
    setFormVisitDate(undefined);
    setFormRemarks('');
    setIsDialogOpen(true);
  };

  // Format date for display
  const formatDateDisplay = (dateStr: string) => {
    const date = parseISO(dateStr);
    return format(date, 'MMMM d,yyyy | EEEE');
  };

  // Get row number for store within area
  let globalRowNum = 0;

  return (
    <div className="space-y-4 p-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <p className="text-sm text-muted-foreground">METRO GROUP 2025</p>
            <CardTitle className="text-xl font-bold text-primary">SCHEDULE NCR and Province</CardTitle>
          </div>
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
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-8">Loading...</div>
          ) : (
            <ScrollArea className="w-full">
              <div className="min-w-max">
                <Table className="border-collapse">
                  {AREAS.map((area) => {
                    const areaStores = Object.entries(groupedSchedules[area] || {});
                    if (areaStores.length === 0) return null;

                    return (
                      <TableBody key={area}>
                        {/* Area Header Row */}
                        <TableRow className="bg-muted border-t-2 border-border">
                          <TableCell className="font-bold text-destructive text-xs border p-1 w-[30px]"></TableCell>
                          <TableCell className="font-bold text-destructive text-xs border p-1 min-w-[160px]">{area}</TableCell>
                          <TableCell className="font-bold text-xs border p-1 w-[50px] text-center">CAT</TableCell>
                          {Array.from({ length: maxVisits }).map((_, idx) => (
                            <>
                              <TableCell key={`${idx}-date-header`} className="font-bold text-xs border p-1 min-w-[180px] bg-muted"></TableCell>
                              <TableCell key={`${idx}-remarks-header`} className="font-bold text-xs border p-1 min-w-[140px] bg-muted text-center">Remarks</TableCell>
                            </>
                          ))}
                        </TableRow>

                        {/* Store Rows */}
                        {areaStores.map(([storeName, storeData], storeIndex) => {
                          globalRowNum++;
                          return (
                            <TableRow key={`${area}-${storeName}`} className="hover:bg-muted/30">
                              <TableCell className="text-xs border p-1 text-center font-medium w-[30px]">
                                {globalRowNum}
                              </TableCell>
                              <TableCell className="text-xs border p-1 font-medium min-w-[160px]">
                                {storeName}
                              </TableCell>
                              <TableCell className="text-xs border p-1 text-center font-bold text-primary w-[50px]">
                                {storeData.category || '-'}
                              </TableCell>
                              {Array.from({ length: maxVisits }).map((_, colIdx) => {
                                const visit = storeData.visits[colIdx];
                                
                                return (
                                  <>
                                    {/* Date Cell */}
                                    <TableCell 
                                      key={`${colIdx}-date`}
                                      className={cn(
                                        "text-xs border p-1 min-w-[180px] cursor-pointer hover:bg-accent/50 transition-colors align-top",
                                        visit ? "bg-background" : "bg-muted/20"
                                      )}
                                      onClick={() => visit ? handleCellClick(visit) : handleEmptyCellClick(area, storeName, storeData.category)}
                                    >
                                      {visit ? (
                                        <div className="flex flex-col gap-0.5">
                                          <span className="font-medium text-primary">
                                            {formatDateDisplay(visit.visit_date)}
                                          </span>
                                          <span className="text-muted-foreground">
                                            Store Visit
                                          </span>
                                        </div>
                                      ) : null}
                                    </TableCell>
                                    {/* Remarks Cell */}
                                    <TableCell 
                                      key={`${colIdx}-remarks`}
                                      className={cn(
                                        "text-xs border p-1 min-w-[140px] cursor-pointer hover:bg-accent/50 transition-colors align-top",
                                        visit ? "bg-background" : "bg-muted/20"
                                      )}
                                      onClick={() => visit ? handleCellClick(visit) : handleEmptyCellClick(area, storeName, storeData.category)}
                                    >
                                      {visit?.remarks && (
                                        <span className="text-muted-foreground">
                                          {visit.remarks}
                                        </span>
                                      )}
                                    </TableCell>
                                  </>
                                );
                              })}
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    );
                  })}
                  {Object.keys(groupedSchedules).length === 0 && (
                    <TableBody>
                      <TableRow>
                        <TableCell colSpan={3 + (maxVisits * 2)} className="text-center py-8 text-muted-foreground">
                          No store visit schedules found. Click any cell to add a schedule.
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  )}
                </Table>
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => { if (!open) { resetForm(); setEditingSchedule(null); } setIsDialogOpen(open); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingSchedule ? 'Edit Schedule' : 'Add Schedule'}</DialogTitle>
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
                placeholder="e.g., METRO Market Market"
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
                    {formVisitDate ? format(formVisitDate, 'MMMM d, yyyy | EEEE') : 'Pick a date'}
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
                placeholder="e.g., Sir Ken, Sir RR"
              />
            </div>
            <div className="flex justify-between">
              {editingSchedule && isAdmin && (
                <Button 
                  variant="destructive" 
                  onClick={() => deleteMutation.mutate(editingSchedule.id)}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete
                </Button>
              )}
              <div className="flex gap-2 ml-auto">
                <Button variant="outline" onClick={() => { resetForm(); setEditingSchedule(null); setIsDialogOpen(false); }}>
                  Cancel
                </Button>
                <Button onClick={handleSubmit} disabled={addMutation.isPending || updateMutation.isPending}>
                  {editingSchedule ? 'Update' : 'Add'}
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
