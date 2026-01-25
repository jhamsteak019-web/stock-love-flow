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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Plus, ChevronLeft, ChevronRight, CalendarIcon, Trash2 } from 'lucide-react';
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

interface EditingCell {
  area: string;
  storeName: string;
  category: string | null;
  columnIndex: number;
  field: 'date' | 'remarks';
  existingSchedule?: StoreVisitSchedule;
}

const AREAS = ['NCR', 'NORTH AREA', 'SOUTH AREA', 'VISAYAS AREA', 'MINDANAO AREA'];
const CATEGORIES = ['BSW', 'BSWU', 'BWU', 'BSU', 'BW', 'BS', 'BU', 'SW', 'SU', 'WU', 'B', 'S', 'W', 'U'];
const MAX_COLUMNS = 16; // Maximum number of date/remarks column pairs

const StoreVisitSchedule = () => {
  const { user, userRole } = useAuth();
  const { selectedBranch } = useBranch();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<StoreVisitSchedule | null>(null);
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [cellValue, setCellValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Form state for add dialog
  const [formArea, setFormArea] = useState('');
  const [formStoreName, setFormStoreName] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formVisitDate, setFormVisitDate] = useState<Date | undefined>(undefined);
  const [formRemarks, setFormRemarks] = useState('');

  const isAdmin = userRole === 'admin';
  const canEdit = userRole === 'admin' || userRole === 'staff' || userRole === 'uploader' || userRole === 'teamleader' || userRole === 'oic';

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);

  // Focus input when editing cell
  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editingCell]);

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

  // Group schedules by area and store, with visits as ordered array
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

    // Sort visits by date for each store
    Object.values(grouped).forEach(stores => {
      Object.values(stores).forEach(storeData => {
        storeData.visits.sort((a, b) => 
          new Date(a.visit_date).getTime() - new Date(b.visit_date).getTime()
        );
      });
    });
    
    return grouped;
  }, [schedules]);

  // Calculate max visits across all stores for column count
  const maxVisits = useMemo(() => {
    let max = 0;
    Object.values(groupedSchedules).forEach(stores => {
      Object.values(stores).forEach(storeData => {
        max = Math.max(max, storeData.visits.length);
      });
    });
    return Math.max(max, 1); // At least 1 column pair
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
      setEditingCell(null);
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (data: { id: string; area?: string; store_name?: string; category?: string; visit_date?: string; remarks?: string }) => {
      const updateData: Record<string, unknown> = {};
      if (data.area !== undefined) updateData.area = data.area;
      if (data.store_name !== undefined) updateData.store_name = data.store_name;
      if (data.category !== undefined) updateData.category = data.category || null;
      if (data.visit_date !== undefined) updateData.visit_date = data.visit_date;
      if (data.remarks !== undefined) updateData.remarks = data.remarks || null;

      const { error } = await supabase
        .from('store_visit_schedules')
        .update(updateData)
        .eq('id', data.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['store-visit-schedules'] });
      toast({ title: 'Success', description: 'Updated' });
      resetForm();
      setEditingSchedule(null);
      setEditingCell(null);
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
      toast({ title: 'Success', description: 'Deleted' });
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

  const handleAddSubmit = () => {
    if (!formArea || !formStoreName || !formVisitDate) {
      toast({ title: 'Error', description: 'Please fill in required fields', variant: 'destructive' });
      return;
    }

    addMutation.mutate({
      area: formArea,
      store_name: formStoreName,
      category: formCategory,
      visit_date: format(formVisitDate, 'yyyy-MM-dd'),
      remarks: formRemarks,
    });
  };

  const handleEditSubmit = () => {
    if (!editingSchedule || !formArea || !formStoreName || !formVisitDate) {
      toast({ title: 'Error', description: 'Please fill in required fields', variant: 'destructive' });
      return;
    }

    updateMutation.mutate({
      id: editingSchedule.id,
      area: formArea,
      store_name: formStoreName,
      category: formCategory,
      visit_date: format(formVisitDate, 'yyyy-MM-dd'),
      remarks: formRemarks,
    });
  };

  const handleEdit = (schedule: StoreVisitSchedule) => {
    setEditingSchedule(schedule);
    setFormArea(schedule.area);
    setFormStoreName(schedule.store_name);
    setFormCategory(schedule.category || '');
    setFormVisitDate(new Date(schedule.visit_date));
    setFormRemarks(schedule.remarks || '');
  };

  // Handle cell click - start inline editing
  const handleCellClick = (
    area: string, 
    storeName: string, 
    category: string | null, 
    columnIndex: number, 
    field: 'date' | 'remarks',
    existingSchedule?: StoreVisitSchedule
  ) => {
    if (!canEdit) return;

    setEditingCell({ area, storeName, category, columnIndex, field, existingSchedule });
    
    if (existingSchedule) {
      if (field === 'date') {
        setCellValue(format(parseISO(existingSchedule.visit_date), 'MMMM d, yyyy | EEEE'));
      } else {
        setCellValue(existingSchedule.remarks || '');
      }
    } else {
      setCellValue('');
    }
  };

  // Handle cell blur - save the value
  const handleCellBlur = () => {
    if (!editingCell) return;

    const { existingSchedule, field } = editingCell;

    if (existingSchedule) {
      // Update existing
      if (field === 'remarks') {
        updateMutation.mutate({ id: existingSchedule.id, remarks: cellValue });
      }
      // Date field: open the dialog for date picker
    } else {
      // If entering data and it's not empty, we need both date and remarks
      // For new entry, open the full dialog
    }

    setEditingCell(null);
    setCellValue('');
  };

  // Handle key press in cell
  const handleCellKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCellBlur();
    } else if (e.key === 'Escape') {
      setEditingCell(null);
      setCellValue('');
    }
  };

  // Open add dialog for a specific cell
  const handleAddForCell = (area: string, storeName: string, category: string | null) => {
    setFormArea(area);
    setFormStoreName(storeName);
    setFormCategory(category || '');
    setFormVisitDate(undefined);
    setFormRemarks('');
    setIsAddDialogOpen(true);
  };

  // Format date for display
  const formatDateDisplay = (dateStr: string) => {
    const date = parseISO(dateStr);
    return format(date, 'MMMM d, yyyy | EEEE');
  };

  return (
    <div className="space-y-4 p-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-xl font-bold">SCHEDULE NCR and Province</CardTitle>
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
                        placeholder="e.g., Store Visit"
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => { resetForm(); setIsAddDialogOpen(false); }}>
                        Cancel
                      </Button>
                      <Button onClick={handleAddSubmit} disabled={addMutation.isPending}>
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
                <Table className="border">
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="sticky left-0 bg-muted z-20 min-w-[140px] border font-bold text-center" rowSpan={2}>
                        AREA
                      </TableHead>
                      <TableHead className="sticky left-[140px] bg-muted z-20 min-w-[60px] border font-bold text-center" rowSpan={2}>
                        CAT
                      </TableHead>
                      {Array.from({ length: Math.max(maxVisits, 1) }).map((_, idx) => (
                        <TableHead key={idx} colSpan={2} className="border text-center bg-muted font-bold min-w-[280px]">
                          {/* Empty header - visits are shown per row */}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {AREAS.map((area) => {
                      const areaStores = Object.entries(groupedSchedules[area] || {});
                      if (areaStores.length === 0) return null;
                      
                      return areaStores.map(([storeName, storeData], storeIndex) => (
                        <TableRow key={`${area}-${storeName}`} className="hover:bg-muted/30">
                          {storeIndex === 0 ? (
                            <TableCell 
                              className="sticky left-0 bg-destructive/10 z-10 font-bold text-destructive text-xs border align-top"
                              rowSpan={areaStores.length}
                            >
                              {area}
                            </TableCell>
                          ) : null}
                          <TableCell className="sticky left-[140px] bg-background z-10 text-xs text-center font-bold text-primary border">
                            {storeData.category || '-'}
                          </TableCell>
                          {Array.from({ length: Math.max(maxVisits, 1) }).map((_, colIdx) => {
                            const visit = storeData.visits[colIdx];
                            const isEditingDateCell = editingCell?.area === area && 
                              editingCell?.storeName === storeName && 
                              editingCell?.columnIndex === colIdx && 
                              editingCell?.field === 'date';
                            const isEditingRemarksCell = editingCell?.area === area && 
                              editingCell?.storeName === storeName && 
                              editingCell?.columnIndex === colIdx && 
                              editingCell?.field === 'remarks';

                            return (
                              <>
                                {/* Date Cell */}
                                <TableCell 
                                  key={`${colIdx}-date`}
                                  className={cn(
                                    "border text-xs p-1 min-w-[140px] cursor-pointer hover:bg-accent transition-colors align-top",
                                    visit && "bg-accent/30"
                                  )}
                                  onClick={() => visit ? handleEdit(visit) : handleAddForCell(area, storeName, storeData.category)}
                                >
                                  <div className="flex flex-col">
                                    {visit ? (
                                      <>
                                        <span className="font-medium text-primary">
                                          {formatDateDisplay(visit.visit_date)}
                                        </span>
                                        <span className="text-muted-foreground">{storeName}</span>
                                      </>
                                    ) : (
                                      <span className="text-muted-foreground/50 italic">Click to add</span>
                                    )}
                                  </div>
                                </TableCell>
                                {/* Remarks Cell */}
                                <TableCell 
                                  key={`${colIdx}-remarks`}
                                  className={cn(
                                    "border text-xs p-1 min-w-[140px] cursor-pointer hover:bg-accent transition-colors align-top",
                                    visit && "bg-accent/30"
                                  )}
                                  onClick={() => {
                                    if (visit) {
                                      handleCellClick(area, storeName, storeData.category, colIdx, 'remarks', visit);
                                    }
                                  }}
                                >
                                  {isEditingRemarksCell ? (
                                    <Input
                                      ref={inputRef}
                                      value={cellValue}
                                      onChange={(e) => setCellValue(e.target.value)}
                                      onBlur={handleCellBlur}
                                      onKeyDown={handleCellKeyDown}
                                      className="h-6 text-xs p-1"
                                      placeholder="Enter remarks"
                                    />
                                  ) : (
                                    <span className="text-muted-foreground">
                                      {visit?.remarks || (visit ? '-' : '')}
                                    </span>
                                  )}
                                </TableCell>
                              </>
                            );
                          })}
                        </TableRow>
                      ));
                    })}
                    {Object.keys(groupedSchedules).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={2 + (maxVisits * 2)} className="text-center py-8 text-muted-foreground">
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
                <Button onClick={handleEditSubmit} disabled={updateMutation.isPending}>
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
