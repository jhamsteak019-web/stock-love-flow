import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { useToast } from '@/hooks/use-toast';
import { format, parseISO } from 'date-fns';
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
import { CalendarIcon, Trash2, Search, FileSpreadsheet, FileText, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDebounce } from '@/hooks/useDebounce';

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
const MAX_COLUMNS = 45; // 45 Remarks columns

const StoreVisitSchedule = () => {
  const { user, userRole } = useAuth();
  const { selectedBranch } = useBranch();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<StoreVisitSchedule | null>(null);
  const [viewingSchedule, setViewingSchedule] = useState<StoreVisitSchedule | null>(null);
  
  // Search and filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterArea, setFilterArea] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const debouncedSearch = useDebounce(searchQuery, 300);

  // Form state
  const [formArea, setFormArea] = useState('');
  const [formStoreName, setFormStoreName] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formVisitDate, setFormVisitDate] = useState<Date | undefined>(undefined);
  const [formActivity, setFormActivity] = useState('');
  const [formRemarks, setFormRemarks] = useState('');

  const isAdmin = userRole === 'admin';
  const canEdit = userRole === 'admin' || userRole === 'staff' || userRole === 'uploader' || userRole === 'teamleader' || userRole === 'oic';

  // Fetch schedules for the year
  const { data: schedules = [], isLoading } = useQuery({
    queryKey: ['store-visit-schedules', selectedBranch?.id, currentYear],
    queryFn: async () => {
      let query = supabase
        .from('store_visit_schedules')
        .select('*')
        .gte('visit_date', `${currentYear}-01-01`)
        .lte('visit_date', `${currentYear}-12-31`)
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

  // Filter schedules based on search and filters
  const filteredSchedules = useMemo(() => {
    return schedules.filter(schedule => {
      const searchLower = debouncedSearch.toLowerCase();
      const matchesSearch = !debouncedSearch || 
        schedule.store_name.toLowerCase().includes(searchLower) ||
        (schedule.remarks?.toLowerCase().includes(searchLower));
      
      const matchesArea = filterArea === 'all' || schedule.area === filterArea;
      const matchesCategory = filterCategory === 'all' || schedule.category === filterCategory;
      
      return matchesSearch && matchesArea && matchesCategory;
    });
  }, [schedules, debouncedSearch, filterArea, filterCategory]);

  // Group schedules by area and store
  const groupedSchedules = useMemo(() => {
    const grouped: Record<string, Record<string, { 
      category: string | null; 
      visits: StoreVisitSchedule[];
    }>> = {};
    
    filteredSchedules.forEach((schedule) => {
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
  }, [filteredSchedules]);

  // Calculate max visits across all stores
  const maxVisits = useMemo(() => {
    let max = 0;
    Object.values(groupedSchedules).forEach(stores => {
      Object.values(stores).forEach(storeData => {
        max = Math.max(max, storeData.visits.length);
      });
    });
    return Math.max(max + 1, MAX_COLUMNS);
  }, [groupedSchedules]);

  // Mutations
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
    setFormActivity('');
    setFormRemarks('');
  };

  const parseRemarks = (remarks: string | null) => {
    if (!remarks) return { activity: '', names: '' };
    const parts = remarks.split('|');
    return {
      activity: parts[0]?.trim() || '',
      names: parts[1]?.trim() || '',
    };
  };

  const handleSubmit = () => {
    if (!formArea || !formStoreName || !formVisitDate) {
      toast({ title: 'Error', description: 'Please fill in Area, Store Name, and Date', variant: 'destructive' });
      return;
    }

    const combinedRemarks = formActivity && formRemarks 
      ? `${formActivity}|${formRemarks}`
      : formActivity || formRemarks;

    const data = {
      area: formArea,
      store_name: formStoreName,
      category: formCategory,
      visit_date: format(formVisitDate, 'yyyy-MM-dd'),
      remarks: combinedRemarks,
    };

    if (editingSchedule) {
      updateMutation.mutate({ ...data, id: editingSchedule.id });
    } else {
      addMutation.mutate(data);
    }
  };

  const handleCellClick = (schedule: StoreVisitSchedule) => {
    if (canEdit) {
      const parsed = parseRemarks(schedule.remarks);
      setEditingSchedule(schedule);
      setFormArea(schedule.area);
      setFormStoreName(schedule.store_name);
      setFormCategory(schedule.category || '');
      setFormVisitDate(new Date(schedule.visit_date));
      setFormActivity(parsed.activity);
      setFormRemarks(parsed.names);
      setIsDialogOpen(true);
    } else {
      setViewingSchedule(schedule);
    }
  };

  const handleEmptyCellClick = (area: string, storeName: string, category: string | null) => {
    if (!canEdit) return;
    setEditingSchedule(null);
    setFormArea(area);
    setFormStoreName(storeName);
    setFormCategory(category || '');
    setFormVisitDate(undefined);
    setFormActivity('');
    setFormRemarks('');
    setIsDialogOpen(true);
  };

  const formatDateDisplay = (dateStr: string) => {
    const date = parseISO(dateStr);
    return format(date, "MMMM d,yyyy '(' EEEE ')'");
  };

  // Export to Excel
  const exportToExcel = async () => {
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Store Visit Schedule');

    // Add title
    worksheet.mergeCells('A1:M1');
    worksheet.getCell('A1').value = `METRO GROUP ${currentYear} - SCHEDULE NCR and Province`;
    worksheet.getCell('A1').font = { bold: true, size: 14 };

    let rowIndex = 3;
    let storeNum = 0;

    AREAS.forEach(area => {
      const areaStores = Object.entries(groupedSchedules[area] || {});
      if (areaStores.length === 0) return;

      // Area header
      worksheet.getCell(`A${rowIndex}`).value = area;
      worksheet.getCell(`A${rowIndex}`).font = { bold: true, color: { argb: 'FF0000FF' } };
      worksheet.getCell(`B${rowIndex}`).value = 'CAT';
      for (let i = 0; i < maxVisits; i++) {
        worksheet.getCell(rowIndex, 3 + i).value = 'Remarks';
      }
      rowIndex++;

      areaStores.forEach(([storeName, storeData]) => {
        storeNum++;
        // Row 1: Dates
        worksheet.getCell(`A${rowIndex}`).value = `${storeNum} ${storeName}`;
        worksheet.getCell(`B${rowIndex}`).value = storeData.category || '-';
        storeData.visits.forEach((visit, idx) => {
          worksheet.getCell(rowIndex, 3 + idx).value = formatDateDisplay(visit.visit_date);
          worksheet.getCell(rowIndex, 3 + idx).font = { color: { argb: 'FFFF0000' } };
        });
        rowIndex++;

        // Row 2: Activities
        worksheet.getCell(`A${rowIndex}`).value = '';
        worksheet.getCell(`B${rowIndex}`).value = '';
        storeData.visits.forEach((visit, idx) => {
          const parsed = parseRemarks(visit.remarks);
          worksheet.getCell(rowIndex, 3 + idx).value = parsed.activity;
        });
        rowIndex++;

        // Row 3: Names
        worksheet.getCell(`A${rowIndex}`).value = '';
        worksheet.getCell(`B${rowIndex}`).value = '';
        storeData.visits.forEach((visit, idx) => {
          const parsed = parseRemarks(visit.remarks);
          worksheet.getCell(rowIndex, 3 + idx).value = parsed.names;
        });
        rowIndex++;
      });
      rowIndex++;
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Store_Visit_Schedule_${currentYear}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Success', description: 'Excel exported successfully' });
  };

  // Export to PDF
  const exportToPDF = async () => {
    const { default: jsPDF } = await import('jspdf');
    await import('jspdf-autotable');
    
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    
    doc.setFontSize(16);
    doc.text(`METRO GROUP ${currentYear}`, 14, 15);
    doc.setFontSize(12);
    doc.text('SCHEDULE NCR and Province', 14, 22);

    let yPos = 30;
    let storeNum = 0;

    AREAS.forEach(area => {
      const areaStores = Object.entries(groupedSchedules[area] || {});
      if (areaStores.length === 0) return;

      doc.setFontSize(10);
      doc.setTextColor(0, 0, 255);
      doc.text(area, 14, yPos);
      yPos += 5;
      doc.setTextColor(0, 0, 0);

      areaStores.forEach(([storeName, storeData]) => {
        storeNum++;
        if (yPos > 180) {
          doc.addPage();
          yPos = 20;
        }
        
        doc.setFontSize(9);
        doc.text(`${storeNum}. ${storeName} (${storeData.category || '-'})`, 14, yPos);
        yPos += 4;

        storeData.visits.slice(0, 4).forEach(visit => {
          const parsed = parseRemarks(visit.remarks);
          doc.setTextColor(255, 0, 0);
          doc.text(`  ${formatDateDisplay(visit.visit_date)}`, 18, yPos);
          yPos += 3;
          doc.setTextColor(0, 0, 0);
          doc.text(`    ${parsed.activity} - ${parsed.names}`, 18, yPos);
          yPos += 4;
        });
        yPos += 2;
      });
      yPos += 5;
    });

    doc.save(`Store_Visit_Schedule_${currentYear}.pdf`);
    toast({ title: 'Success', description: 'PDF exported successfully' });
  };

  let globalRowNum = 0;

  return (
    <div className="space-y-4 p-4">
      <Card className="bg-white">
        <CardHeader className="pb-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <p className="text-sm text-muted-foreground font-medium">METRO GROUP {currentYear}</p>
              <CardTitle className="text-xl font-bold text-primary">SCHEDULE NCR and Province</CardTitle>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* Year selector */}
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" onClick={() => setCurrentYear(currentYear - 1)}>
                  ←
                </Button>
                <span className="font-medium min-w-[60px] text-center">{currentYear}</span>
                <Button variant="outline" size="sm" onClick={() => setCurrentYear(currentYear + 1)}>
                  →
                </Button>
              </div>
              
              {/* Add Schedule Button */}
              {canEdit && (
                <Button size="sm" onClick={() => { resetForm(); setEditingSchedule(null); setIsDialogOpen(true); }}>
                  + Add Schedule
                </Button>
              )}
              
              {/* Export buttons */}
              <Button variant="outline" size="sm" onClick={exportToExcel}>
                <FileSpreadsheet className="h-4 w-4 mr-1" />
                Excel
              </Button>
              <Button variant="outline" size="sm" onClick={exportToPDF}>
                <FileText className="h-4 w-4 mr-1" />
                PDF
              </Button>
            </div>
          </div>
          
          {/* Search and Filters */}
          <div className="flex flex-wrap items-center gap-3 mt-4">
            <div className="relative flex-1 min-w-[200px] max-w-[300px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search store or staff..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filterArea} onValueChange={setFilterArea}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Filter Area" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Areas</SelectItem>
                {AREAS.map(area => (
                  <SelectItem key={area} value={area}>{area}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="Filter CAT" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All CAT</SelectItem>
                {CATEGORIES.map(cat => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-8">Loading...</div>
          ) : (
            <ScrollArea className="w-full">
              <div className="min-w-max border border-black">
                <Table className="text-[11px] bg-white" style={{ borderCollapse: 'collapse' }}>
                  {/* Sticky Header */}
                  <TableHeader className="sticky top-0 z-30 bg-white">
                    <TableRow>
                      <TableHead className="bg-gray-100 border border-black w-[30px] text-center font-bold text-black p-1">#</TableHead>
                      <TableHead className="bg-gray-100 border border-black min-w-[150px] font-bold text-black p-1">Store Name</TableHead>
                      <TableHead className="bg-gray-100 border border-black text-center font-bold text-black p-1" style={{ width: '69px', minWidth: '69px' }}>CAT</TableHead>
                      {Array.from({ length: maxVisits }).map((_, idx) => (
                        <TableHead key={idx} className="bg-gray-100 border border-black text-center font-bold text-black p-1" style={{ width: '239px', minWidth: '239px' }}>
                          Remarks
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  
                  {AREAS.filter(area => filterArea === 'all' || area === filterArea).map((area) => {
                    const areaStores = Object.entries(groupedSchedules[area] || {});
                    if (areaStores.length === 0) return null;

                    return (
                      <TableBody key={area}>
                        {/* Area Header Row - Blue */}
                        <TableRow>
                          <TableCell colSpan={3 + maxVisits} className="bg-blue-600 font-bold text-white text-sm border border-black py-1 px-2">
                            {area}
                          </TableCell>
                        </TableRow>

                        {/* Store Rows */}
                        {areaStores.map(([storeName, storeData]) => {
                          globalRowNum++;
                          const rowNum = globalRowNum;
                          
                          return (
                            <>
                              {/* Row 1: Row Number, Store Name, Category, Dates (RED) */}
                              <TableRow key={`${area}-${storeName}-1`} className="bg-white">
                                <TableCell className="border border-black text-center font-medium p-1 align-top" rowSpan={3}>
                                  {rowNum}
                                </TableCell>
                                <TableCell className="border border-black font-medium p-1 align-top" rowSpan={3}>
                                  {storeName}
                                </TableCell>
                                <TableCell className="border border-black text-center font-bold text-blue-600 p-1 align-top" rowSpan={3} style={{ width: '69px', minWidth: '69px', height: '86px' }}>
                                  {storeData.category || '-'}
                                </TableCell>
                                {Array.from({ length: maxVisits }).map((_, colIdx) => {
                                  const visit = storeData.visits[colIdx];
                                  return (
                                    <TableCell 
                                      key={`${colIdx}-date`}
                                      className="border border-black cursor-pointer hover:bg-yellow-50 transition-colors text-red-600 font-medium p-1 align-top"
                                      style={{ width: '239px', minWidth: '239px', height: '27px' }}
                                      onClick={() => visit ? handleCellClick(visit) : handleEmptyCellClick(area, storeName, storeData.category)}
                                    >
                                      {visit ? formatDateDisplay(visit.visit_date) : ''}
                                    </TableCell>
                                  );
                                })}
                              </TableRow>
                              
                              {/* Row 2: Activity Type (BLACK) */}
                              <TableRow key={`${area}-${storeName}-2`} className="bg-white">
                                {Array.from({ length: maxVisits }).map((_, colIdx) => {
                                  const visit = storeData.visits[colIdx];
                                  const parsed = parseRemarks(visit?.remarks);
                                  return (
                                    <TableCell 
                                      key={`${colIdx}-activity`}
                                      className="border border-black cursor-pointer hover:bg-yellow-50 transition-colors text-black p-1"
                                      style={{ width: '239px', minWidth: '239px', height: '27px' }}
                                      onClick={() => visit ? handleCellClick(visit) : handleEmptyCellClick(area, storeName, storeData.category)}
                                    >
                                      {parsed.activity}
                                    </TableCell>
                                  );
                                })}
                              </TableRow>
                              
                              {/* Row 3: Names/Remarks (BLACK) */}
                              <TableRow key={`${area}-${storeName}-3`} className="bg-white">
                                {Array.from({ length: maxVisits }).map((_, colIdx) => {
                                  const visit = storeData.visits[colIdx];
                                  const parsed = parseRemarks(visit?.remarks);
                                  return (
                                    <TableCell 
                                      key={`${colIdx}-names`}
                                      className="border border-black cursor-pointer hover:bg-yellow-50 transition-colors text-black p-1"
                                      style={{ width: '239px', minWidth: '239px', height: '27px' }}
                                      onClick={() => visit ? handleCellClick(visit) : handleEmptyCellClick(area, storeName, storeData.category)}
                                    >
                                      {parsed.names}
                                    </TableCell>
                                  );
                                })}
                              </TableRow>
                            </>
                          );
                        })}
                      </TableBody>
                    );
                  })}
                  
                  {Object.keys(groupedSchedules).length === 0 && (
                    <TableBody>
                      <TableRow>
                        <TableCell colSpan={3 + maxVisits} className="text-center py-8 text-muted-foreground border border-black">
                          No store visit schedules found. {canEdit ? 'Click "+ Add Schedule" to add a new entry.' : ''}
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingSchedule ? 'Edit Remarks' : 'Add Remarks'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Show store info if already set (from clicking cell) */}
            {formStoreName && (
              <div className="bg-muted p-3 rounded-md space-y-1">
                <div className="text-sm"><strong>Store:</strong> {formStoreName}</div>
                <div className="text-sm"><strong>Area:</strong> {formArea}</div>
                <div className="text-sm"><strong>CAT:</strong> {formCategory || '-'}</div>
              </div>
            )}
            
            {/* Only show area/store/cat inputs when adding brand new schedule */}
            {!formStoreName && (
              <>
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
                  <Label>Category (CAT)</Label>
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
              </>
            )}
            
            <div className="space-y-2">
              <Label>Visit Date *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !formVisitDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formVisitDate ? format(formVisitDate, "MMMM d, yyyy '(' EEEE ')'") : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={formVisitDate} onSelect={setFormVisitDate} initialFocus />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>Activity</Label>
              <Input 
                value={formActivity} 
                onChange={(e) => setFormActivity(e.target.value)}
                placeholder="e.g., Store Visit, Store Inventory, Support Event"
              />
            </div>
            <div className="space-y-2">
              <Label>Assigned Staff</Label>
              <Input 
                value={formRemarks} 
                onChange={(e) => setFormRemarks(e.target.value)}
                placeholder="e.g., Sir RR, Niño, Marvin"
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
                  {editingSchedule ? 'Update' : 'Add Remarks'}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Details Dialog (for non-editors) */}
      <Dialog open={!!viewingSchedule} onOpenChange={(open) => !open && setViewingSchedule(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule Details</DialogTitle>
          </DialogHeader>
          {viewingSchedule && (
            <div className="space-y-3">
              <div><strong>Store:</strong> {viewingSchedule.store_name}</div>
              <div><strong>Area:</strong> {viewingSchedule.area}</div>
              <div><strong>Category:</strong> {viewingSchedule.category || '-'}</div>
              <div><strong>Date:</strong> <span className="text-red-600">{formatDateDisplay(viewingSchedule.visit_date)}</span></div>
              <div><strong>Activity:</strong> {parseRemarks(viewingSchedule.remarks).activity || '-'}</div>
              <div><strong>Staff:</strong> {parseRemarks(viewingSchedule.remarks).names || '-'}</div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StoreVisitSchedule;
