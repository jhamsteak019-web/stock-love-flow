import { useState, useMemo, useRef } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { Search, Calendar, Filter, FileDown, Plus, Upload, X, Eye, Pencil, Trash2, RotateCcw } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import ColumnSettings, { GenericColumnConfig } from '@/components/common/ColumnSettings';
import { useGenericColumnSettings } from '@/hooks/useGenericColumnSettings';

const defaultResumeColumns: GenericColumnConfig[] = [
  { key: 'photo', label: 'Photo', visible: true, width: 60, minWidth: 50, maxWidth: 80 },
  { key: 'name', label: 'Employee Name', visible: true, width: 150, minWidth: 100, maxWidth: 250 },
  { key: 'branch', label: 'Branch', visible: true, width: 120, minWidth: 80, maxWidth: 180 },
  { key: 'date', label: 'Date', visible: true, width: 120, minWidth: 100, maxWidth: 150 },
  { key: 'status', label: 'Status', visible: true, width: 120, minWidth: 80, maxWidth: 150 },
  { key: 'reason', label: 'Reason', visible: true, width: 150, minWidth: 100, maxWidth: 250 },
  { key: 'date_of_resume', label: 'Date of Resume', visible: true, width: 130, minWidth: 100, maxWidth: 160 },
  { key: 'remarks', label: 'Remarks', visible: true, width: 150, minWidth: 100, maxWidth: 250 },
  { key: 'actions', label: 'Actions', visible: true, width: 100, minWidth: 80, maxWidth: 130 },
];


const months = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

const statusOptions = [
  'Absent',
  'Late',
  'Half Day',
  'Undertime',
  'Suspension',
  'Unauthorized Absent',
  'SIL',
  'VL',
  'Change Day off',
  'Change of Schedule',
  'Cancel Day off',
  'Other Concern'
];

const ResumeToWork = () => {
  const queryClient = useQueryClient();
  const { userRole } = useAuth();
  const { selectedBranch: globalSelectedBranch } = useBranch();
  
  // Column settings
  const { columns, setColumns, isAdmin: isColumnAdmin } = useGenericColumnSettings('resume-to-work', defaultResumeColumns);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMonth, setSelectedMonth] = useState<string>((new Date().getMonth() + 1).toString());
  const [selectedYear, setSelectedYear] = useState<string>(currentYear.toString());
  const [localSelectedBranch, setLocalSelectedBranch] = useState<string>('all');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [showAllYear, setShowAllYear] = useState(false);
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formEmployeeId, setFormEmployeeId] = useState('');
  const [formDate, setFormDate] = useState<Date | undefined>(undefined);
  const [formStatus, setFormStatus] = useState('');
  const [formReason, setFormReason] = useState('');
  const [formDateOfResume, setFormDateOfResume] = useState<Date | undefined>(undefined);
  const [formRemarks, setFormRemarks] = useState('');
  const [formPhoto, setFormPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // View/Edit modal state
  const [viewingRecord, setViewingRecord] = useState<any | null>(null);
  const [editingRecord, setEditingRecord] = useState<any | null>(null);

  const isAdmin = userRole === 'admin';
  const canEdit = userRole === 'admin' || userRole === 'staff';

  // Get the effective branch id for filtering (use branch_id instead of branch name)
  const globalBranchId = globalSelectedBranch?.id || null;

  // Fetch employees for dropdown and count - filtered by global branch using branch_id
  const { data: employees = [] } = useQuery({
    queryKey: ['employees-for-resume', globalBranchId],
    queryFn: async () => {
      let query = supabase
        .from('employees')
        .select('id, full_name, branch, branch_id, photo_url, branches:branch_id (name), employment_status')
        .eq('is_active', true)
        .order('full_name');
      
      // Filter by global branch using branch_id
      if (globalBranchId) {
        query = query.eq('branch_id', globalBranchId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    }
  });


  // Fetch attendance records that are absent-related OR have date_of_resume (active only)
  const { data: attendanceRecords = [], isLoading } = useQuery({
    queryKey: ['resume-to-work', selectedMonth, selectedYear, showAllYear],
    queryFn: async () => {
      // Absence-related statuses that should appear in Resume to Work
      const absenceStatuses = ['absent', 'suspension', 'unauthorized absent', 'sil', 'vl'];
      
      const startDate = !showAllYear 
        ? new Date(parseInt(selectedYear), parseInt(selectedMonth) - 1, 1)
        : new Date(parseInt(selectedYear), 0, 1);
      const endDate = !showAllYear 
        ? new Date(parseInt(selectedYear), parseInt(selectedMonth), 0)
        : new Date(parseInt(selectedYear), 11, 31);

      // Fetch records with absence status OR with date_of_resume (excluding deleted)
      const { data, error } = await supabase
        .from('attendance_records')
        .select(`
          *,
          employees!attendance_records_employee_id_fkey (
            id,
            full_name,
            photo_url,
            branch,
            branch_id,
            branches:branch_id (name)
          )
        `)
        .is('deleted_at', null)
        .or(`status.in.(${absenceStatuses.join(',')}),date_of_resume.not.is.null`)
        .gte('attendance_date', format(startDate, 'yyyy-MM-dd'))
        .lte('attendance_date', format(endDate, 'yyyy-MM-dd'))
        .order('attendance_date', { ascending: false });

      if (error) throw error;
      return data || [];
    }
  });

  // Fetch deleted resume records
  const { data: deletedRecords = [] } = useQuery({
    queryKey: ['resume-to-work-deleted'],
    queryFn: async () => {
      const absenceStatuses = ['absent', 'suspension', 'unauthorized absent', 'sil', 'vl'];
      
      const { data, error } = await supabase
        .from('attendance_records')
        .select(`
          *,
          employees!attendance_records_employee_id_fkey (
            id,
            full_name,
            photo_url,
            branch,
            branch_id,
            branches:branch_id (name)
          )
        `)
        .not('deleted_at', 'is', null)
        .or(`status.in.(${absenceStatuses.join(',')}),date_of_resume.not.is.null`)
        .order('deleted_at', { ascending: false });

      if (error) throw error;
      return data || [];
    }
  });

  // Get unique branches from records
  const uniqueBranches = useMemo(() => {
    const branches = attendanceRecords
      .map(record => record.employees?.branch || record.employees?.branches?.name)
      .filter((branch): branch is string => !!branch && branch.trim() !== '');
    return [...new Set(branches)].sort();
  }, [attendanceRecords]);

  // Filter records - prioritize global branch using branch_id, then local filter
  const filteredRecords = useMemo(() => {
    return attendanceRecords.filter(record => {
      const employeeName = record.employees?.full_name?.toLowerCase() || '';
      const employeeBranchId = record.employees?.branch_id;
      const branch = record.employees?.branch || record.employees?.branches?.name || '';
      
      const matchesSearch = employeeName.includes(searchQuery.toLowerCase());
      
      // First filter by global branch using branch_id
      if (globalBranchId && employeeBranchId !== globalBranchId) {
        return false;
      }
      
      // Then apply local branch filter (still uses branch name for local dropdown)
      const matchesBranch = localSelectedBranch === 'all' || branch === localSelectedBranch;
      const matchesDate = !selectedDate || record.date_of_resume === format(selectedDate, 'yyyy-MM-dd');
      
      return matchesSearch && matchesBranch && matchesDate;
    });
  }, [attendanceRecords, searchQuery, globalBranchId, localSelectedBranch, selectedDate]);


  const getStatusBadge = (status: string) => {
    const statusLower = status?.toLowerCase() || '';
    const variants: Record<string, { variant: 'default' | 'destructive' | 'secondary' | 'outline'; label: string }> = {
      'present': { variant: 'default', label: 'Present' },
      'absent': { variant: 'destructive', label: 'Absent' },
      'late': { variant: 'secondary', label: 'Late' },
      'half day': { variant: 'outline', label: 'Half Day' },
      'undertime': { variant: 'outline', label: 'Undertime' },
      'suspension': { variant: 'destructive', label: 'Suspension' },
      'unauthorized absent': { variant: 'destructive', label: 'Unauthorized Absent' },
      'sil': { variant: 'secondary', label: 'SIL' },
      'vl': { variant: 'secondary', label: 'VL' },
    };
    
    const config = variants[statusLower] || { variant: 'outline', label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getStatusLabel = (status: string) => {
    const statusLower = status?.toLowerCase() || '';
    const labels: Record<string, string> = {
      'present': 'Present',
      'absent': 'Absent',
      'late': 'Late',
      'half day': 'Half Day',
      'undertime': 'Undertime',
      'suspension': 'Suspension',
      'unauthorized absent': 'Unauthorized Absent',
      'sil': 'SIL',
      'vl': 'VL',
    };
    return labels[statusLower] || status;
  };

  const handleSavePDF = () => {
    const doc = new jsPDF();
    
    // Title
    doc.setFontSize(16);
    doc.text('Resume to Work Report', 14, 15);
    
    // Date info
    doc.setFontSize(10);
    const dateInfo = showAllYear 
      ? `Year: ${selectedYear}` 
      : `${months[parseInt(selectedMonth) - 1]} ${selectedYear}`;
    doc.text(dateInfo, 14, 22);
    doc.text(`Generated: ${format(new Date(), 'MMM dd, yyyy')}`, 14, 27);

    // Table data
    const tableData = filteredRecords.map(record => [
      record.employees?.full_name || 'Unknown',
      record.employees?.branch || record.employees?.branches?.name || '-',
      record.date_of_absent 
        ? format(new Date(record.date_of_absent), 'MMM dd, yyyy')
        : record.attendance_date 
          ? format(new Date(record.attendance_date), 'MMM dd, yyyy')
          : '-',
      getStatusLabel(record.status),
      record.reason || '-',
      record.date_of_resume 
        ? format(new Date(record.date_of_resume), 'MMM dd, yyyy')
        : '-',
      record.remarks || '-'
    ]);

    autoTable(doc, {
      head: [['Employee Name', 'Branch', 'Date', 'Status', 'Reason', 'Date of Resume', 'Remarks']],
      body: tableData,
      startY: 32,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [59, 130, 246] },
    });

    doc.save(`resume-to-work-${selectedYear}-${selectedMonth}.pdf`);
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFormPhoto(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const resetForm = () => {
    setFormEmployeeId('');
    setFormDate(undefined);
    setFormStatus('');
    setFormReason('');
    setFormDateOfResume(undefined);
    setFormRemarks('');
    setFormPhoto(null);
    setPhotoPreview(null);
  };

  const handleSubmit = async () => {
    if (!formEmployeeId || !formDateOfResume || !formStatus) {
      toast.error('Please fill in Employee, Status, and Date of Resume fields');
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('attendance_records')
        .insert({
          employee_id: formEmployeeId,
          attendance_date: formDate ? format(formDate, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
          date_of_absent: formDate ? format(formDate, 'yyyy-MM-dd') : null,
          status: formStatus.toLowerCase(),
          reason: formReason || null,
          date_of_resume: format(formDateOfResume, 'yyyy-MM-dd'),
          remarks: formRemarks || null,
        });

      if (error) throw error;

      toast.success('Resume record added successfully');
      queryClient.invalidateQueries({ queryKey: ['resume-to-work'] });
      resetForm();
      setIsModalOpen(false);
    } catch (error: any) {
      toast.error(error.message || 'Failed to add record');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete mutation (soft delete)
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('attendance_records').update({
        deleted_at: new Date().toISOString()
      }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resume-to-work'] });
      queryClient.invalidateQueries({ queryKey: ['resume-to-work-deleted'] });
      toast.success('Record moved to Recently Deleted');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to delete record');
    }
  });

  // Restore mutation
  const restoreMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('attendance_records').update({
        deleted_at: null
      }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resume-to-work'] });
      queryClient.invalidateQueries({ queryKey: ['resume-to-work-deleted'] });
      toast.success('Record restored successfully');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to restore record');
    }
  });

  // Permanent delete mutation
  const permanentDeleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('attendance_records').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resume-to-work-deleted'] });
      toast.success('Record permanently deleted');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to delete record');
    }
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const { error } = await supabase.from('attendance_records').update(data).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resume-to-work'] });
      toast.success('Record updated successfully');
      setEditingRecord(null);
      resetForm();
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update record');
    }
  });

  const handleEdit = (record: any) => {
    setEditingRecord(record);
    setFormEmployeeId(record.employee_id);
    setFormDate(record.date_of_absent ? new Date(record.date_of_absent) : record.attendance_date ? new Date(record.attendance_date) : undefined);
    setFormStatus(record.status || '');
    setFormReason(record.reason || '');
    setFormDateOfResume(record.date_of_resume ? new Date(record.date_of_resume) : undefined);
    setFormRemarks(record.remarks || '');
    setPhotoPreview(record.employees?.photo_url || null);
  };

  const handleUpdateSubmit = async () => {
    if (!editingRecord || !formEmployeeId || !formDateOfResume || !formStatus) {
      toast.error('Please fill in Employee, Status, and Date of Resume fields');
      return;
    }

    updateMutation.mutate({
      id: editingRecord.id,
      data: {
        employee_id: formEmployeeId,
        attendance_date: formDate ? format(formDate, 'yyyy-MM-dd') : editingRecord.attendance_date,
        date_of_absent: formDate ? format(formDate, 'yyyy-MM-dd') : null,
        status: formStatus.toLowerCase(),
        reason: formReason || null,
        date_of_resume: format(formDateOfResume, 'yyyy-MM-dd'),
        remarks: formRemarks || null,
      }
    });
  };

  const selectedEmployee = employees.find(e => e.id === formEmployeeId);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Resume to Work</h1>
          <p className="text-muted-foreground">Track employees returning to work after absences</p>
        </div>
        <div className="flex gap-2">
          {isColumnAdmin && (
            <ColumnSettings 
              columns={columns} 
              onColumnChange={setColumns} 
              defaultColumns={defaultResumeColumns}
              excludeFromWidthControl={['photo', 'actions']}
            />
          )}
          <Button onClick={handleSavePDF} variant="outline" className="gap-2">
            <FileDown className="h-4 w-4" />
            Save PDF
          </Button>
          <Button className="gap-2" onClick={() => setIsModalOpen(true)}>
            <Plus className="h-4 w-4" />
            Add Record
          </Button>
        </div>
      </div>

      {/* Add Record Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Resume Record</DialogTitle>
          </DialogHeader>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
            {/* Photo */}
            <div className="md:col-span-2">
              <Label>Photo</Label>
              <div className="mt-2 flex items-center gap-4">
                {photoPreview ? (
                  <div className="relative">
                    <Avatar className="h-16 w-16">
                      <AvatarImage src={photoPreview} />
                      <AvatarFallback>P</AvatarFallback>
                    </Avatar>
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute -top-2 -right-2 h-5 w-5"
                      onClick={() => { setFormPhoto(null); setPhotoPreview(null); }}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : selectedEmployee?.photo_url ? (
                  <Avatar className="h-16 w-16">
                    <AvatarImage src={selectedEmployee.photo_url} />
                    <AvatarFallback>
                      {selectedEmployee.full_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                ) : (
                  <Avatar className="h-16 w-16">
                    <AvatarFallback>
                      {selectedEmployee?.full_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '??'}
                    </AvatarFallback>
                  </Avatar>
                )}
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  onChange={handlePhotoChange}
                  className="hidden"
                />
                <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Photo
                </Button>
              </div>
            </div>

            {/* Employee Name */}
            <div>
              <Label>Employee Name *</Label>
              <Select value={formEmployeeId} onValueChange={setFormEmployeeId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map(emp => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Branch (auto-filled) */}
            <div>
              <Label>Branch</Label>
              <Input 
                className="mt-1" 
                value={selectedEmployee?.branch || (selectedEmployee?.branches as any)?.name || ''} 
                disabled 
                placeholder="Auto-filled from employee"
              />
            </div>

            {/* Date */}
            <div>
              <Label>Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full mt-1 justify-start">
                    <Calendar className="mr-2 h-4 w-4" />
                    {formDate ? format(formDate, 'MMM dd, yyyy') : 'Pick date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={formDate}
                    onSelect={setFormDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Status */}
            <div>
              <Label>Status *</Label>
              <Select value={formStatus} onValueChange={setFormStatus}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map(status => (
                    <SelectItem key={status} value={status}>{status}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Reason */}
            <div className="md:col-span-2">
              <Label>Reason</Label>
              <Input 
                className="mt-1" 
                value={formReason} 
                onChange={(e) => setFormReason(e.target.value)}
                placeholder="Enter reason"
              />
            </div>

            {/* Date of Resume */}
            <div>
              <Label>Date of Resume *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full mt-1 justify-start">
                    <Calendar className="mr-2 h-4 w-4" />
                    {formDateOfResume ? format(formDateOfResume, 'MMM dd, yyyy') : 'Pick date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={formDateOfResume}
                    onSelect={setFormDateOfResume}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Remarks */}
            <div className="md:col-span-2">
              <Label>Remarks</Label>
              <Textarea 
                className="mt-1" 
                value={formRemarks} 
                onChange={(e) => setFormRemarks(e.target.value)}
                placeholder="Enter remarks"
                rows={3}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { resetForm(); setIsModalOpen(false); }}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Save Record'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search employee..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            
            <Select value={selectedMonth} onValueChange={(v) => { setSelectedMonth(v); setShowAllYear(false); }}>
              <SelectTrigger>
                <SelectValue placeholder="Month" />
              </SelectTrigger>
              <SelectContent>
                {months.map((month, index) => (
                  <SelectItem key={month} value={(index + 1).toString()}>{month}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger>
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                {years.map(year => (
                  <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={localSelectedBranch} onValueChange={setLocalSelectedBranch}>
              <SelectTrigger>
                <SelectValue placeholder="Branch" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Branches</SelectItem>
                {uniqueBranches.map(branch => (
                  <SelectItem key={branch} value={branch}>{branch}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="justify-start">
                  <Calendar className="mr-2 h-4 w-4" />
                  {selectedDate ? format(selectedDate, 'MMM dd, yyyy') : 'Pick date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  initialFocus
                />
                {selectedDate && (
                  <div className="p-2 border-t">
                    <Button variant="ghost" size="sm" className="w-full" onClick={() => setSelectedDate(undefined)}>
                      Clear
                    </Button>
                  </div>
                )}
              </PopoverContent>
            </Popover>
          </div>
          
          <div className="mt-4 flex gap-2">
            <Button 
              variant={showAllYear ? "default" : "outline"} 
              size="sm"
              onClick={() => setShowAllYear(!showAllYear)}
            >
              {showAllYear ? 'Showing All Year' : 'Show All Year'}
            </Button>
          </div>
        </CardContent>
      </Card>


      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.find(c => c.key === 'photo')?.visible && <TableHead className="w-[60px]">Photo</TableHead>}
                  {columns.find(c => c.key === 'name')?.visible && <TableHead style={{ width: columns.find(c => c.key === 'name')?.width }}>Employee Name</TableHead>}
                  {columns.find(c => c.key === 'branch')?.visible && <TableHead style={{ width: columns.find(c => c.key === 'branch')?.width }}>Branch</TableHead>}
                  {columns.find(c => c.key === 'date')?.visible && <TableHead style={{ width: columns.find(c => c.key === 'date')?.width }}>Date</TableHead>}
                  {columns.find(c => c.key === 'status')?.visible && <TableHead style={{ width: columns.find(c => c.key === 'status')?.width }}>Status</TableHead>}
                  {columns.find(c => c.key === 'reason')?.visible && <TableHead style={{ width: columns.find(c => c.key === 'reason')?.width }}>Reason</TableHead>}
                  {columns.find(c => c.key === 'date_of_resume')?.visible && <TableHead style={{ width: columns.find(c => c.key === 'date_of_resume')?.width }}>Date of Resume</TableHead>}
                  {columns.find(c => c.key === 'remarks')?.visible && <TableHead style={{ width: columns.find(c => c.key === 'remarks')?.width }}>Remarks</TableHead>}
                  {columns.find(c => c.key === 'actions')?.visible && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : filteredRecords.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      No resume records found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRecords.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell>
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={record.employees?.photo_url || ''} alt={record.employees?.full_name} />
                          <AvatarFallback>
                            {record.employees?.full_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '??'}
                          </AvatarFallback>
                        </Avatar>
                      </TableCell>
                      <TableCell className="font-medium">
                        {record.employees?.full_name || 'Unknown'}
                      </TableCell>
                      <TableCell>
                        {record.employees?.branch || record.employees?.branches?.name || '-'}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">
                          {record.date_of_absent 
                            ? format(new Date(record.date_of_absent), 'MMM dd, yyyy')
                            : record.attendance_date 
                              ? format(new Date(record.attendance_date), 'MMM dd, yyyy')
                              : '-'}
                        </span>
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(record.status)}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{record.reason || '-'}</span>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium text-primary">
                          {record.date_of_resume 
                            ? format(new Date(record.date_of_resume), 'MMM dd, yyyy')
                            : '-'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">{record.remarks || '-'}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => setViewingRecord(record)} title="View">
                            <Eye className="h-4 w-4" />
                          </Button>
                          {canEdit && (
                            <Button variant="ghost" size="icon" onClick={() => handleEdit(record)} title="Edit">
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {isAdmin && (
                            <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(record.id)} title="Delete">
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* View Record Dialog */}
      <Dialog open={!!viewingRecord} onOpenChange={(open) => !open && setViewingRecord(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarImage src={viewingRecord?.employees?.photo_url || ''} />
                <AvatarFallback>{viewingRecord?.employees?.full_name?.charAt(0) || '?'}</AvatarFallback>
              </Avatar>
              <span>{viewingRecord?.employees?.full_name || 'Resume Record'}</span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Branch</p>
                <p className="font-medium">{viewingRecord?.employees?.branch || viewingRecord?.employees?.branches?.name || '-'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Date</p>
                <p className="font-medium">
                  {viewingRecord?.date_of_absent 
                    ? format(new Date(viewingRecord.date_of_absent), 'MMMM dd, yyyy')
                    : viewingRecord?.attendance_date 
                      ? format(new Date(viewingRecord.attendance_date), 'MMMM dd, yyyy')
                      : '-'}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Status</p>
                <div>{viewingRecord?.status ? getStatusBadge(viewingRecord.status) : '-'}</div>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Date of Resume</p>
                <p className="font-medium text-primary">
                  {viewingRecord?.date_of_resume 
                    ? format(new Date(viewingRecord.date_of_resume), 'MMMM dd, yyyy')
                    : '-'}
                </p>
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Reason</p>
              <p className="font-medium bg-muted p-3 rounded-md">{viewingRecord?.reason || '-'}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Remarks</p>
              <p className="font-medium bg-muted p-3 rounded-md">{viewingRecord?.remarks || '-'}</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Record Dialog */}
      <Dialog open={!!editingRecord} onOpenChange={(open) => { if (!open) { setEditingRecord(null); resetForm(); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Resume Record</DialogTitle>
          </DialogHeader>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
            {/* Photo */}
            <div className="md:col-span-2">
              <Label>Photo</Label>
              <div className="mt-2 flex items-center gap-4">
                <Avatar className="h-16 w-16">
                  <AvatarImage src={photoPreview || ''} />
                  <AvatarFallback>
                    {selectedEmployee?.full_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '??'}
                  </AvatarFallback>
                </Avatar>
              </div>
            </div>

            {/* Employee Name */}
            <div>
              <Label>Employee Name *</Label>
              <Select value={formEmployeeId} onValueChange={setFormEmployeeId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map(emp => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Branch */}
            <div>
              <Label>Branch</Label>
              <Input 
                className="mt-1" 
                value={selectedEmployee?.branch || (selectedEmployee?.branches as any)?.name || ''} 
                disabled 
                placeholder="Auto-filled from employee"
              />
            </div>

            {/* Date */}
            <div>
              <Label>Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full mt-1 justify-start">
                    <Calendar className="mr-2 h-4 w-4" />
                    {formDate ? format(formDate, 'MMM dd, yyyy') : 'Pick date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={formDate}
                    onSelect={setFormDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Status */}
            <div>
              <Label>Status *</Label>
              <Select value={formStatus} onValueChange={setFormStatus}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map(status => (
                    <SelectItem key={status} value={status.toLowerCase()}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Reason */}
            <div className="md:col-span-2">
              <Label>Reason</Label>
              <Textarea
                className="mt-1"
                value={formReason}
                onChange={(e) => setFormReason(e.target.value)}
                placeholder="Enter reason"
              />
            </div>

            {/* Date of Resume */}
            <div>
              <Label>Date of Resume *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full mt-1 justify-start">
                    <Calendar className="mr-2 h-4 w-4" />
                    {formDateOfResume ? format(formDateOfResume, 'MMM dd, yyyy') : 'Pick date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={formDateOfResume}
                    onSelect={setFormDateOfResume}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Remarks */}
            <div className="md:col-span-2">
              <Label>Remarks</Label>
              <Textarea
                className="mt-1"
                value={formRemarks}
                onChange={(e) => setFormRemarks(e.target.value)}
                placeholder="Enter remarks"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setEditingRecord(null); resetForm(); }}>
              Cancel
            </Button>
            <Button onClick={handleUpdateSubmit} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Recently Deleted Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5" />
            Recently Deleted ({deletedRecords.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {deletedRecords.length > 0 ? (
            <ScrollArea className="h-[300px]">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-[50px]">Photo</TableHead>
                    <TableHead>Employee</TableHead>
                    <TableHead>Date of Resume</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Deleted At</TableHead>
                    <TableHead className="text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deletedRecords.map((record: any) => (
                    <TableRow key={record.id}>
                      <TableCell>
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={record.employees?.photo_url || ''} />
                          <AvatarFallback className="text-xs">
                            {record.employees?.full_name?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || '??'}
                          </AvatarFallback>
                        </Avatar>
                      </TableCell>
                      <TableCell className="font-medium">{record.employees?.full_name || 'Unknown'}</TableCell>
                      <TableCell>{record.date_of_resume ? format(new Date(record.date_of_resume), 'MMM dd, yyyy') : '-'}</TableCell>
                      <TableCell>{getStatusBadge(record.status)}</TableCell>
                      <TableCell>
                        {record.deleted_at 
                          ? format(new Date(record.deleted_at), 'MMM dd, yyyy hh:mm a')
                          : '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => restoreMutation.mutate(record.id)}
                            title="Restore"
                          >
                            <RotateCcw className="h-4 w-4 text-green-600" />
                          </Button>
                          {isAdmin && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                if (confirm('Permanently delete this record? This cannot be undone.')) {
                                  permanentDeleteMutation.mutate(record.id);
                                }
                              }}
                              title="Permanently Delete"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Trash2 className="h-10 w-10 text-muted-foreground/50 mb-3" />
              <h3 className="text-base font-medium">No deleted records</h3>
              <p className="text-sm text-muted-foreground">Deleted resume records will appear here</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ResumeToWork;
