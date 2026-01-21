import { useState, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { Search, Calendar, Filter, FileDown, Plus, Upload, X } from 'lucide-react';
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
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';


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
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMonth, setSelectedMonth] = useState<string>((new Date().getMonth() + 1).toString());
  const [selectedYear, setSelectedYear] = useState<string>(currentYear.toString());
  const [selectedBranch, setSelectedBranch] = useState<string>('all');
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

  // Fetch employees for dropdown and count
  const { data: employees = [] } = useQuery({
    queryKey: ['employees-for-resume'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('id, full_name, branch, photo_url, branches:branch_id (name), employment_status')
        .eq('is_active', true)
        .order('full_name');
      if (error) throw error;
      return data || [];
    }
  });


  // Fetch attendance records that have date_of_resume
  const { data: attendanceRecords = [], isLoading } = useQuery({
    queryKey: ['resume-to-work', selectedMonth, selectedYear, showAllYear],
    queryFn: async () => {
      let query = supabase
        .from('attendance_records')
        .select(`
          *,
          employees!attendance_records_employee_id_fkey (
            id,
            full_name,
            photo_url,
            branch,
            branches:branch_id (name)
          )
        `)
        .not('date_of_resume', 'is', null)
        .order('date_of_resume', { ascending: false });

      // Filter by date range
      if (!showAllYear) {
        const startDate = new Date(parseInt(selectedYear), parseInt(selectedMonth) - 1, 1);
        const endDate = new Date(parseInt(selectedYear), parseInt(selectedMonth), 0);
        query = query
          .gte('date_of_resume', format(startDate, 'yyyy-MM-dd'))
          .lte('date_of_resume', format(endDate, 'yyyy-MM-dd'));
      } else {
        const startDate = new Date(parseInt(selectedYear), 0, 1);
        const endDate = new Date(parseInt(selectedYear), 11, 31);
        query = query
          .gte('date_of_resume', format(startDate, 'yyyy-MM-dd'))
          .lte('date_of_resume', format(endDate, 'yyyy-MM-dd'));
      }

      const { data, error } = await query;
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

  // Filter records
  const filteredRecords = useMemo(() => {
    return attendanceRecords.filter(record => {
      const employeeName = record.employees?.full_name?.toLowerCase() || '';
      const branch = record.employees?.branch || record.employees?.branches?.name || '';
      
      const matchesSearch = employeeName.includes(searchQuery.toLowerCase());
      const matchesBranch = selectedBranch === 'all' || branch === selectedBranch;
      const matchesDate = !selectedDate || record.date_of_resume === format(selectedDate, 'yyyy-MM-dd');
      
      return matchesSearch && matchesBranch && matchesDate;
    });
  }, [attendanceRecords, searchQuery, selectedBranch, selectedDate]);


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

  const selectedEmployee = employees.find(e => e.id === formEmployeeId);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Resume to Work</h1>
          <p className="text-muted-foreground">Track employees returning to work after absences</p>
        </div>
        <div className="flex gap-2">
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

            <Select value={selectedBranch} onValueChange={setSelectedBranch}>
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
                  <TableHead className="w-[60px]">Photo</TableHead>
                  <TableHead>Employee Name</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Date of Resume</TableHead>
                  <TableHead>Remarks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : filteredRecords.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
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
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ResumeToWork;
