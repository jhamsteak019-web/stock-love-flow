import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, startOfYear, endOfYear, startOfMonth, endOfMonth, getYear, getMonth } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { 
  Search, 
  Download, 
  Plus, 
  UserPlus, 
  Users, 
  CheckCircle, 
  XCircle, 
  Clock, 
  CalendarIcon,
  Pencil,
  Trash2,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
  Eye,
  ClipboardList,
  RotateCcw,
  Printer
} from 'lucide-react';
import { cn } from '@/lib/utils';
import * as ExcelJS from 'exceljs';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import ColumnSettings, { GenericColumnConfig } from '@/components/common/ColumnSettings';
import { useGenericColumnSettings } from '@/hooks/useGenericColumnSettings';

const defaultAttendanceColumns: GenericColumnConfig[] = [
  { key: 'photo', label: 'Photo', visible: true, width: 60, minWidth: 50, maxWidth: 80 },
  { key: 'name', label: 'Employee Name', visible: true, width: 150, minWidth: 100, maxWidth: 250 },
  { key: 'date_hired', label: 'Date Hired', visible: true, width: 120, minWidth: 100, maxWidth: 150 },
  { key: 'status', label: 'Status', visible: true, width: 120, minWidth: 80, maxWidth: 150 },
  { key: 'brand', label: 'Brand', visible: true, width: 100, minWidth: 80, maxWidth: 150 },
  { key: 'branch', label: 'Branch', visible: true, width: 120, minWidth: 80, maxWidth: 180 },
  { key: 'date', label: 'Date Today', visible: true, width: 120, minWidth: 100, maxWidth: 150 },
  { key: 'day_off', label: 'Day Off', visible: true, width: 100, minWidth: 80, maxWidth: 140 },
  { key: 'shift', label: 'Shift', visible: true, width: 100, minWidth: 80, maxWidth: 140 },
  { key: 'actions', label: 'Actions', visible: true, width: 100, minWidth: 80, maxWidth: 130 },
];

const monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

interface Employee {
  id: string;
  full_name: string;
  branch_id: string | null;
  branch: string | null;
  date_hired: string;
  employment_status: string;
  photo_url: string | null;
  is_active: boolean;
  category: string | null;
  branches?: { name: string } | null;
}

interface AttendanceRecord {
  id: string;
  employee_id: string;
  attendance_date: string;
  status: string;
  reason: string | null;
  date_of_absent: string | null;
  date_of_resume: string | null;
  remarks: string | null;
  notes: string | null;
  branch_id: string | null;
  day_off: string | null;
  shift: string | null;
  employees?: Employee;
  branches?: { name: string } | null;
}

const months = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 10 }, (_, i) => currentYear - 5 + i);

const Attendance = () => {
  const { user, userRole } = useAuth();
  const { selectedBranch } = useBranch();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Column settings
  const { columns, setColumns, isAdmin: isColumnAdmin } = useGenericColumnSettings('attendance', defaultAttendanceColumns);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMonth, setSelectedMonth] = useState<string>((getMonth(new Date()) + 1).toString());
  const [selectedYear, setSelectedYear] = useState<string>(currentYear.toString());
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [isAllYear, setIsAllYear] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);

  // Employee modal states
  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false);
  const [employeeForm, setEmployeeForm] = useState({
    full_name: '',
    date_hired: '',
    employment_status: 'regular',
    brand: '',
    branch: '',
    date_today: format(new Date(), 'yyyy-MM-dd'),
    day_off: '',
    shift: '',
    photo_url: ''
  });
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Attendance modal states
  const [isAttendanceModalOpen, setIsAttendanceModalOpen] = useState(false);
  const [attendanceForm, setAttendanceForm] = useState({
    employee_id: '',
    attendance_date: format(new Date(), 'yyyy-MM-dd'),
    status: 'present',
    reason: '',
    date_of_absent: '',
    date_of_resume: '',
    remarks: '',
    notes: '',
    day_off: '',
    shift: ''
  });
  const [editingRecord, setEditingRecord] = useState<AttendanceRecord | null>(null);
  const [viewingRecord, setViewingRecord] = useState<AttendanceRecord | null>(null);
  const [viewingPhoto, setViewingPhoto] = useState<{ url: string; name: string } | null>(null);
  const [photoZoomLevel, setPhotoZoomLevel] = useState(1);

  const isAdmin = userRole === 'admin';
  const canEdit = userRole === 'admin' || userRole === 'staff';

  // Fetch branches
  const { data: branches = [] } = useQuery({
    queryKey: ['branches'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('branches')
        .select('id, name')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data;
    }
  });

  // Fetch employees
  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('*, branches(name)')
        .eq('is_active', true)
        .order('full_name');
      if (error) throw error;
      return data as Employee[];
    }
  });

  // Calculate date range
  const dateRange = useMemo(() => {
    const year = parseInt(selectedYear);
    const month = parseInt(selectedMonth) - 1;

    if (selectedDate) {
      return {
        start: format(selectedDate, 'yyyy-MM-dd'),
        end: format(selectedDate, 'yyyy-MM-dd')
      };
    }

    if (isAllYear) {
      return {
        start: format(startOfYear(new Date(year, 0, 1)), 'yyyy-MM-dd'),
        end: format(endOfYear(new Date(year, 0, 1)), 'yyyy-MM-dd')
      };
    }

    const date = new Date(year, month, 1);
    return {
      start: format(startOfMonth(date), 'yyyy-MM-dd'),
      end: format(endOfMonth(date), 'yyyy-MM-dd')
    };
  }, [selectedMonth, selectedYear, isAllYear, selectedDate]);

  // Fetch attendance records
  const { data: attendanceRecords = [], isLoading } = useQuery({
    queryKey: ['attendance-records', dateRange],
    queryFn: async () => {
      let query = supabase
        .from('attendance_records')
        .select('*, employees(*, branches(name)), branches(name)')
        .gte('attendance_date', dateRange.start)
        .lte('attendance_date', dateRange.end)
        .order('attendance_date', { ascending: false });

      const { data, error } = await query;
      if (error) throw error;
      return data as AttendanceRecord[];
    }
  });

  // Filter records by search, status, and branch
  const filteredRecords = useMemo(() => {
    return attendanceRecords.filter(record => {
      const matchesSearch = !searchQuery || 
        record.employees?.full_name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || record.status === statusFilter;
      // Filter by employee's branch name from Manpower
      const employeeBranch = record.employees?.branch || record.employees?.branches?.name || '';
      const matchesBranch = branchFilter === 'all' || employeeBranch === branchFilter;
      return matchesSearch && matchesStatus && matchesBranch;
    });
  }, [attendanceRecords, searchQuery, statusFilter, branchFilter]);

  // Calculate stats
  const stats = useMemo(() => {
    const total = filteredRecords.length;
    const present = filteredRecords.filter(r => r.status === 'present').length;
    const absent = filteredRecords.filter(r => r.status === 'absent').length;
    const late = filteredRecords.filter(r => r.status === 'late').length;
    return { total, present, absent, late };
  }, [filteredRecords]);

  // Get unique branch names from employees (Manpower database)
  const uniqueManpowerBranches = useMemo(() => {
    const branchNames = employees
      .map(emp => emp.branch || emp.branches?.name)
      .filter((branch): branch is string => !!branch && branch.trim() !== '');
    return [...new Set(branchNames)].sort();
  }, [employees]);

  // Chart data for Attendance Status Distribution
  const attendanceChartData = useMemo(() => {
    const statusCounts: Record<string, number> = {};
    filteredRecords.forEach(record => {
      const status = record.status?.toLowerCase() || 'unknown';
      const formattedStatus = status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ');
      statusCounts[formattedStatus] = (statusCounts[formattedStatus] || 0) + 1;
    });
    return Object.entries(statusCounts).map(([name, value]) => ({
      name,
      value
    })).slice(0, 6);
  }, [filteredRecords]);

  // Chart data for Resume to Work by Month (records with date_of_resume)
  const resumeByMonthData = useMemo(() => {
    const monthCounts: Record<string, number> = {};
    filteredRecords
      .filter(r => r.date_of_resume)
      .forEach(record => {
        const month = format(new Date(record.date_of_resume!), 'MMM');
        monthCounts[month] = (monthCounts[month] || 0) + 1;
      });
    return monthNames.map((month) => ({
      name: month.slice(0, 3),
      resumptions: monthCounts[month.slice(0, 3)] || 0
    }));
  }, [filteredRecords]);

  // Chart data for Employee Status Distribution (Manpower)
  const employeeStatusData = useMemo(() => {
    const statusCounts: Record<string, number> = {};
    employees.forEach(emp => {
      const status = emp.employment_status || 'Unknown';
      const formattedStatus = status.charAt(0).toUpperCase() + status.slice(1);
      statusCounts[formattedStatus] = (statusCounts[formattedStatus] || 0) + 1;
    });
    return Object.entries(statusCounts).map(([name, value]) => ({
      name,
      value
    }));
  }, [employees]);

  const CHART_COLORS = ['hsl(var(--primary))', 'hsl(var(--destructive))', 'hsl(var(--secondary))', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

  // Employee mutations
  const createEmployeeMutation = useMutation({
    mutationFn: async (data: typeof employeeForm) => {
      const { error } = await supabase.from('employees').insert({
        full_name: data.full_name,
        branch: data.branch || null,
        date_hired: data.date_hired,
        employment_status: data.employment_status,
        photo_url: data.photo_url || null,
        created_by: user?.id
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      setIsEmployeeModalOpen(false);
      resetEmployeeForm();
      toast({ title: 'Employee added successfully!' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  });

  const updateEmployeeMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof employeeForm }) => {
      const { error } = await supabase.from('employees').update({
        full_name: data.full_name,
        branch: data.branch || null,
        date_hired: data.date_hired,
        employment_status: data.employment_status,
        photo_url: data.photo_url || null
      }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      setIsEmployeeModalOpen(false);
      resetEmployeeForm();
      toast({ title: 'Employee updated successfully!' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  });

  const deleteEmployeeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('employees').update({ is_active: false }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      toast({ title: 'Employee deleted successfully!' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  });

  // Attendance mutations
  const createAttendanceMutation = useMutation({
    mutationFn: async (data: typeof attendanceForm) => {
      const employee = employees.find(e => e.id === data.employee_id);
      const { error } = await supabase.from('attendance_records').insert({
        ...data,
        branch_id: employee?.branch_id || null,
        date_of_absent: data.date_of_absent || null,
        date_of_resume: data.date_of_resume || null,
        day_off: data.day_off || null,
        shift: data.shift || null,
        created_by: user?.id
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance-records'] });
      setIsAttendanceModalOpen(false);
      resetAttendanceForm();
      toast({ title: 'Attendance record added successfully!' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  });

  const updateAttendanceMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof attendanceForm }) => {
      const { error } = await supabase.from('attendance_records').update({
        ...data,
        date_of_absent: data.date_of_absent || null,
        date_of_resume: data.date_of_resume || null,
        day_off: data.day_off || null,
        shift: data.shift || null
      }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance-records'] });
      setIsAttendanceModalOpen(false);
      resetAttendanceForm();
      toast({ title: 'Attendance record updated successfully!' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  });

  const deleteAttendanceMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('attendance_records').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance-records'] });
      toast({ title: 'Attendance record deleted successfully!' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  });

  const resetEmployeeForm = () => {
    setEmployeeForm({
      full_name: '',
      date_hired: '',
      employment_status: 'regular',
      brand: '',
      branch: '',
      date_today: format(new Date(), 'yyyy-MM-dd'),
      day_off: '',
      shift: '',
      photo_url: ''
    });
    setEditingEmployee(null);
    setPhotoFile(null);
    setPhotoPreview(null);
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const uploadPhoto = async (): Promise<string | null> => {
    if (!photoFile) return employeeForm.photo_url || null;
    
    setUploadingPhoto(true);
    try {
      const fileExt = photoFile.name.split('.').pop();
      const fileName = `${crypto.randomUUID()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('employee-photos')
        .upload(fileName, photoFile);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('employee-photos')
        .getPublicUrl(fileName);

      return urlData.publicUrl;
    } catch (error: any) {
      toast({ title: 'Error uploading photo', description: error.message, variant: 'destructive' });
      return null;
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSaveEmployee = async () => {
    const photoUrl = await uploadPhoto();
    const formData = { ...employeeForm, photo_url: photoUrl || '' };
    
    if (editingEmployee) {
      updateEmployeeMutation.mutate({ id: editingEmployee.id, data: formData });
    } else {
      createEmployeeMutation.mutate(formData);
    }
  };

  const resetAttendanceForm = () => {
    setAttendanceForm({
      employee_id: '',
      attendance_date: format(new Date(), 'yyyy-MM-dd'),
      status: 'present',
      reason: '',
      date_of_absent: '',
      date_of_resume: '',
      remarks: '',
      notes: '',
      day_off: '',
      shift: ''
    });
    setEditingRecord(null);
  };

  const handleEditEmployee = (employee: Employee) => {
    setEditingEmployee(employee);
    setEmployeeForm({
      full_name: employee.full_name,
      date_hired: employee.date_hired,
      employment_status: employee.employment_status,
      brand: employee.category || '',
      branch: employee.branch || employee.branches?.name || '',
      date_today: format(new Date(), 'yyyy-MM-dd'),
      day_off: '',
      shift: '',
      photo_url: employee.photo_url || ''
    });
    setPhotoPreview(employee.photo_url || null);
    setPhotoFile(null);
    setIsEmployeeModalOpen(true);
  };

  const handleEditAttendance = (record: AttendanceRecord) => {
    setEditingRecord(record);
    setAttendanceForm({
      employee_id: record.employee_id,
      attendance_date: record.attendance_date,
      status: record.status,
      reason: record.reason || '',
      date_of_absent: record.date_of_absent || '',
      date_of_resume: record.date_of_resume || '',
      remarks: record.remarks || '',
      notes: record.notes || '',
      day_off: record.day_off || '',
      shift: record.shift || ''
    });
    setIsAttendanceModalOpen(true);
  };

  const handleExport = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Attendance Records');

    worksheet.columns = [
      { header: 'Employee Name', key: 'employee', width: 25 },
      { header: 'Date Hired', key: 'date_hired', width: 15 },
      { header: 'Employment Status', key: 'employment_status', width: 18 },
      { header: 'Brand', key: 'brand', width: 15 },
      { header: 'Branch', key: 'branch', width: 20 },
      { header: 'Date', key: 'date', width: 15 },
      { header: 'Status', key: 'status', width: 20 },
      { header: 'Day Off', key: 'day_off', width: 15 },
      { header: 'Shift', key: 'shift', width: 15 },
      { header: 'Reason', key: 'reason', width: 30 },
      { header: 'Date of Absent', key: 'date_of_absent', width: 15 },
      { header: 'Date of Resume', key: 'date_of_resume', width: 15 },
      { header: 'Remarks', key: 'remarks', width: 30 },
      { header: 'Notes', key: 'notes', width: 30 }
    ];

    filteredRecords.forEach(record => {
      worksheet.addRow({
        employee: record.employees?.full_name || '',
        date_hired: record.employees?.date_hired || '',
        employment_status: record.employees?.employment_status || '',
        brand: record.employees?.category || '',
        branch: record.employees?.branches?.name || '',
        date: record.attendance_date,
        status: record.status,
        day_off: record.day_off || '',
        shift: record.shift || '',
        reason: record.reason || '',
        date_of_absent: record.date_of_absent || '',
        date_of_resume: record.date_of_resume || '',
        remarks: record.remarks || '',
        notes: record.notes || ''
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance-${selectedYear}-${selectedMonth}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Print attendance table
  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const getStatusText = (status: string) => {
      const statusMap: Record<string, string> = {
        present: 'Present',
        absent: 'Absent',
        late: 'Late',
        half_day: 'Half day',
        undertime: 'Undertime',
        suspension: 'Suspension',
        unauthorized_absent: 'Unauthorized absent',
        sil: 'SIL',
        vl: 'VL',
        change_day_off: 'Change Day off',
        change_of_schedule: 'Change of Schedule',
        cancel_day_off: 'Cancel Day off',
        other_concern: 'Other Concern'
      };
      return statusMap[status] || status;
    };

    const getStatusColor = (status: string) => {
      const colorMap: Record<string, string> = {
        present: '#16a34a',
        absent: '#dc2626',
        late: '#d97706',
        half_day: '#2563eb',
        undertime: '#ea580c',
        suspension: '#9333ea',
        unauthorized_absent: '#b91c1c',
        sil: '#0d9488',
        vl: '#0891b2',
        change_day_off: '#4f46e5',
        change_of_schedule: '#db2777',
        cancel_day_off: '#d97706',
        other_concern: '#6b7280'
      };
      return colorMap[status] || '#6b7280';
    };

    const tableRows = filteredRecords.map(record => `
      <tr>
        <td style="text-align: center; padding: 8px;">
          ${record.employees?.photo_url 
            ? `<img src="${record.employees.photo_url}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;" />`
            : `<div style="width: 40px; height: 40px; border-radius: 50%; background: #e5e7eb; display: flex; align-items: center; justify-content: center; font-weight: bold; margin: 0 auto;">${record.employees?.full_name?.charAt(0) || '?'}</div>`
          }
        </td>
        <td style="padding: 8px; font-weight: 500;">${record.employees?.full_name || '-'}</td>
        <td style="padding: 8px;">${record.employees?.date_hired ? format(new Date(record.employees.date_hired), 'MM-dd-yyyy') : '-'}</td>
        <td style="padding: 8px;">
          <span style="padding: 4px 8px; border-radius: 4px; background: ${getStatusColor(record.status)}20; color: ${getStatusColor(record.status)}; font-weight: 500; font-size: 12px;">
            ${getStatusText(record.status)}
          </span>
        </td>
        <td style="padding: 8px;">${record.employees?.category || '-'}</td>
        <td style="padding: 8px;">${record.employees?.branch || record.employees?.branches?.name || '-'}</td>
        <td style="padding: 8px;">${format(new Date(record.attendance_date), 'MM-dd-yyyy')}</td>
        <td style="padding: 8px;">${record.day_off || '-'}</td>
        <td style="padding: 8px;">${record.shift || '-'}</td>
      </tr>
    `).join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Attendance Report - ${months[parseInt(selectedMonth) - 1]} ${selectedYear}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { text-align: center; margin-bottom: 5px; }
            .subtitle { text-align: center; color: #666; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
            th { background: #f3f4f6; padding: 10px 8px; text-align: left; border-bottom: 2px solid #e5e7eb; font-weight: 600; }
            td { padding: 8px; border-bottom: 1px solid #e5e7eb; vertical-align: middle; }
            tr:hover { background: #f9fafb; }
            .footer { margin-top: 30px; text-align: center; font-size: 11px; color: #666; }
            @media print {
              body { padding: 0; }
              table { font-size: 10px; }
            }
          </style>
        </head>
        <body>
          <h1>Attendance Report</h1>
          <p class="subtitle">${months[parseInt(selectedMonth) - 1]} ${selectedYear} ${branchFilter !== 'all' ? `- ${branchFilter}` : ''}</p>
          <table>
            <thead>
              <tr>
                <th style="text-align: center; width: 60px;">Photo</th>
                <th>Employee Name</th>
                <th>Date Hired</th>
                <th>Status</th>
                <th>Brand</th>
                <th>Branch</th>
                <th>Date Today</th>
                <th>Day Off</th>
                <th>Shift</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
          <p class="footer">Generated on ${format(new Date(), 'MMMM d, yyyy h:mm a')} | Total Records: ${filteredRecords.length}</p>
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 500);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'present':
        return <Badge className="bg-green-500/20 text-green-700 border-green-500/30">Present</Badge>;
      case 'absent':
        return <Badge className="bg-red-500/20 text-red-700 border-red-500/30">Absent</Badge>;
      case 'late':
        return <Badge className="bg-yellow-500/20 text-yellow-700 border-yellow-500/30">Late</Badge>;
      case 'half_day':
        return <Badge className="bg-blue-500/20 text-blue-700 border-blue-500/30">Half day</Badge>;
      case 'undertime':
        return <Badge className="bg-orange-500/20 text-orange-700 border-orange-500/30">Undertime</Badge>;
      case 'suspension':
        return <Badge className="bg-purple-500/20 text-purple-700 border-purple-500/30">Suspension</Badge>;
      case 'unauthorized_absent':
        return <Badge className="bg-red-600/20 text-red-800 border-red-600/30">Unauthorized absent</Badge>;
      case 'sil':
        return <Badge className="bg-teal-500/20 text-teal-700 border-teal-500/30">SIL (Service incentive leave)</Badge>;
      case 'vl':
        return <Badge className="bg-cyan-500/20 text-cyan-700 border-cyan-500/30">VL (Vacation leave)</Badge>;
      case 'change_day_off':
        return <Badge className="bg-indigo-500/20 text-indigo-700 border-indigo-500/30">Change Day off</Badge>;
      case 'change_of_schedule':
        return <Badge className="bg-pink-500/20 text-pink-700 border-pink-500/30">Change of Schedule</Badge>;
      case 'cancel_day_off':
        return <Badge className="bg-amber-500/20 text-amber-700 border-amber-500/30">Cancel Day off</Badge>;
      case 'other_concern':
        return <Badge className="bg-gray-500/20 text-gray-700 border-gray-500/30">Other Concern</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">Attendance</h1>
          <p className="text-muted-foreground">Track employee attendance records</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={selectedMonth} onValueChange={(v) => { setSelectedMonth(v); setIsAllYear(false); setSelectedDate(undefined); }}>
            <SelectTrigger className="w-[120px]">
              <CalendarIcon className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map((month, i) => (
                <SelectItem key={month} value={(i + 1).toString()}>{month}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedYear} onValueChange={(v) => { setSelectedYear(v); setSelectedDate(undefined); }}>
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map(year => (
                <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant={isAllYear ? "default" : "outline"}
            size="sm"
            onClick={() => { setIsAllYear(!isAllYear); setSelectedDate(undefined); }}
          >
            All Year
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <CalendarIcon className="h-4 w-4 mr-2" />
                Pick Date
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => { setSelectedDate(date); setIsAllYear(false); }}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          {isColumnAdmin && (
            <ColumnSettings 
              columns={columns} 
              onColumnChange={setColumns} 
              defaultColumns={defaultAttendanceColumns}
              excludeFromWidthControl={['photo', 'actions']}
            />
          )}
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Records</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <Users className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Present</p>
                <p className="text-2xl font-bold text-green-600">{stats.present}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Absent</p>
                <p className="text-2xl font-bold text-red-600">{stats.absent}</p>
              </div>
              <XCircle className="h-8 w-8 text-red-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Late</p>
                <p className="text-2xl font-bold text-yellow-600">{stats.late}</p>
              </div>
              <Clock className="h-8 w-8 text-yellow-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Actions */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search employee..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={branchFilter} onValueChange={setBranchFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="All Branches" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Branches</SelectItem>
                {uniqueManpowerBranches.map(branchName => (
                  <SelectItem key={branchName} value={branchName}>{branchName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="present">Present</SelectItem>
                <SelectItem value="absent">Absent</SelectItem>
                <SelectItem value="late">Late</SelectItem>
                <SelectItem value="half_day">Half day</SelectItem>
                <SelectItem value="undertime">Undertime</SelectItem>
                <SelectItem value="suspension">Suspension</SelectItem>
                <SelectItem value="unauthorized_absent">Unauthorized absent</SelectItem>
                <SelectItem value="sil">SIL (Service incentive leave)</SelectItem>
                <SelectItem value="vl">VL (Vacation leave)</SelectItem>
                <SelectItem value="change_day_off">Change Day off</SelectItem>
                <SelectItem value="change_of_schedule">Change of Schedule</SelectItem>
                <SelectItem value="cancel_day_off">Cancel Day off</SelectItem>
                <SelectItem value="other_concern">Other Concern</SelectItem>
              </SelectContent>
            </Select>
            {canEdit && (
              <>
                {/* Add Employee button hidden - employees should be added via Manpower page */}
                <Dialog open={isEmployeeModalOpen} onOpenChange={(open) => { setIsEmployeeModalOpen(open); if (!open) resetEmployeeForm(); }}>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{editingEmployee ? 'Edit Employee' : 'Add New Employee'}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      {/* Photo Upload */}
                      <div>
                        <Label>Photo</Label>
                        <div className="flex items-center gap-4 mt-2">
                          <div className="relative">
                            <Avatar className="h-20 w-20">
                              <AvatarImage src={photoPreview || ''} />
                              <AvatarFallback className="text-lg">
                                {employeeForm.full_name?.charAt(0) || '?'}
                              </AvatarFallback>
                            </Avatar>
                            {photoPreview && (
                              <button
                                type="button"
                                onClick={() => {
                                  setPhotoFile(null);
                                  setPhotoPreview(null);
                                  setEmployeeForm({ ...employeeForm, photo_url: '' });
                                }}
                                className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center hover:bg-destructive/90"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                          <div className="flex-1">
                            <label htmlFor="photo-upload" className="cursor-pointer">
                              <div className="flex items-center gap-2 px-4 py-2 border rounded-md hover:bg-accent transition-colors">
                                <Upload className="h-4 w-4" />
                                <span className="text-sm">{photoPreview ? 'Change Photo' : 'Upload Photo'}</span>
                              </div>
                              <input
                                id="photo-upload"
                                type="file"
                                accept="image/*"
                                onChange={handlePhotoChange}
                                className="hidden"
                              />
                            </label>
                            <p className="text-xs text-muted-foreground mt-1">JPG, PNG up to 5MB</p>
                          </div>
                        </div>
                      </div>
                      <div>
                        <Label>Employee Name</Label>
                        <Input
                          value={employeeForm.full_name}
                          onChange={(e) => setEmployeeForm({ ...employeeForm, full_name: e.target.value })}
                          placeholder="Enter employee name"
                        />
                      </div>
                      <div>
                        <Label>Date Hired</Label>
                        <Input
                          type="date"
                          value={employeeForm.date_hired}
                          onChange={(e) => setEmployeeForm({ ...employeeForm, date_hired: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Status</Label>
                        <Select value={employeeForm.employment_status} onValueChange={(v) => setEmployeeForm({ ...employeeForm, employment_status: v })}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="regular">Regular</SelectItem>
                            <SelectItem value="probationary">Probationary</SelectItem>
                            <SelectItem value="seasonal">Seasonal</SelectItem>
                            <SelectItem value="newly_hired">Newly Hired</SelectItem>
                            <SelectItem value="back_up">Back Up</SelectItem>
                            <SelectItem value="support_event">Support Event</SelectItem>
                            <SelectItem value="stock_man">Stock Man</SelectItem>
                            <SelectItem value="resigned">Resigned</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Brand</Label>
                        <Input
                          value={employeeForm.brand}
                          onChange={(e) => setEmployeeForm({ ...employeeForm, brand: e.target.value })}
                          placeholder="Enter brand"
                        />
                      </div>
                      <div>
                        <Label>Branch</Label>
                        <Select value={employeeForm.branch} onValueChange={(v) => setEmployeeForm({ ...employeeForm, branch: v })}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select branch" />
                          </SelectTrigger>
                          <SelectContent>
                            {uniqueManpowerBranches.map(branchName => (
                              <SelectItem key={branchName} value={branchName}>{branchName}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Date Today</Label>
                        <Input
                          type="date"
                          value={employeeForm.date_today}
                          onChange={(e) => setEmployeeForm({ ...employeeForm, date_today: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Day Off</Label>
                        <Input
                          value={employeeForm.day_off}
                          onChange={(e) => setEmployeeForm({ ...employeeForm, day_off: e.target.value })}
                          placeholder="Enter day off (e.g., Sunday)"
                        />
                      </div>
                      <div>
                        <Label>Shift</Label>
                        <Input
                          value={employeeForm.shift}
                          onChange={(e) => setEmployeeForm({ ...employeeForm, shift: e.target.value })}
                          placeholder="Enter shift (e.g., 9AM-6PM)"
                        />
                      </div>
                      <Button
                        className="w-full"
                        onClick={handleSaveEmployee}
                        disabled={!employeeForm.full_name || !employeeForm.date_hired || uploadingPhoto}
                      >
                        {uploadingPhoto ? (
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                        ) : (
                          editingEmployee ? 'Update Employee' : 'Add Employee'
                        )}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>

                <Dialog open={isAttendanceModalOpen} onOpenChange={(open) => { setIsAttendanceModalOpen(open); if (!open) resetAttendanceForm(); }}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Record
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg">
                    <DialogHeader>
                      <DialogTitle>{editingRecord ? 'Edit Attendance Record' : 'Add Attendance Record'}</DialogTitle>
                    </DialogHeader>
                    <ScrollArea className="max-h-[70vh]">
                      <div className="space-y-4 pr-4">
                        <div>
                          <Label>Employee</Label>
                          <Select value={attendanceForm.employee_id} onValueChange={(v) => setAttendanceForm({ ...attendanceForm, employee_id: v })}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select employee" />
                            </SelectTrigger>
                            <SelectContent>
                              {employees.map(emp => (
                                <SelectItem key={emp.id} value={emp.id}>{emp.full_name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Date</Label>
                          <Input
                            type="date"
                            value={attendanceForm.attendance_date}
                            onChange={(e) => setAttendanceForm({ ...attendanceForm, attendance_date: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label>Status</Label>
                          <Select value={attendanceForm.status} onValueChange={(v) => setAttendanceForm({ ...attendanceForm, status: v })}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="present">Present</SelectItem>
                              <SelectItem value="absent">Absent</SelectItem>
                              <SelectItem value="late">Late</SelectItem>
                              <SelectItem value="half_day">Half day</SelectItem>
                              <SelectItem value="undertime">Undertime</SelectItem>
                              <SelectItem value="suspension">Suspension</SelectItem>
                              <SelectItem value="unauthorized_absent">Unauthorized absent</SelectItem>
                              <SelectItem value="sil">SIL (Service incentive leave)</SelectItem>
                              <SelectItem value="vl">VL (Vacation leave)</SelectItem>
                              <SelectItem value="change_day_off">Change Day off</SelectItem>
                              <SelectItem value="change_of_schedule">Change of Schedule</SelectItem>
                              <SelectItem value="cancel_day_off">Cancel Day off</SelectItem>
                              <SelectItem value="other_concern">Other Concern</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Day Off</Label>
                          <Input
                            value={attendanceForm.day_off}
                            onChange={(e) => setAttendanceForm({ ...attendanceForm, day_off: e.target.value })}
                            placeholder="Enter day off (e.g., Sunday)"
                          />
                        </div>
                        <div>
                          <Label>Shift</Label>
                          <Select value={attendanceForm.shift} onValueChange={(v) => setAttendanceForm({ ...attendanceForm, shift: v })}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select shift" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Opening">Opening</SelectItem>
                              <SelectItem value="Midshift">Midshift</SelectItem>
                              <SelectItem value="Closing">Closing</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Reason</Label>
                          <Textarea
                            value={attendanceForm.reason}
                            onChange={(e) => setAttendanceForm({ ...attendanceForm, reason: e.target.value })}
                            placeholder="Enter reason (optional)"
                          />
                        </div>
                        <div>
                          <Label>Date of Absent</Label>
                          <Input
                            type="date"
                            value={attendanceForm.date_of_absent}
                            onChange={(e) => setAttendanceForm({ ...attendanceForm, date_of_absent: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label>Date of Resume</Label>
                          <Input
                            type="date"
                            value={attendanceForm.date_of_resume}
                            onChange={(e) => setAttendanceForm({ ...attendanceForm, date_of_resume: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label>Remarks</Label>
                          <Textarea
                            value={attendanceForm.remarks}
                            onChange={(e) => setAttendanceForm({ ...attendanceForm, remarks: e.target.value })}
                            placeholder="Enter remarks (optional)"
                          />
                        </div>
                        <div>
                          <Label>Notes</Label>
                          <Textarea
                            value={attendanceForm.notes}
                            onChange={(e) => setAttendanceForm({ ...attendanceForm, notes: e.target.value })}
                            placeholder="Enter notes (optional)"
                          />
                        </div>
                        <Button
                          className="w-full"
                          onClick={() => {
                            if (editingRecord) {
                              updateAttendanceMutation.mutate({ id: editingRecord.id, data: attendanceForm });
                            } else {
                              createAttendanceMutation.mutate(attendanceForm);
                            }
                          }}
                          disabled={!attendanceForm.employee_id || !attendanceForm.attendance_date}
                        >
                          {editingRecord ? 'Update Record' : 'Add Record'}
                        </Button>
                      </div>
                    </ScrollArea>
                  </DialogContent>
                </Dialog>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Attendance Records Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.find(c => c.key === 'photo')?.visible && <TableHead>Photo</TableHead>}
                  {columns.find(c => c.key === 'name')?.visible && <TableHead style={{ width: columns.find(c => c.key === 'name')?.width }}>Employee Name</TableHead>}
                  {columns.find(c => c.key === 'date_hired')?.visible && <TableHead style={{ width: columns.find(c => c.key === 'date_hired')?.width }}>Date Hired</TableHead>}
                  {columns.find(c => c.key === 'status')?.visible && <TableHead style={{ width: columns.find(c => c.key === 'status')?.width }}>Status</TableHead>}
                  {columns.find(c => c.key === 'brand')?.visible && <TableHead style={{ width: columns.find(c => c.key === 'brand')?.width }}>Brand</TableHead>}
                  {columns.find(c => c.key === 'branch')?.visible && <TableHead style={{ width: columns.find(c => c.key === 'branch')?.width }}>Branch</TableHead>}
                  {columns.find(c => c.key === 'date')?.visible && <TableHead style={{ width: columns.find(c => c.key === 'date')?.width }}>Date Today</TableHead>}
                  {columns.find(c => c.key === 'day_off')?.visible && <TableHead style={{ width: columns.find(c => c.key === 'day_off')?.width }}>Day Off</TableHead>}
                  {columns.find(c => c.key === 'shift')?.visible && <TableHead style={{ width: columns.find(c => c.key === 'shift')?.width }}>Shift</TableHead>}
                  {columns.find(c => c.key === 'actions')?.visible && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8">Loading...</TableCell>
                  </TableRow>
                ) : filteredRecords.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                      No attendance records found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRecords.map((record) => (
                    <TableRow key={record.id}>
                      {columns.find(c => c.key === 'photo')?.visible && (
                        <TableCell>
                          <Avatar 
                            className={cn("h-10 w-10", record.employees?.photo_url && "cursor-pointer hover:ring-2 hover:ring-primary transition-all")}
                            onClick={() => record.employees?.photo_url && setViewingPhoto({ url: record.employees.photo_url, name: record.employees.full_name || 'Employee' })}
                          >
                            <AvatarImage src={record.employees?.photo_url || ''} />
                            <AvatarFallback>
                              {record.employees?.full_name?.charAt(0) || '?'}
                            </AvatarFallback>
                          </Avatar>
                        </TableCell>
                      )}
                      {columns.find(c => c.key === 'name')?.visible && (
                        <TableCell className="font-medium">{record.employees?.full_name}</TableCell>
                      )}
                      {columns.find(c => c.key === 'date_hired')?.visible && (
                        <TableCell>{record.employees?.date_hired ? format(new Date(record.employees.date_hired), 'MM-dd-yyyy') : '-'}</TableCell>
                      )}
                      {columns.find(c => c.key === 'status')?.visible && (
                        <TableCell>{getStatusBadge(record.status)}</TableCell>
                      )}
                      {columns.find(c => c.key === 'brand')?.visible && (
                        <TableCell>{record.employees?.category || '-'}</TableCell>
                      )}
                      {columns.find(c => c.key === 'branch')?.visible && (
                        <TableCell>{record.employees?.branch || record.employees?.branches?.name || '-'}</TableCell>
                      )}
                      {columns.find(c => c.key === 'date')?.visible && (
                        <TableCell>{format(new Date(record.attendance_date), 'MM-dd-yyyy')}</TableCell>
                      )}
                      {columns.find(c => c.key === 'day_off')?.visible && (
                        <TableCell>{record.day_off || '-'}</TableCell>
                      )}
                      {columns.find(c => c.key === 'shift')?.visible && (
                        <TableCell>{record.shift || '-'}</TableCell>
                      )}
                      {columns.find(c => c.key === 'actions')?.visible && (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="icon" onClick={() => setViewingRecord(record)} title="View Details">
                              <Eye className="h-4 w-4" />
                            </Button>
                            {canEdit && (
                              <>
                                <Button variant="ghost" size="icon" onClick={() => handleEditAttendance(record)} title="Edit">
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                {isAdmin && (
                                  <Button variant="ghost" size="icon" onClick={() => deleteAttendanceMutation.mutate(record.id)} title="Delete">
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                )}
                              </>
                            )}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Attendance Status Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              Attendance Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={attendanceChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={70}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {attendanceChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-muted-foreground text-center mt-2">
              Total: {filteredRecords.length} records in {selectedYear}
            </p>
          </CardContent>
        </Card>

        {/* Resume to Work Trend Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <RotateCcw className="h-4 w-4" />
              Resume to Work Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={resumeByMonthData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip />
                  <Bar dataKey="resumptions" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-muted-foreground text-center mt-2">
              Total Resumptions: {filteredRecords.filter(r => r.date_of_resume).length} (filtered)
            </p>
          </CardContent>
        </Card>

        {/* Manpower Status Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4" />
              Manpower Database
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={employeeStatusData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={80} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip />
                  <Bar dataKey="value" fill="hsl(var(--secondary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-muted-foreground text-center mt-2">
              Total Employees: {employees.length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Registered Employees Section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Users className="h-4 w-4" />
            Registered Employees ({employees.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {employees.length === 0 ? (
            <p className="text-center text-muted-foreground py-6">No employees registered yet</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {employees.map(employee => (
                <div 
                  key={employee.id} 
                  className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={employee.photo_url || ''} alt={employee.full_name} />
                    <AvatarFallback>{employee.full_name?.charAt(0) || '?'}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{employee.full_name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {employee.branch || employee.branches?.name || 'No Branch'}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs shrink-0">
                    {employee.employment_status || 'N/A'}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Photo Preview Dialog */}
      <Dialog open={!!viewingPhoto} onOpenChange={() => { setViewingPhoto(null); setPhotoZoomLevel(1); }}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>{viewingPhoto?.name}</span>
              <div className="flex items-center gap-2 mr-6">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setPhotoZoomLevel(prev => Math.max(0.5, prev - 0.25))}
                  disabled={photoZoomLevel <= 0.5}
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <span className="text-sm font-medium min-w-[60px] text-center">
                  {Math.round(photoZoomLevel * 100)}%
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setPhotoZoomLevel(prev => Math.min(3, prev + 0.25))}
                  disabled={photoZoomLevel >= 3}
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
              </div>
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[60vh] w-full border rounded-lg">
            <div 
              className="p-4" 
              style={{ 
                width: photoZoomLevel > 1 ? `${photoZoomLevel * 100}%` : '100%',
                height: photoZoomLevel > 1 ? `${photoZoomLevel * 60}vh` : 'auto'
              }}
            >
              <img
                src={viewingPhoto?.url}
                alt={viewingPhoto?.name}
                className="rounded-lg transition-all duration-200 w-full h-auto"
              />
            </div>
            <ScrollBar orientation="horizontal" />
            <ScrollBar orientation="vertical" />
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* View Attendance Record Dialog */}
      <Dialog open={!!viewingRecord} onOpenChange={(open) => !open && setViewingRecord(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarImage src={viewingRecord?.employees?.photo_url || ''} />
                <AvatarFallback>{viewingRecord?.employees?.full_name?.charAt(0) || '?'}</AvatarFallback>
              </Avatar>
              <span>{viewingRecord?.employees?.full_name || 'Attendance Record'}</span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Branch</p>
                <p className="font-medium">{viewingRecord?.employees?.branches?.name || '-'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Date</p>
                <p className="font-medium">{viewingRecord?.attendance_date ? format(new Date(viewingRecord.attendance_date), 'MMMM dd, yyyy') : '-'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Status</p>
                <div>{viewingRecord?.status ? getStatusBadge(viewingRecord.status) : '-'}</div>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Day Off</p>
                <p className="font-medium">{viewingRecord?.day_off || '-'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Shift</p>
                <p className="font-medium">{viewingRecord?.shift || '-'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Date of Absent</p>
                <p className="font-medium">{viewingRecord?.date_of_absent ? format(new Date(viewingRecord.date_of_absent), 'MMMM dd, yyyy') : '-'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Date of Resume</p>
                <p className="font-medium">{viewingRecord?.date_of_resume ? format(new Date(viewingRecord.date_of_resume), 'MMMM dd, yyyy') : '-'}</p>
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
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Notes</p>
              <p className="font-medium bg-muted p-3 rounded-md">{viewingRecord?.notes || '-'}</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Attendance;
