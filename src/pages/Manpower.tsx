import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, differenceInYears, differenceInMonths, startOfMonth, endOfMonth, getMonth, getYear } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { useToast } from '@/hooks/use-toast';
import { useActivityLog } from '@/hooks/useActivityLog';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PinProtectionDialog } from '@/components/auth/PinProtectionDialog';
import { 
  Search, 
  Download, 
  Plus, 
  Users,
  Pencil,
  Trash2,
  Upload,
  X,
  FileText,
  Database,
  ZoomIn,
  ZoomOut,
  Eye,
  ClipboardList,
  RotateCcw,
  Calendar,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Printer,
  Building2,
  Lock,
  Settings
} from 'lucide-react';
import { cn } from '@/lib/utils';
import * as ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import ColumnSettings, { GenericColumnConfig } from '@/components/common/ColumnSettings';
import { useGenericColumnSettings } from '@/hooks/useGenericColumnSettings';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';

const CHART_COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const defaultManpowerColumns: GenericColumnConfig[] = [
  { key: 'branch', label: 'Branch', visible: true, width: 120, minWidth: 80, maxWidth: 180 },
  { key: 'photo', label: 'Photo', visible: true, width: 50, minWidth: 40, maxWidth: 80 },
  { key: 'name', label: 'Employee Name', visible: true, width: 150, minWidth: 100, maxWidth: 250 },
  { key: 'gender', label: 'Gender', visible: true, width: 80, minWidth: 60, maxWidth: 120 },
  { key: 'age', label: 'Age', visible: true, width: 60, minWidth: 50, maxWidth: 100 },
  { key: 'position', label: 'Position', visible: true, width: 120, minWidth: 80, maxWidth: 180 },
  { key: 'category', label: 'Category', visible: true, width: 100, minWidth: 80, maxWidth: 150 },
  { key: 'status', label: 'Status', visible: true, width: 110, minWidth: 90, maxWidth: 150 },
  { key: 'date_hired', label: 'Date Hired', visible: true, width: 120, minWidth: 100, maxWidth: 150 },
  { key: 'service', label: 'Length of Service', visible: true, width: 120, minWidth: 90, maxWidth: 150 },
  { key: 'contact', label: 'Contact No.', visible: true, width: 120, minWidth: 100, maxWidth: 150 },
  { key: 'address', label: 'Address', visible: true, width: 150, minWidth: 100, maxWidth: 250 },
  { key: 'remarks', label: 'Remarks', visible: true, width: 150, minWidth: 100, maxWidth: 250 },
  { key: 'actions', label: 'Actions', visible: true, width: 120, minWidth: 100, maxWidth: 150 },
];

interface Employee {
  id: string;
  employee_id: string | null;
  full_name: string;
  age: number | null;
  gender: string | null;
  date_of_birth: string | null;
  address: string | null;
  cell_no: string | null;
  branch_id: string | null;
  branch: string | null;
  category: string | null;
  position: string | null;
  employment_status: string;
  date_hired: string;
  maternity: string | null;
  remarks: string | null;
  photo_url: string | null;
  is_active: boolean;
  created_at: string;
  branches?: { name: string } | null;
}

const genderOptions = ['Male', 'Female'];
const categoryOptions = ['MHB', 'MLP', 'MUM', 'MSH'];
// Office positions (for Office Attendance tab)
const officePositions = ['Manager', 'Assistant Manager', 'Sales Assistant', 'Stock Merchandising', 'Encoder Inventory', 'Stock Support Event', 'Team Leader'];
// Store positions
const storePositions = ['OIC', 'AOIC', 'Key Person', 'Demo'];
// All positions combined for legacy compatibility
const positionOptions = [...officePositions, ...storePositions];
const statusOptions = ['Regular', 'Probationary', 'Seasonal', 'Newly Hired', 'Back Up', 'Support Event', 'Stock Man', 'Resigned'];
const maternityOptions = ['N/A', 'On Leave', 'Returned'];

const Manpower = () => {
  const { user, userRole } = useAuth();
  const { selectedBranch } = useBranch();
  const { toast } = useToast();
  const { logActivity } = useActivityLog();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // PIN protection state
  const [isPinVerified, setIsPinVerified] = useState(false);
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [showChangePinDialog, setShowChangePinDialog] = useState(false);
  const [newPin, setNewPin] = useState('');

  // Column settings
  const { columns, setColumns, isAdmin: isColumnAdmin } = useGenericColumnSettings('manpower', defaultManpowerColumns);

  const [searchQuery, setSearchQuery] = useState('');
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [positionFilter, setPositionFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [genderFilter, setGenderFilter] = useState<string>('all');
  const [maternityFilter, setMaternityFilter] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [viewingPhoto, setViewingPhoto] = useState<{ url: string; name: string } | null>(null);
  const [photoZoomLevel, setPhotoZoomLevel] = useState(1);
  const [viewingEmployee, setViewingEmployee] = useState<Employee | null>(null);
  const [activeTab, setActiveTab] = useState('manpower');
  
  // Sorting state
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  
  // Attendance summary filters
  const currentYear = new Date().getFullYear();
  const currentMonth = getMonth(new Date());
  const [attendanceMonth, setAttendanceMonth] = useState(currentMonth.toString());
  const [attendanceYear, setAttendanceYear] = useState(currentYear.toString());
  const [attendanceDate, setAttendanceDate] = useState<string>(''); // Specific date for daily report
  const [positionCategoryFilter, setPositionCategoryFilter] = useState<string>('all'); // Store, Office, Team Leader, All
  
  // Manpower Summary filters
  const [summaryCategory, setSummaryCategory] = useState<string>('all');
  const [summaryPosition, setSummaryPosition] = useState<string>('all');
  const [summaryMaternity, setSummaryMaternity] = useState<string>('all');
  const [summarySortOrder, setSummarySortOrder] = useState<'newest' | 'oldest'>('newest');

  // Office Attendance Add modal states
  const [isOfficeAttendanceModalOpen, setIsOfficeAttendanceModalOpen] = useState(false);
  const [officeAttendanceForm, setOfficeAttendanceForm] = useState({
    employee_id: '',
    attendance_date: format(new Date(), 'yyyy-MM-dd'),
    status: 'present',
    day_off: '',
    shift: '',
    remarks: ''
  });

  // Office Attendance Edit/View modal states
  const [isOfficeEditModalOpen, setIsOfficeEditModalOpen] = useState(false);
  const [isOfficeViewModalOpen, setIsOfficeViewModalOpen] = useState(false);
  const [editingOfficeAttendance, setEditingOfficeAttendance] = useState<any>(null);
  const [viewingOfficeAttendance, setViewingOfficeAttendance] = useState<any>(null);
  const [officeEditForm, setOfficeEditForm] = useState({
    status: 'present',
    day_off: '',
    shift: '',
    remarks: ''
  });

  const [form, setForm] = useState({
    employee_id: '',
    full_name: '',
    age: '',
    gender: '',
    date_of_birth: '',
    address: '',
    cell_no: '',
    branch_id: '',
    branch: '',
    category: '',
    position: '',
    employment_status: 'Regular',
    date_hired: '',
    maternity: 'N/A',
    remarks: '',
    photo_url: ''
  });

  const isAdmin = userRole === 'admin';
  const isStaff = userRole === 'staff';
  const isHR = userRole === 'hr';
  const isOIC = userRole === 'oic';
  const isTeamleader = userRole === 'teamleader';
  const isAssistant = userRole === 'assistant';
  const canAdd = isAdmin || isStaff || isHR || isAssistant;
  const canEdit = isAdmin || isStaff || isHR || isAssistant; // Admin, Staff, HR, and Assistant can edit
  const canDelete = isAdmin; // Only admin can delete

  // Realtime subscription for attendance_records and employees
  useEffect(() => {
    const channel = supabase
      .channel('manpower-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance_records' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['manpower-attendance-summary'] });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'employees' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['manpower-employees'] });
          queryClient.invalidateQueries({ queryKey: ['manpower-deleted-employees'] });
          queryClient.invalidateQueries({ queryKey: ['manpower-attendance-summary'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Show PIN dialog for non-admin users
  useEffect(() => {
    if (!isAdmin && !isPinVerified) {
      setShowPinDialog(true);
    }
  }, [isAdmin, isPinVerified]);

  // Update PIN mutation (admin only)
  const updatePinMutation = useMutation({
    mutationFn: async (pin: string) => {
      // Try to update first
      const { data: existing } = await supabase
        .from('page_access_pins')
        .select('id')
        .eq('page_name', 'manpower')
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('page_access_pins')
          .update({ pin, updated_at: new Date().toISOString(), updated_by: user?.id })
          .eq('page_name', 'manpower');
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('page_access_pins')
          .insert({ page_name: 'manpower', pin, updated_by: user?.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast({ title: 'PIN updated successfully!' });
      setShowChangePinDialog(false);
      setNewPin('');
    },
    onError: (error: any) => {
      toast({ title: 'Error updating PIN', description: error.message, variant: 'destructive' });
    }
  });
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

  // Fetch active employees - filter by both deleted_at and is_active
  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['manpower-employees'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('*, branches(name)')
        .is('deleted_at', null)
        .eq('is_active', true)
        .order('full_name');

      if (error) throw error;
      return data as Employee[];
    }
  });

  // Fetch deleted employees
  const { data: deletedEmployees = [] } = useQuery({
    queryKey: ['manpower-deleted-employees'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('*, branches(name)')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false });

      if (error) throw error;
      return data as Employee[];
    }
  });

  // Fetch attendance records for summary
  const { data: attendanceRecords = [] } = useQuery({
    queryKey: ['manpower-attendance-summary', attendanceYear, attendanceMonth, attendanceDate],
    queryFn: async () => {
      const monthNum = parseInt(attendanceMonth) + 1;
      
      // If specific date is selected, use that date only
      let startDate: string;
      let endDate: string;
      
      if (attendanceDate) {
        startDate = attendanceDate;
        endDate = attendanceDate;
      } else {
        startDate = `${attendanceYear}-${String(monthNum).padStart(2, '0')}-01`;
        endDate = format(endOfMonth(new Date(parseInt(attendanceYear), parseInt(attendanceMonth))), 'yyyy-MM-dd');
      }
      
      const { data, error } = await supabase
        .from('attendance_records')
        .select('*, employees(full_name, branch, category, position, photo_url, is_active, deleted_at)')
        .gte('attendance_date', startDate)
        .lte('attendance_date', endDate);
      
      if (error) throw error;
      return data || [];
    },
  });

  // Get the global branch id for filtering (use branch_id instead of branch name)
  const globalBranchId = selectedBranch?.id || null;

  // Get unique branch names from employees - filtered by global branch selection
  const uniqueBranches = useMemo(() => {
    // If there's a global branch selection, only show that branch
    const filteredByGlobalBranch = globalBranchId 
      ? employees.filter(emp => emp.branch_id === globalBranchId)
      : employees;
    
    const branchNames = filteredByGlobalBranch
      .map(emp => emp.branch)
      .filter((branch): branch is string => !!branch && branch.trim() !== '');
    return [...new Set(branchNames)].sort();
  }, [employees, globalBranchId]);

  // Filter employees - prioritize global branch by branch_id
  const filteredEmployees = useMemo(() => {
    let filtered = employees.filter(emp => {
      const matchesSearch = !searchQuery || 
        emp.employee_id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        emp.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        emp.branch?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        emp.position?.toLowerCase().includes(searchQuery.toLowerCase());
      
      // First filter by global branch using branch_id
      if (globalBranchId && emp.branch_id !== globalBranchId) {
        return false;
      }
      
      // Then apply local filters
      const matchesBranch = branchFilter === 'all' || emp.branch === branchFilter;
      const matchesPosition = positionFilter === 'all' || emp.position === positionFilter;
      const matchesCategory = categoryFilter === 'all' || emp.category === categoryFilter;
      const matchesStatus = statusFilter === 'all' || emp.employment_status.toLowerCase() === statusFilter.toLowerCase();
      const matchesGender = genderFilter === 'all' || emp.gender === genderFilter;
      const matchesMaternity = maternityFilter === 'all' || emp.maternity === maternityFilter;
      return matchesSearch && matchesBranch && matchesPosition && matchesCategory && matchesStatus && matchesGender && matchesMaternity;
    });
    
    // Apply sorting
    if (sortColumn) {
      filtered = [...filtered].sort((a, b) => {
        let aVal: any = '';
        let bVal: any = '';
        
        switch (sortColumn) {
          case 'name':
            aVal = a.full_name || '';
            bVal = b.full_name || '';
            break;
          case 'position':
            aVal = a.position || '';
            bVal = b.position || '';
            break;
          case 'branch':
            aVal = a.branch || '';
            bVal = b.branch || '';
            break;
          case 'category':
            aVal = a.category || '';
            bVal = b.category || '';
            break;
          case 'status':
            aVal = a.employment_status || '';
            bVal = b.employment_status || '';
            break;
          case 'date_hired':
            aVal = new Date(a.date_hired).getTime();
            bVal = new Date(b.date_hired).getTime();
            break;
          case 'age':
            aVal = a.age || 0;
            bVal = b.age || 0;
            break;
          case 'gender':
            aVal = a.gender || '';
            bVal = b.gender || '';
            break;
          default:
            return 0;
        }
        
        if (typeof aVal === 'string') {
          const comparison = aVal.localeCompare(bVal);
          return sortDirection === 'asc' ? comparison : -comparison;
        } else {
          return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
        }
      });
    }
    
    return filtered;
  }, [employees, searchQuery, globalBranchId, branchFilter, positionFilter, categoryFilter, statusFilter, genderFilter, maternityFilter, sortColumn, sortDirection]);

  // Handle column sort
  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // Sort icon component
  const SortIcon = ({ column }: { column: string }) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="ml-1 h-3 w-3 opacity-50" />;
    }
    return sortDirection === 'asc' 
      ? <ArrowUp className="ml-1 h-3 w-3" /> 
      : <ArrowDown className="ml-1 h-3 w-3" />;
  };

  // Position category mapping
  const storePositions = ['Demo', 'OIC', 'AOIC', 'Key Person'];
  const officePositions = ['Manager', 'Assistant Manager', 'Sales Assistant', 'Stock Merchandising', 'Encoder Inventory', 'Stock Support Event', 'Team Leader'];
  const teamLeaderPositions = ['Team Leader'];

  // Attendance summary data with employee details by status
  const attendanceSummary = useMemo(() => {
    const statusCounts: Record<string, number> = {};
    const branchCounts: Record<string, { total: number; statuses: Record<string, number> }> = {};
    const employeesByStatus: Record<string, Array<{ name: string; branch: string; date: string; photo_url?: string; position?: string }>> = {};

    // NOTE: When an employee is soft-deleted (deleted_at set) or deactivated (is_active=false),
    // their historical attendance records still exist. For the summary UI, we hide those employees.
    const normalizeEmployee = (emp: any) => (Array.isArray(emp) ? emp[0] : emp);
    
    // Filter by position category
    const filterByPositionCategory = (position: string | null): boolean => {
      if (positionCategoryFilter === 'all') return true;
      if (!position) return false;
      
      switch (positionCategoryFilter) {
        case 'store':
          return storePositions.some(p => p.toLowerCase() === position.toLowerCase());
        case 'office':
          return officePositions.some(p => p.toLowerCase() === position.toLowerCase());
        case 'teamleader':
          return teamLeaderPositions.some(p => p.toLowerCase() === position.toLowerCase());
        default:
          return true;
      }
    };
    
    const activeAttendanceRecords = attendanceRecords.filter((record: any) => {
      const emp = normalizeEmployee(record.employees);
      if (!emp || emp.is_active !== true || emp.deleted_at) return false;
      return filterByPositionCategory(emp.position);
    });
    
    activeAttendanceRecords.forEach((record: any) => {
      const emp = normalizeEmployee(record.employees);
      const status = record.status || 'unknown';
      const branch = emp?.branch || 'Unknown';
      const employeeName = emp?.full_name || 'Unknown';
      const photoUrl = emp?.photo_url;
      const position = emp?.position;
      const attendanceDate = record.attendance_date;
      
      statusCounts[status] = (statusCounts[status] || 0) + 1;
      
      if (!branchCounts[branch]) {
        branchCounts[branch] = { total: 0, statuses: {} };
      }
      branchCounts[branch].total += 1;
      branchCounts[branch].statuses[status] = (branchCounts[branch].statuses[status] || 0) + 1;
      
      // Track employees by status
      if (!employeesByStatus[status]) {
        employeesByStatus[status] = [];
      }
      employeesByStatus[status].push({ 
        name: employeeName, 
        branch, 
        date: attendanceDate,
        photo_url: photoUrl,
        position
      });
    });
    
    const statusData = Object.entries(statusCounts)
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);
    
    const branchData = Object.entries(branchCounts)
      .map(([branch, data]) => ({ branch, ...data }))
      .sort((a, b) => b.total - a.total);
    
    const resumeRecords = activeAttendanceRecords.filter((r: any) => r.date_of_resume);
    
    return {
      totalRecords: activeAttendanceRecords.length,
      statusData,
      branchData,
      resumeCount: resumeRecords.length,
      totalEmployees: filteredEmployees.length,
      employeesByStatus,
    };
  }, [attendanceRecords, filteredEmployees, positionCategoryFilter]);

  // Office-only Attendance Summary (filtered to office positions only)
  const officeAttendanceSummary = useMemo(() => {
    const statusCounts: Record<string, number> = {};
    const branchCounts: Record<string, { total: number; statuses: Record<string, number> }> = {};
    const employeesByStatus: Record<string, Array<{ name: string; branch: string; date: string; photo_url?: string; position?: string }>> = {};

    const normalizeEmployee = (emp: any) => (Array.isArray(emp) ? emp[0] : emp);
    
    // Filter ONLY office positions
    const filterOfficeOnly = (position: string | null): boolean => {
      if (!position) return false;
      return officePositions.some(p => p.toLowerCase() === position.toLowerCase());
    };
    
    const officeAttendanceRecords = attendanceRecords.filter((record: any) => {
      const emp = normalizeEmployee(record.employees);
      if (!emp || emp.is_active !== true || emp.deleted_at) return false;
      return filterOfficeOnly(emp.position);
    });
    
    officeAttendanceRecords.forEach((record: any) => {
      const emp = normalizeEmployee(record.employees);
      const status = record.status || 'unknown';
      const branch = emp?.branch || 'Unknown';
      const employeeName = emp?.full_name || 'Unknown';
      const photoUrl = emp?.photo_url;
      const position = emp?.position;
      const attendanceDate = record.attendance_date;
      
      statusCounts[status] = (statusCounts[status] || 0) + 1;
      
      if (!branchCounts[branch]) {
        branchCounts[branch] = { total: 0, statuses: {} };
      }
      branchCounts[branch].total += 1;
      branchCounts[branch].statuses[status] = (branchCounts[branch].statuses[status] || 0) + 1;
      
      // Track employees by status
      if (!employeesByStatus[status]) {
        employeesByStatus[status] = [];
      }
      employeesByStatus[status].push({ 
        name: employeeName, 
        branch, 
        date: attendanceDate,
        photo_url: photoUrl,
        position
      });
    });
    
    const statusData = Object.entries(statusCounts)
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);
    
    const branchData = Object.entries(branchCounts)
      .map(([branch, data]) => ({ branch, ...data }))
      .sort((a, b) => b.total - a.total);
    
    const resumeRecords = officeAttendanceRecords.filter((r: any) => r.date_of_resume);
    
    // Count office employees only
    const officeEmployees = filteredEmployees.filter(emp => 
      emp.position && officePositions.some(p => p.toLowerCase() === emp.position?.toLowerCase())
    );
    
    return {
      totalRecords: officeAttendanceRecords.length,
      statusData,
      branchData,
      resumeCount: resumeRecords.length,
      totalEmployees: officeEmployees.length,
      employeesByStatus,
    };
  }, [attendanceRecords, filteredEmployees]);

  // Office employees for Add Attendance modal (only office positions)
  const officeEmployees = useMemo(() => {
    return employees.filter(emp => {
      // Global branch filter
      if (globalBranchId && emp.branch_id !== globalBranchId) {
        return false;
      }
      // Only office positions
      return emp.position && officePositions.some(p => p.toLowerCase() === emp.position?.toLowerCase());
    });
  }, [employees, globalBranchId]);

  // Create office attendance mutation
  const createOfficeAttendanceMutation = useMutation({
    mutationFn: async (data: typeof officeAttendanceForm) => {
      const selectedEmployee = officeEmployees.find(e => e.id === data.employee_id);
      const { error } = await supabase.from('attendance_records').insert({
        employee_id: data.employee_id,
        attendance_date: data.attendance_date,
        status: data.status,
        day_off: data.day_off || null,
        shift: data.shift || null,
        remarks: data.remarks || null,
        branch_id: selectedEmployee?.branch_id || selectedBranch?.id || null,
        created_by: user?.id
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['manpower-attendance-summary'] });
      toast({ title: 'Attendance record added successfully!' });
      setIsOfficeAttendanceModalOpen(false);
      setOfficeAttendanceForm({
        employee_id: '',
        attendance_date: format(new Date(), 'yyyy-MM-dd'),
        status: 'present',
        day_off: '',
        shift: '',
        remarks: ''
      });
      logActivity({ actionType: 'create', module: 'attendance', description: 'Added office attendance record' });
    },
    onError: (error: any) => {
      toast({ title: 'Error adding attendance', description: error.message, variant: 'destructive' });
    }
  });

  // Update office attendance mutation
  const updateOfficeAttendanceMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof officeEditForm }) => {
      const { error } = await supabase
        .from('attendance_records')
        .update({
          status: data.status,
          day_off: data.day_off || null,
          shift: data.shift || null,
          remarks: data.remarks || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['manpower-attendance-summary'] });
      toast({ title: 'Attendance record updated successfully!' });
      setIsOfficeEditModalOpen(false);
      setEditingOfficeAttendance(null);
      logActivity({ actionType: 'update', module: 'attendance', description: 'Updated office attendance record' });
    },
    onError: (error: any) => {
      toast({ title: 'Error updating attendance', description: error.message, variant: 'destructive' });
    }
  });

  // Delete office attendance mutation
  const deleteOfficeAttendanceMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('attendance_records')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['manpower-attendance-summary'] });
      toast({ title: 'Attendance record deleted successfully!' });
      logActivity({ actionType: 'delete', module: 'attendance', description: 'Deleted office attendance record' });
    },
    onError: (error: any) => {
      toast({ title: 'Error deleting attendance', description: error.message, variant: 'destructive' });
    }
  });

  // Get office attendance records for table display
  const officeAttendanceRecordsList = useMemo(() => {
    const officePositionsLower = officePositions.map(p => p.toLowerCase());
    
    return attendanceRecords
      .filter((record: any) => {
        const emp = record.employees;
        if (!emp || emp.is_active !== true || emp.deleted_at) return false;
        return emp.position && officePositionsLower.includes(emp.position.toLowerCase());
      })
      .sort((a: any, b: any) => new Date(b.attendance_date).getTime() - new Date(a.attendance_date).getTime());
  }, [attendanceRecords]);

  // Handle opening edit modal
  const handleEditOfficeAttendance = (record: any) => {
    setEditingOfficeAttendance(record);
    setOfficeEditForm({
      status: record.status || 'present',
      day_off: record.day_off || '',
      shift: record.shift || '',
      remarks: record.remarks || ''
    });
    setIsOfficeEditModalOpen(true);
  };

  // Handle opening view modal
  const handleViewOfficeAttendance = (record: any) => {
    setViewingOfficeAttendance(record);
    setIsOfficeViewModalOpen(true);
  };


  const manpowerSummaryData = useMemo(() => {
    // Apply filters first
    let filtered = employees.filter(emp => {
      // Global branch filter
      if (globalBranchId && emp.branch_id !== globalBranchId) {
        return false;
      }
      
      const matchesCategory = summaryCategory === 'all' || emp.category === summaryCategory;
      const matchesPosition = summaryPosition === 'all' || emp.position === summaryPosition;
      const matchesMaternity = summaryMaternity === 'all' || emp.maternity === summaryMaternity;
      
      return matchesCategory && matchesPosition && matchesMaternity;
    });
    
    // Sort by date hired
    filtered = [...filtered].sort((a, b) => {
      const dateA = new Date(a.date_hired).getTime();
      const dateB = new Date(b.date_hired).getTime();
      return summarySortOrder === 'newest' ? dateB - dateA : dateA - dateB;
    });
    
    // Group by branch
    const branchGroups: Record<string, Employee[]> = {};
    filtered.forEach(emp => {
      const branchName = emp.branch || emp.branches?.name || 'Unassigned';
      if (!branchGroups[branchName]) {
        branchGroups[branchName] = [];
      }
      branchGroups[branchName].push(emp);
    });
    
    // Convert to array and sort by count
    const branchSummary = Object.entries(branchGroups)
      .map(([branch, emps]) => ({
        branch,
        employees: emps,
        count: emps.length,
        regularCount: emps.filter(e => e.employment_status.toLowerCase() === 'regular').length,
        probationaryCount: emps.filter(e => e.employment_status.toLowerCase() === 'probationary').length,
      }))
      .sort((a, b) => b.count - a.count);
    
    return {
      totalFiltered: filtered.length,
      branchSummary,
      allFilteredEmployees: filtered,
    };
  }, [employees, globalBranchId, summaryCategory, summaryPosition, summaryMaternity, summarySortOrder]);

  // Export Manpower Summary to Excel
  const exportManpowerSummaryExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Warehouse Management System';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Manpower Summary');

    // Title
    const titleRow = worksheet.addRow(['Manpower Summary Report']);
    titleRow.font = { bold: true, size: 16, color: { argb: 'FFFFFF' } };
    titleRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '4472C4' } };
    titleRow.height = 28;
    titleRow.alignment = { vertical: 'middle', horizontal: 'center' };
    worksheet.mergeCells(1, 1, 1, 6);

    // Subtitle with filters
    const filterInfo = [
      summaryCategory !== 'all' ? `Category: ${summaryCategory}` : '',
      summaryPosition !== 'all' ? `Position: ${summaryPosition}` : '',
      summaryMaternity !== 'all' ? `Maternity: ${summaryMaternity}` : '',
    ].filter(Boolean).join(' | ') || 'All Employees';
    
    const subtitleRow = worksheet.addRow([`Generated: ${format(new Date(), 'MMM dd, yyyy')} | ${filterInfo}`]);
    subtitleRow.font = { italic: true, size: 11, color: { argb: '666666' } };
    subtitleRow.alignment = { vertical: 'middle', horizontal: 'center' };
    worksheet.mergeCells(2, 1, 2, 6);

    worksheet.addRow([]);

    // Headers
    const headerRow = worksheet.addRow(['Branch', 'Employee Name', 'Position', 'Category', 'Status', 'Date Hired']);
    headerRow.font = { bold: true, color: { argb: 'FFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '4472C4' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    worksheet.columns = [
      { width: 20 },
      { width: 25 },
      { width: 18 },
      { width: 12 },
      { width: 15 },
      { width: 15 },
    ];

    // Data rows
    manpowerSummaryData.allFilteredEmployees.forEach((emp, idx) => {
      const row = worksheet.addRow([
        emp.branch || emp.branches?.name || '-',
        emp.full_name,
        emp.position || '-',
        emp.category || '-',
        emp.employment_status,
        format(new Date(emp.date_hired), 'MMM dd, yyyy'),
      ]);
      if (idx % 2 === 0) {
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F5F5F5' } };
      }
    });

    // Summary section
    worksheet.addRow([]);
    const summaryHeader = worksheet.addRow(['Branch Summary']);
    summaryHeader.font = { bold: true, size: 14 };
    worksheet.addRow(['Branch', 'Total', 'Regular', 'Probationary']);
    
    manpowerSummaryData.branchSummary.forEach(b => {
      worksheet.addRow([b.branch, b.count, b.regularCount, b.probationaryCount]);
    });

    // Download
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `manpower-summary-${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    toast({ title: 'Excel exported successfully!' });
  };

  // Export Manpower Summary to PDF
  const exportManpowerSummaryPDF = () => {
    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.text('Manpower Summary Report', 14, 20);
    
    doc.setFontSize(10);
    const filterInfo = [
      summaryCategory !== 'all' ? `Category: ${summaryCategory}` : '',
      summaryPosition !== 'all' ? `Position: ${summaryPosition}` : '',
      summaryMaternity !== 'all' ? `Maternity: ${summaryMaternity}` : '',
    ].filter(Boolean).join(' | ') || 'All Employees';
    doc.text(`Generated: ${format(new Date(), 'MMM dd, yyyy')} | ${filterInfo}`, 14, 28);
    
    // Employee list table
    autoTable(doc, {
      startY: 35,
      head: [['Branch', 'Employee Name', 'Position', 'Category', 'Status', 'Date Hired']],
      body: manpowerSummaryData.allFilteredEmployees.map(emp => [
        emp.branch || emp.branches?.name || '-',
        emp.full_name,
        emp.position || '-',
        emp.category || '-',
        emp.employment_status,
        format(new Date(emp.date_hired), 'MMM dd, yyyy'),
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [68, 114, 196] },
    });

    // Branch summary table
    const finalY = (doc as any).lastAutoTable?.finalY || 35;
    doc.setFontSize(14);
    doc.text('Branch Summary', 14, finalY + 15);
    
    autoTable(doc, {
      startY: finalY + 20,
      head: [['Branch', 'Total', 'Regular', 'Probationary']],
      body: manpowerSummaryData.branchSummary.map(b => [
        b.branch,
        b.count.toString(),
        b.regularCount.toString(),
        b.probationaryCount.toString(),
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [68, 114, 196] },
    });
    
    doc.save(`manpower-summary-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
    toast({ title: 'PDF exported successfully!' });
  };

  // Print Manpower Summary
  const printManpowerSummary = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    
    const filterInfo = [
      summaryCategory !== 'all' ? `Category: ${summaryCategory}` : '',
      summaryPosition !== 'all' ? `Position: ${summaryPosition}` : '',
      summaryMaternity !== 'all' ? `Maternity: ${summaryMaternity}` : '',
    ].filter(Boolean).join(' | ') || 'All Employees';
    
    printWindow.document.write(`
      <html>
        <head>
          <title>Manpower Summary Report</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { color: #333; margin-bottom: 5px; }
            .subtitle { color: #666; font-size: 12px; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 11px; }
            th { background-color: #4472C4; color: white; }
            tr:nth-child(even) { background-color: #f9f9f9; }
            .summary-title { margin-top: 30px; font-size: 16px; font-weight: bold; }
            @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
          </style>
        </head>
        <body>
          <h1>Manpower Summary Report</h1>
          <p class="subtitle">Generated: ${format(new Date(), 'MMM dd, yyyy')} | ${filterInfo}</p>
          
          <table>
            <thead>
              <tr>
                <th>Branch</th>
                <th>Employee Name</th>
                <th>Position</th>
                <th>Category</th>
                <th>Status</th>
                <th>Date Hired</th>
              </tr>
            </thead>
            <tbody>
              ${manpowerSummaryData.allFilteredEmployees.map(emp => `
                <tr>
                  <td>${emp.branch || emp.branches?.name || '-'}</td>
                  <td>${emp.full_name}</td>
                  <td>${emp.position || '-'}</td>
                  <td>${emp.category || '-'}</td>
                  <td>${emp.employment_status}</td>
                  <td>${format(new Date(emp.date_hired), 'MMM dd, yyyy')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          
          <p class="summary-title">Branch Summary</p>
          <table>
            <thead>
              <tr>
                <th>Branch</th>
                <th>Total</th>
                <th>Regular</th>
                <th>Probationary</th>
              </tr>
            </thead>
            <tbody>
              ${manpowerSummaryData.branchSummary.map(b => `
                <tr>
                  <td>${b.branch}</td>
                  <td>${b.count}</td>
                  <td>${b.regularCount}</td>
                  <td>${b.probationaryCount}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  // Calculate length of service
  const getLengthOfService = (dateHired: string) => {
    const years = differenceInYears(new Date(), new Date(dateHired));
    const months = differenceInMonths(new Date(), new Date(dateHired)) % 12;
    if (years > 0) {
      return `${years}y ${months}m`;
    }
    return `${months}m`;
  };

  // Mutations
  const createMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const { error } = await supabase.from('employees').insert({
        employee_id: data.employee_id || null,
        full_name: data.full_name,
        age: data.age ? parseInt(data.age) : null,
        gender: data.gender || null,
        date_of_birth: data.date_of_birth || null,
        address: data.address || null,
        cell_no: data.cell_no || null,
        // Ensure employee belongs to the currently selected global branch
        branch_id: data.branch_id || selectedBranch?.id || null,
        branch: data.branch || null,
        category: data.category || null,
        position: data.position || null,
        employment_status: data.employment_status.toLowerCase(),
        date_hired: data.date_hired,
        maternity: data.maternity || null,
        remarks: data.remarks || null,
        photo_url: data.photo_url || null,
        created_by: user?.id
      });
      if (error) throw error;
    },
    onSuccess: (_, data) => {
      queryClient.invalidateQueries({ queryKey: ['manpower-employees'] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      logActivity({
        actionType: 'create',
        module: 'manpower',
        description: `Added new employee: ${data.full_name}`,
        metadata: { employee_name: data.full_name, position: data.position }
      });
      closeModal();
      toast({ title: 'Employee added successfully!' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof form }) => {
      const { error } = await supabase.from('employees').update({
        employee_id: data.employee_id || null,
        full_name: data.full_name,
        age: data.age ? parseInt(data.age) : null,
        gender: data.gender || null,
        date_of_birth: data.date_of_birth || null,
        address: data.address || null,
        cell_no: data.cell_no || null,
        // Keep/assign employee to the currently selected global branch if branch_id not provided
        branch_id: data.branch_id || selectedBranch?.id || null,
        branch: data.branch || null,
        category: data.category || null,
        position: data.position || null,
        employment_status: data.employment_status.toLowerCase(),
        date_hired: data.date_hired,
        maternity: data.maternity || null,
        remarks: data.remarks || null,
        photo_url: data.photo_url || null
      }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, { id, data }) => {
      queryClient.invalidateQueries({ queryKey: ['manpower-employees'] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      logActivity({
        actionType: 'update',
        module: 'manpower',
        description: `Updated employee: ${data.full_name}`,
        metadata: { employee_id: id, employee_name: data.full_name }
      });
      closeModal();
      toast({ title: 'Employee updated successfully!' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('employees').update({ 
        is_active: false,
        deleted_at: new Date().toISOString()
      }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['manpower-employees'] });
      queryClient.invalidateQueries({ queryKey: ['manpower-deleted-employees'] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['manpower-attendance-summary'] });
      logActivity({
        actionType: 'delete',
        module: 'manpower',
        description: `Deleted employee record`,
        metadata: { employee_id: id }
      });
      toast({ title: 'Employee moved to Recently Deleted!' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  });

  // Restore employee mutation
  const restoreMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('employees').update({ 
        is_active: true,
        deleted_at: null
      }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['manpower-employees'] });
      queryClient.invalidateQueries({ queryKey: ['manpower-deleted-employees'] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['manpower-attendance-summary'] });
      toast({ title: 'Employee restored successfully!' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  });

  // Permanent delete mutation
  const permanentDeleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('employees').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['manpower-deleted-employees'] });
      queryClient.invalidateQueries({ queryKey: ['manpower-attendance-summary'] });
      toast({ title: 'Employee permanently deleted!' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  });

  // Clear all attendance records for selected month
  const clearAttendanceMutation = useMutation({
    mutationFn: async () => {
      const monthNum = parseInt(attendanceMonth) + 1;
      const startDate = `${attendanceYear}-${String(monthNum).padStart(2, '0')}-01`;
      const endDate = format(endOfMonth(new Date(parseInt(attendanceYear), parseInt(attendanceMonth))), 'yyyy-MM-dd');
      
      const { error } = await supabase
        .from('attendance_records')
        .delete()
        .gte('attendance_date', startDate)
        .lte('attendance_date', endDate);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['manpower-attendance-summary'] });
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      toast({ title: 'Attendance records cleared successfully!' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  });

  const handleClearAttendance = () => {
    if (confirm(`Are you sure you want to clear all attendance records for ${MONTHS[parseInt(attendanceMonth)]} ${attendanceYear}? This action cannot be undone.`)) {
      clearAttendanceMutation.mutate();
    }
  };

  const resetForm = useCallback(() => {
    setForm({
      employee_id: '',
      full_name: '',
      age: '',
      gender: '',
      date_of_birth: '',
      address: '',
      cell_no: '',
      // Default branch_id to the globally selected branch for correct isolation
      branch_id: selectedBranch?.id || '',
      branch: '',
      category: '',
      position: '',
      employment_status: 'Regular',
      date_hired: '',
      maternity: 'N/A',
      remarks: '',
      photo_url: ''
    });
    setEditingEmployee(null);
    setPhotoFile(null);
    setPhotoPreview(null);
  }, [selectedBranch?.id]);

  const closeModal = () => {
    setIsModalOpen(false);
    resetForm();
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
    if (!photoFile) return form.photo_url || null;
    
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

  const handleSave = async () => {
    if (!form.full_name || !form.date_hired) {
      toast({ title: 'Error', description: 'Name and Date of Hire are required', variant: 'destructive' });
      return;
    }

    const photoUrl = await uploadPhoto();
    const formData = { ...form, photo_url: photoUrl || form.photo_url };
    
    if (editingEmployee) {
      updateMutation.mutate({ id: editingEmployee.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleEdit = (employee: Employee) => {
    setEditingEmployee(employee);
    setForm({
      employee_id: employee.employee_id || '',
      full_name: employee.full_name,
      age: employee.age?.toString() || '',
      gender: employee.gender || '',
      date_of_birth: employee.date_of_birth || '',
      address: employee.address || '',
      cell_no: employee.cell_no || '',
      branch_id: employee.branch_id || '',
      branch: employee.branch || '',
      category: employee.category || '',
      position: employee.position || '',
      employment_status: employee.employment_status.charAt(0).toUpperCase() + employee.employment_status.slice(1),
      date_hired: employee.date_hired,
      maternity: employee.maternity || 'N/A',
      remarks: employee.remarks || '',
      photo_url: employee.photo_url || ''
    });
    setPhotoPreview(employee.photo_url || null);
    setPhotoFile(null);
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this employee?')) {
      deleteMutation.mutate(id);
    }
  };

  // Export to Excel
  const handleExportExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Manpower Database');

    worksheet.columns = [
      { header: 'Employee ID', key: 'employee_id', width: 15 },
      { header: 'Name', key: 'name', width: 25 },
      { header: 'Age', key: 'age', width: 8 },
      { header: 'Gender', key: 'gender', width: 10 },
      { header: 'Date of Birth', key: 'dob', width: 15 },
      { header: 'Address', key: 'address', width: 30 },
      { header: 'Cell No', key: 'cell_no', width: 15 },
      { header: 'Branch', key: 'branch', width: 20 },
      { header: 'Category', key: 'category', width: 15 },
      { header: 'Position', key: 'position', width: 15 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Date of Hire', key: 'date_hired', width: 15 },
      { header: 'Length of Service', key: 'los', width: 15 },
      { header: 'Maternity', key: 'maternity', width: 12 },
      { header: 'Remarks', key: 'remarks', width: 30 }
    ];

    filteredEmployees.forEach(emp => {
      worksheet.addRow({
        employee_id: emp.employee_id || '',
        name: emp.full_name,
        age: emp.age || '',
        gender: emp.gender || '',
        dob: emp.date_of_birth || '',
        address: emp.address || '',
        cell_no: emp.cell_no || '',
        branch: emp.branch || emp.branches?.name || '',
        category: emp.category || '',
        position: emp.position || '',
        status: emp.employment_status,
        date_hired: emp.date_hired,
        los: getLengthOfService(emp.date_hired),
        maternity: emp.maternity || '',
        remarks: emp.remarks || ''
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    // Include branch filter in filename if filtered
    const branchSuffix = branchFilter !== 'all' ? `-${branchFilter.replace(/\s+/g, '-')}` : '';
    a.download = `manpower-database${branchSuffix}-${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export to PDF
  const handleExportPDF = () => {
    const doc = new jsPDF('landscape');
    doc.setFontSize(16);
    // Show branch name in title if filtered
    const titleSuffix = branchFilter !== 'all' ? ` - ${branchFilter}` : '';
    doc.text(`Manpower Database${titleSuffix}`, 14, 15);
    doc.setFontSize(10);
    doc.text(`Generated: ${format(new Date(), 'MMM dd, yyyy')} | Total: ${filteredEmployees.length} employees`, 14, 22);

    const tableData = filteredEmployees.map(emp => [
      emp.employee_id || '',
      emp.full_name,
      emp.gender || '',
      emp.branch || emp.branches?.name || '',
      emp.category || '',
      emp.position || '',
      emp.employment_status,
      emp.date_hired,
      getLengthOfService(emp.date_hired)
    ]);

    autoTable(doc, {
      head: [['ID', 'Name', 'Gender', 'Branch', 'Category', 'Position', 'Status', 'Date Hired', 'Service']],
      body: tableData,
      startY: 28,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [59, 130, 246] }
    });

    // Include branch filter in filename if filtered
    const branchSuffix = branchFilter !== 'all' ? `-${branchFilter.replace(/\s+/g, '-')}` : '';
    doc.save(`manpower-database${branchSuffix}-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  const updateFormField = useCallback((field: string, value: string) => {
    setForm(prev => {
      const updated = { ...prev, [field]: value };
      // Auto-calculate age when date of birth changes
      if (field === 'date_of_birth' && value) {
        const birthDate = new Date(value);
        const age = differenceInYears(new Date(), birthDate);
        updated.age = age >= 0 ? age.toString() : '';
      }
      return updated;
    });
  }, []);

  return (
    <>
      {/* PIN Protection Dialog for non-admin users */}
      <PinProtectionDialog
        open={showPinDialog && !isAdmin}
        pageName="manpower"
        onSuccess={() => {
          setIsPinVerified(true);
          setShowPinDialog(false);
        }}
        onCancel={() => {
          navigate('/dashboard');
        }}
      />

      {/* Change PIN Dialog for admin */}
      <Dialog open={showChangePinDialog} onOpenChange={setShowChangePinDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Change Access PIN
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>New PIN (4-6 digits)</Label>
              <Input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                placeholder="Enter new PIN"
                className="mt-1"
              />
            </div>
            <p className="text-sm text-muted-foreground">
              This PIN will be required for non-admin users to access this page.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowChangePinDialog(false); setNewPin(''); }}>
              Cancel
            </Button>
            <Button
              onClick={() => updatePinMutation.mutate(newPin)}
              disabled={newPin.length < 4 || updatePinMutation.isPending}
            >
              {updatePinMutation.isPending ? 'Saving...' : 'Save PIN'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Main content - only show when admin or PIN verified */}
      {(isAdmin || isPinVerified) && (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Database className="h-6 w-6" />
            Manpower Database
          </h1>
          <p className="text-muted-foreground">Manage employee information and records</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={() => setShowChangePinDialog(true)}>
              <Lock className="h-4 w-4 mr-2" />
              Change PIN
            </Button>
          )}
          {isColumnAdmin && (
            <ColumnSettings 
              columns={columns} 
              onColumnChange={setColumns} 
              defaultColumns={defaultManpowerColumns}
              excludeFromWidthControl={['photo', 'actions']}
            />
          )}
          {canAdd && (
            <Button onClick={() => { resetForm(); setIsModalOpen(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              Add Employee
            </Button>
          )}
          <Button variant="outline" onClick={handleExportExcel} title={branchFilter !== 'all' ? `Export ${branchFilter} only` : 'Export all employees'}>
            <Download className="h-4 w-4 mr-2" />
            Excel {branchFilter !== 'all' && <Badge variant="secondary" className="ml-1 text-xs">{branchFilter}</Badge>}
          </Button>
          <Button variant="outline" onClick={handleExportPDF} title={branchFilter !== 'all' ? `Export ${branchFilter} only` : 'Export all employees'}>
            <FileText className="h-4 w-4 mr-2" />
            PDF {branchFilter !== 'all' && <Badge variant="secondary" className="ml-1 text-xs">{branchFilter}</Badge>}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{filteredEmployees.length}</p>
                <p className="text-sm text-muted-foreground">Total Employees</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <Users className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {filteredEmployees.filter(e => e.employment_status.toLowerCase() === 'regular').length}
                </p>
                <p className="text-sm text-muted-foreground">Regular</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-yellow-500/10">
                <Users className="h-5 w-5 text-yellow-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {filteredEmployees.filter(e => e.employment_status.toLowerCase() === 'probationary').length}
                </p>
                <p className="text-sm text-muted-foreground">Probationary</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Users className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {filteredEmployees.filter(e => e.employment_status.toLowerCase() === 'contractual').length}
                </p>
                <p className="text-sm text-muted-foreground">Contractual</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full max-w-4xl grid-cols-5">
          <TabsTrigger value="manpower" className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            Manpower Database
          </TabsTrigger>
          <TabsTrigger value="manpower-summary" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Manpower Summary
          </TabsTrigger>
          <TabsTrigger value="attendance-summary" className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            Attendance Summary
          </TabsTrigger>
          <TabsTrigger value="office-attendance" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Office Attendance
          </TabsTrigger>
          <TabsTrigger value="recently-deleted" className="flex items-center gap-2">
            <Trash2 className="h-4 w-4" />
            Recently Deleted ({deletedEmployees.length})
          </TabsTrigger>
        </TabsList>

        {/* Manpower Database Tab */}
        <TabsContent value="manpower" className="space-y-6">
          {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-[400px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by Emp ID, Name, Branch, Position..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={branchFilter} onValueChange={setBranchFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Branch" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Branches</SelectItem>
                {uniqueBranches.map(branch => (
                  <SelectItem key={branch} value={branch}>{branch}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={positionFilter} onValueChange={setPositionFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Position" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Positions</SelectItem>
                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50">Office Positions</div>
                {officePositions.map(pos => (
                  <SelectItem key={pos} value={pos}>{pos}</SelectItem>
                ))}
                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50 mt-1">Store Positions</div>
                {storePositions.map(pos => (
                  <SelectItem key={pos} value={pos}>{pos}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categoryOptions.map(cat => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                {statusOptions.map(status => (
                  <SelectItem key={status} value={status.toLowerCase()}>{status}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={genderFilter} onValueChange={setGenderFilter}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="Gender" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Gender</SelectItem>
                {genderOptions.map(gender => (
                  <SelectItem key={gender} value={gender}>{gender}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={maternityFilter} onValueChange={setMaternityFilter}>
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="Maternity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Maternity</SelectItem>
                {maternityOptions.map(mat => (
                  <SelectItem key={mat} value={mat}>{mat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <ScrollArea className="h-[500px]">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  {columns.find(c => c.key === 'branch')?.visible && (
                    <TableHead 
                      style={{ width: columns.find(c => c.key === 'branch')?.width }} 
                      className="cursor-pointer hover:bg-muted/80 select-none"
                      onClick={() => handleSort('branch')}
                    >
                      <div className="flex items-center">Branch<SortIcon column="branch" /></div>
                    </TableHead>
                  )}
                  {columns.find(c => c.key === 'photo')?.visible && <TableHead className="w-[50px]">Photo</TableHead>}
                  {columns.find(c => c.key === 'name')?.visible && (
                    <TableHead 
                      style={{ width: columns.find(c => c.key === 'name')?.width }} 
                      className="cursor-pointer hover:bg-muted/80 select-none"
                      onClick={() => handleSort('name')}
                    >
                      <div className="flex items-center">Employee Name<SortIcon column="name" /></div>
                    </TableHead>
                  )}
                  {columns.find(c => c.key === 'gender')?.visible && (
                    <TableHead 
                      style={{ width: columns.find(c => c.key === 'gender')?.width }} 
                      className="cursor-pointer hover:bg-muted/80 select-none"
                      onClick={() => handleSort('gender')}
                    >
                      <div className="flex items-center">Gender<SortIcon column="gender" /></div>
                    </TableHead>
                  )}
                  {columns.find(c => c.key === 'age')?.visible && (
                    <TableHead 
                      style={{ width: columns.find(c => c.key === 'age')?.width }} 
                      className="cursor-pointer hover:bg-muted/80 select-none"
                      onClick={() => handleSort('age')}
                    >
                      <div className="flex items-center">Age<SortIcon column="age" /></div>
                    </TableHead>
                  )}
                  {columns.find(c => c.key === 'position')?.visible && (
                    <TableHead 
                      style={{ width: columns.find(c => c.key === 'position')?.width }} 
                      className="cursor-pointer hover:bg-muted/80 select-none"
                      onClick={() => handleSort('position')}
                    >
                      <div className="flex items-center">Position<SortIcon column="position" /></div>
                    </TableHead>
                  )}
                  {columns.find(c => c.key === 'category')?.visible && (
                    <TableHead 
                      style={{ width: columns.find(c => c.key === 'category')?.width }} 
                      className="cursor-pointer hover:bg-muted/80 select-none"
                      onClick={() => handleSort('category')}
                    >
                      <div className="flex items-center">Category<SortIcon column="category" /></div>
                    </TableHead>
                  )}
                  {columns.find(c => c.key === 'status')?.visible && (
                    <TableHead 
                      style={{ width: columns.find(c => c.key === 'status')?.width }} 
                      className="cursor-pointer hover:bg-muted/80 select-none"
                      onClick={() => handleSort('status')}
                    >
                      <div className="flex items-center">Status<SortIcon column="status" /></div>
                    </TableHead>
                  )}
                  {columns.find(c => c.key === 'date_hired')?.visible && (
                    <TableHead 
                      style={{ width: columns.find(c => c.key === 'date_hired')?.width }} 
                      className="cursor-pointer hover:bg-muted/80 select-none"
                      onClick={() => handleSort('date_hired')}
                    >
                      <div className="flex items-center">Date Hired<SortIcon column="date_hired" /></div>
                    </TableHead>
                  )}
                  {columns.find(c => c.key === 'service')?.visible && <TableHead style={{ width: columns.find(c => c.key === 'service')?.width }}>Length of Service</TableHead>}
                  {columns.find(c => c.key === 'contact')?.visible && <TableHead style={{ width: columns.find(c => c.key === 'contact')?.width }}>Contact No.</TableHead>}
                  {columns.find(c => c.key === 'address')?.visible && <TableHead style={{ width: columns.find(c => c.key === 'address')?.width }}>Address</TableHead>}
                  {columns.find(c => c.key === 'remarks')?.visible && <TableHead style={{ width: columns.find(c => c.key === 'remarks')?.width }}>Remarks</TableHead>}
                  {columns.find(c => c.key === 'actions')?.visible && <TableHead className="w-[120px]">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={columns.filter(c => c.visible).length} className="text-center py-8">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : filteredEmployees.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={columns.filter(c => c.visible).length} className="text-center py-8 text-muted-foreground">
                      No employees found
                    </TableCell>
                  </TableRow>
                ) : (
                  (() => {
                    // Group employees by branch for visual separation
                    const groupedByBranch: Record<string, typeof filteredEmployees> = {};
                    filteredEmployees.forEach(emp => {
                      const branchName = emp.branch || emp.branches?.name || 'Unknown';
                      if (!groupedByBranch[branchName]) {
                        groupedByBranch[branchName] = [];
                      }
                      groupedByBranch[branchName].push(emp);
                    });
                    
                    const branchNames = Object.keys(groupedByBranch).sort();
                    
                    return branchNames.map((branchName, branchIndex) => (
                      <React.Fragment key={branchName}>
                        {/* Branch separator row */}
                        {branchIndex > 0 && (
                          <TableRow className="bg-muted/30 border-t-2 border-primary/20">
                            <TableCell 
                              colSpan={columns.filter(c => c.visible).length} 
                              className="py-2"
                            >
                              <div className="w-full border-t border-dashed border-muted-foreground/30" />
                            </TableCell>
                          </TableRow>
                        )}
                        {/* Branch header row */}
                        <TableRow className="bg-primary/5 border-l-4 border-l-primary">
                          <TableCell 
                            colSpan={columns.filter(c => c.visible).length} 
                            className="py-2 font-bold text-primary"
                          >
                            {branchName.toUpperCase()} ({groupedByBranch[branchName].length} employees)
                          </TableCell>
                        </TableRow>
                        {/* Employees in this branch */}
                        {groupedByBranch[branchName].map((emp) => (
                          <TableRow key={emp.id} className="hover:bg-muted/30">
                            {columns.find(c => c.key === 'branch')?.visible && (
                              <TableCell>{emp.branch || emp.branches?.name || '-'}</TableCell>
                            )}
                            {columns.find(c => c.key === 'photo')?.visible && (
                              <TableCell>
                                <Avatar 
                                  className={cn("h-8 w-8", emp.photo_url && "cursor-pointer hover:ring-2 hover:ring-primary transition-all")}
                                  onClick={() => emp.photo_url && setViewingPhoto({ url: emp.photo_url, name: emp.full_name })}
                                >
                                  <AvatarImage src={emp.photo_url || ''} />
                                  <AvatarFallback className="text-xs">
                                    {emp.full_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                  </AvatarFallback>
                                </Avatar>
                              </TableCell>
                            )}
                            {columns.find(c => c.key === 'name')?.visible && (
                              <TableCell className="font-medium">{emp.full_name}</TableCell>
                            )}
                            {columns.find(c => c.key === 'gender')?.visible && (
                              <TableCell>{emp.gender || '-'}</TableCell>
                            )}
                            {columns.find(c => c.key === 'age')?.visible && (
                              <TableCell>{emp.age || '-'}</TableCell>
                            )}
                            {columns.find(c => c.key === 'position')?.visible && (
                              <TableCell>{emp.position || '-'}</TableCell>
                            )}
                            {columns.find(c => c.key === 'category')?.visible && (
                              <TableCell>{emp.category || '-'}</TableCell>
                            )}
                            {columns.find(c => c.key === 'status')?.visible && (
                              <TableCell>
                                <Badge variant="outline" className={cn(
                                  emp.employment_status.toLowerCase() === 'regular' && 'bg-green-500/10 text-green-700 border-green-500/30',
                                  emp.employment_status.toLowerCase() === 'probationary' && 'bg-yellow-500/10 text-yellow-700 border-yellow-500/30',
                                  emp.employment_status.toLowerCase() === 'contractual' && 'bg-blue-500/10 text-blue-700 border-blue-500/30',
                                  emp.employment_status.toLowerCase() === 'resigned' && 'bg-red-500/10 text-red-700 border-red-500/30'
                                )}>
                                  {emp.employment_status}
                                </Badge>
                              </TableCell>
                            )}
                            {columns.find(c => c.key === 'date_hired')?.visible && (
                              <TableCell>{format(new Date(emp.date_hired), 'MMM dd, yyyy')}</TableCell>
                            )}
                            {columns.find(c => c.key === 'service')?.visible && (
                              <TableCell>{getLengthOfService(emp.date_hired)}</TableCell>
                            )}
                            {columns.find(c => c.key === 'contact')?.visible && (
                              <TableCell>{emp.cell_no || '-'}</TableCell>
                            )}
                            {columns.find(c => c.key === 'address')?.visible && (
                              <TableCell className="max-w-[150px] truncate" title={emp.address || ''}>{emp.address || '-'}</TableCell>
                            )}
                            {columns.find(c => c.key === 'remarks')?.visible && (
                              <TableCell className="max-w-[150px] truncate" title={emp.remarks || ''}>{emp.remarks || '-'}</TableCell>
                            )}
                            {columns.find(c => c.key === 'actions')?.visible && (
                              <TableCell>
                                <div className="flex items-center gap-1">
                                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewingEmployee(emp)} title="View Details">
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                  {canEdit && (
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(emp)} title="Edit">
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                  )}
                                  {canDelete && (
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(emp.id)} title="Delete">
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </React.Fragment>
                    ));
                  })()
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
        </Card>
        </TabsContent>

        {/* Manpower Summary Tab */}
        <TabsContent value="manpower-summary" className="space-y-6">
          {/* Filters and Export */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  <Select value={summaryCategory} onValueChange={setSummaryCategory}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {categoryOptions.map(cat => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={summaryPosition} onValueChange={setSummaryPosition}>
                    <SelectTrigger className="w-[150px]">
                      <SelectValue placeholder="Position" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Positions</SelectItem>
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50">Office Positions</div>
                      {officePositions.map(pos => (
                        <SelectItem key={pos} value={pos}>{pos}</SelectItem>
                      ))}
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50 mt-1">Store Positions</div>
                      {storePositions.map(pos => (
                        <SelectItem key={pos} value={pos}>{pos}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={summaryMaternity} onValueChange={setSummaryMaternity}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue placeholder="Maternity" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Maternity</SelectItem>
                      {maternityOptions.map(mat => (
                        <SelectItem key={mat} value={mat}>{mat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={summarySortOrder} onValueChange={(val: 'newest' | 'oldest') => setSummarySortOrder(val)}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Sort by Date Hired" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="newest">Date Hired (Newest)</SelectItem>
                      <SelectItem value="oldest">Date Hired (Oldest)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={exportManpowerSummaryExcel} className="gap-2">
                    <Download className="h-4 w-4" />
                    Excel
                  </Button>
                  <Button variant="outline" size="sm" onClick={exportManpowerSummaryPDF} className="gap-2">
                    <FileText className="h-4 w-4" />
                    PDF
                  </Button>
                  <Button variant="outline" size="sm" onClick={printManpowerSummary} className="gap-2">
                    <Printer className="h-4 w-4" />
                    Print
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{manpowerSummaryData.totalFiltered}</p>
                    <p className="text-sm text-muted-foreground">Total Filtered</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-500/10">
                    <Building2 className="h-5 w-5 text-green-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{manpowerSummaryData.branchSummary.length}</p>
                    <p className="text-sm text-muted-foreground">Branches</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-500/10">
                    <Users className="h-5 w-5 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">
                      {manpowerSummaryData.branchSummary.reduce((sum, b) => sum + b.regularCount, 0)}
                    </p>
                    <p className="text-sm text-muted-foreground">Regular</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-yellow-500/10">
                    <Users className="h-5 w-5 text-yellow-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">
                      {manpowerSummaryData.branchSummary.reduce((sum, b) => sum + b.probationaryCount, 0)}
                    </p>
                    <p className="text-sm text-muted-foreground">Probationary</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Branch Summary Table */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Manpower per Store/Branch
              </CardTitle>
            </CardHeader>
            <CardContent>
              {manpowerSummaryData.branchSummary.length > 0 ? (
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="w-[50px]">#</TableHead>
                        <TableHead>Branch</TableHead>
                        <TableHead className="text-center">Total</TableHead>
                        <TableHead className="text-center">Regular</TableHead>
                        <TableHead className="text-center">Probationary</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {manpowerSummaryData.branchSummary.map((b, idx) => (
                        <TableRow key={b.branch}>
                          <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                          <TableCell className="font-medium">{b.branch}</TableCell>
                          <TableCell className="text-center font-bold">{b.count}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                              {b.regularCount}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
                              {b.probationaryCount}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/50 font-bold">
                        <TableCell></TableCell>
                        <TableCell>TOTAL</TableCell>
                        <TableCell className="text-center">{manpowerSummaryData.totalFiltered}</TableCell>
                        <TableCell className="text-center">
                          {manpowerSummaryData.branchSummary.reduce((sum, b) => sum + b.regularCount, 0)}
                        </TableCell>
                        <TableCell className="text-center">
                          {manpowerSummaryData.branchSummary.reduce((sum, b) => sum + b.probationaryCount, 0)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Building2 className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <h3 className="text-lg font-medium">No data found</h3>
                  <p className="text-muted-foreground">Try adjusting the filters</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Employee List by Branch */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Employee List ({manpowerSummaryData.totalFiltered})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-[50px]">#</TableHead>
                      <TableHead>Branch</TableHead>
                      <TableHead>Employee Name</TableHead>
                      <TableHead>Position</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date Hired</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {manpowerSummaryData.allFilteredEmployees.map((emp, idx) => (
                      <TableRow key={emp.id}>
                        <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell className="font-medium">{emp.branch || '-'}</TableCell>
                        <TableCell>{emp.full_name}</TableCell>
                        <TableCell>{emp.position || '-'}</TableCell>
                        <TableCell>{emp.category || '-'}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn(
                            emp.employment_status.toLowerCase() === 'regular' && 'bg-green-500/10 text-green-700 border-green-500/30',
                            emp.employment_status.toLowerCase() === 'probationary' && 'bg-yellow-500/10 text-yellow-700 border-yellow-500/30',
                          )}>
                            {emp.employment_status}
                          </Badge>
                        </TableCell>
                        <TableCell>{format(new Date(emp.date_hired), 'MMM dd, yyyy')}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Attendance Summary Tab */}
        <TabsContent value="attendance-summary" className="space-y-6">
          {/* Date Filters and Clear Button */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              {/* Month/Year Filter */}
              <div className="flex items-center gap-2 bg-card border rounded-lg p-2 w-fit">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <Select value={attendanceMonth} onValueChange={(val) => { setAttendanceMonth(val); setAttendanceDate(''); }}>
                  <SelectTrigger className="w-[130px] border-0 shadow-none focus:ring-0 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover z-50">
                    {MONTHS.map((month, index) => (
                      <SelectItem key={index} value={index.toString()}>{month}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={attendanceYear} onValueChange={(val) => { setAttendanceYear(val); setAttendanceDate(''); }}>
                  <SelectTrigger className="w-[90px] border-0 shadow-none focus:ring-0 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover z-50">
                    {[currentYear - 2, currentYear - 1, currentYear, currentYear + 1].map(year => (
                      <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Specific Date Picker */}
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={attendanceDate}
                  onChange={(e) => setAttendanceDate(e.target.value)}
                  className="w-[160px] h-9"
                  placeholder="Pick a date"
                />
                {attendanceDate && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setAttendanceDate('')}
                    className="h-8 px-2"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {/* Position Category Filter */}
              <Select value={positionCategoryFilter} onValueChange={setPositionCategoryFilter}>
                <SelectTrigger className="w-[150px] h-9">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="store">Store</SelectItem>
                  <SelectItem value="office">Office</SelectItem>
                  <SelectItem value="teamleader">Team Leader</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {isAdmin && attendanceSummary.totalRecords > 0 && (
              <Button 
                variant="destructive" 
                onClick={handleClearAttendance}
                disabled={clearAttendanceMutation.isPending}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {clearAttendanceMutation.isPending ? 'Clearing...' : `Clear All (${attendanceSummary.totalRecords})`}
              </Button>
            )}
          </div>

          {/* Overview Cards */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Records</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{attendanceSummary.totalRecords}</div>
                <p className="text-xs text-muted-foreground">
                  {attendanceDate ? `Records for ${format(new Date(attendanceDate), 'MMM dd, yyyy')}` : 'Attendance records this month'}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Active Employees</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{attendanceSummary.totalEmployees}</div>
                <p className="text-xs text-muted-foreground">In manpower database</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Resume to Work</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{attendanceSummary.resumeCount}</div>
                <p className="text-xs text-muted-foreground">Returned from absence</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Unique Statuses</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{attendanceSummary.statusData.length}</div>
                <p className="text-xs text-muted-foreground">Different status types</p>
              </CardContent>
            </Card>
          </div>

          {/* Charts */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Attendance Status Distribution - {attendanceDate ? format(new Date(attendanceDate), 'MMM dd, yyyy') : `${MONTHS[parseInt(attendanceMonth)]} ${attendanceYear}`}</CardTitle>
              </CardHeader>
              <CardContent>
                {attendanceSummary.statusData.length > 0 ? (
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={attendanceSummary.statusData.slice(0, 8)}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                          outerRadius={100}
                          fill="#8884d8"
                          dataKey="count"
                          nameKey="status"
                        >
                          {attendanceSummary.statusData.slice(0, 8).map((_, index) => (
                            <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <ClipboardList className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <p className="text-muted-foreground">No attendance records for this period</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Status Count Summary</CardTitle>
              </CardHeader>
              <CardContent>
                {attendanceSummary.statusData.length > 0 ? (
                  <div className="space-y-3 max-h-[300px] overflow-y-auto">
                    {attendanceSummary.statusData.map((item, index) => (
                      <div key={item.status} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                          />
                          <span className="font-medium capitalize">{item.status.replace(/_/g, ' ')}</span>
                        </div>
                        <Badge variant="secondary">{item.count}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <p className="text-muted-foreground">No data available</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Branch Breakdown Table */}
          <Card>
            <CardHeader>
              <CardTitle>Attendance by Branch - {attendanceDate ? format(new Date(attendanceDate), 'MMM dd, yyyy') : `${MONTHS[parseInt(attendanceMonth)]} ${attendanceYear}`}</CardTitle>
            </CardHeader>
            <CardContent>
              {attendanceSummary.branchData.length > 0 ? (
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[50px] text-center">#</TableHead>
                        <TableHead>Branch</TableHead>
                        <TableHead className="text-center">Total Records</TableHead>
                        <TableHead className="text-center">Present</TableHead>
                        <TableHead className="text-center">Absent</TableHead>
                        <TableHead className="text-center">Late</TableHead>
                        <TableHead className="text-center">Day Off</TableHead>
                        <TableHead className="text-center">Others</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {attendanceSummary.branchData.map((branch, index) => {
                        const present = branch.statuses['present'] || 0;
                        const absent = branch.statuses['absent'] || 0;
                        const late = branch.statuses['late'] || 0;
                        const dayOff = branch.statuses['day_off'] || 0;
                        const others = branch.total - present - absent - late - dayOff;
                        
                        return (
                          <TableRow key={branch.branch}>
                            <TableCell className="text-center text-muted-foreground">{index + 1}</TableCell>
                            <TableCell className="font-medium">{branch.branch}</TableCell>
                            <TableCell className="text-center font-bold">{branch.total}</TableCell>
                            <TableCell className="text-center">
                              {present > 0 ? (
                                <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                                  {present}
                                </Badge>
                              ) : '-'}
                            </TableCell>
                            <TableCell className="text-center">
                              {absent > 0 ? (
                                <Badge variant="outline" className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                                  {absent}
                                </Badge>
                              ) : '-'}
                            </TableCell>
                            <TableCell className="text-center">
                              {late > 0 ? (
                                <Badge variant="outline" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
                                  {late}
                                </Badge>
                              ) : '-'}
                            </TableCell>
                            <TableCell className="text-center">
                              {dayOff > 0 ? (
                                <Badge variant="outline" className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                                  {dayOff}
                                </Badge>
                              ) : '-'}
                            </TableCell>
                            <TableCell className="text-center">
                              {others > 0 ? (
                                <Badge variant="secondary">{others}</Badge>
                              ) : '-'}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {/* Totals Row */}
                      <TableRow className="bg-muted/50 font-bold">
                        <TableCell></TableCell>
                        <TableCell>TOTAL</TableCell>
                        <TableCell className="text-center">{attendanceSummary.totalRecords}</TableCell>
                        <TableCell className="text-center">
                          {attendanceSummary.branchData.reduce((sum, b) => sum + (b.statuses['present'] || 0), 0)}
                        </TableCell>
                        <TableCell className="text-center">
                          {attendanceSummary.branchData.reduce((sum, b) => sum + (b.statuses['absent'] || 0), 0)}
                        </TableCell>
                        <TableCell className="text-center">
                          {attendanceSummary.branchData.reduce((sum, b) => sum + (b.statuses['late'] || 0), 0)}
                        </TableCell>
                        <TableCell className="text-center">
                          {attendanceSummary.branchData.reduce((sum, b) => sum + (b.statuses['day_off'] || 0), 0)}
                        </TableCell>
                        <TableCell className="text-center">
                          {attendanceSummary.branchData.reduce((sum, b) => {
                            const present = b.statuses['present'] || 0;
                            const absent = b.statuses['absent'] || 0;
                            const late = b.statuses['late'] || 0;
                            const dayOff = b.statuses['day_off'] || 0;
                            return sum + (b.total - present - absent - late - dayOff);
                          }, 0)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Users className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <h3 className="text-lg font-medium">No attendance records found</h3>
                  <p className="text-muted-foreground">No attendance data for {attendanceDate ? format(new Date(attendanceDate), 'MMM dd, yyyy') : `${MONTHS[parseInt(attendanceMonth)]} ${attendanceYear}`}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Employee Details by Status */}
          {attendanceRecords.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ClipboardList className="h-5 w-5" />
                  Employee Details by Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {/* Absent Employees */}
                  {(attendanceSummary.employeesByStatus['absent'] || []).length > 0 && (
                    <Card className="border-destructive/50">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Badge variant="destructive" className="text-xs">Absent</Badge>
                          <span className="text-muted-foreground">
                            ({attendanceSummary.employeesByStatus['absent'].length})
                          </span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ScrollArea className="h-[200px]">
                          <div className="space-y-2">
                            {attendanceSummary.employeesByStatus['absent'].map((emp, idx) => (
                              <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 hover:bg-muted">
                                <Avatar className="h-6 w-6">
                                  <AvatarImage src={emp.photo_url || ''} />
                                  <AvatarFallback className="text-[10px]">
                                    {emp.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium truncate">{emp.name}</p>
                                  <p className="text-[10px] text-muted-foreground truncate">{emp.branch}</p>
                                </div>
                                <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                  {format(new Date(emp.date), 'MMM dd')}
                                </span>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      </CardContent>
                    </Card>
                  )}

                  {/* Late Employees */}
                  {(attendanceSummary.employeesByStatus['late'] || []).length > 0 && (
                    <Card className="border-amber-500/50">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Badge className="text-xs bg-amber-500 hover:bg-amber-600">Late</Badge>
                          <span className="text-muted-foreground">
                            ({attendanceSummary.employeesByStatus['late'].length})
                          </span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ScrollArea className="h-[200px]">
                          <div className="space-y-2">
                            {attendanceSummary.employeesByStatus['late'].map((emp, idx) => (
                              <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 hover:bg-muted">
                                <Avatar className="h-6 w-6">
                                  <AvatarImage src={emp.photo_url || ''} />
                                  <AvatarFallback className="text-[10px]">
                                    {emp.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium truncate">{emp.name}</p>
                                  <p className="text-[10px] text-muted-foreground truncate">{emp.branch}</p>
                                </div>
                                <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                  {format(new Date(emp.date), 'MMM dd')}
                                </span>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      </CardContent>
                    </Card>
                  )}

                  {/* Day Off Employees */}
                  {(attendanceSummary.employeesByStatus['day_off'] || []).length > 0 && (
                    <Card className="border-blue-500/50">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Badge className="text-xs bg-blue-500 hover:bg-blue-600">Day Off</Badge>
                          <span className="text-muted-foreground">
                            ({attendanceSummary.employeesByStatus['day_off'].length})
                          </span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ScrollArea className="h-[200px]">
                          <div className="space-y-2">
                            {attendanceSummary.employeesByStatus['day_off'].map((emp, idx) => (
                              <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 hover:bg-muted">
                                <Avatar className="h-6 w-6">
                                  <AvatarImage src={emp.photo_url || ''} />
                                  <AvatarFallback className="text-[10px]">
                                    {emp.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium truncate">{emp.name}</p>
                                  <p className="text-[10px] text-muted-foreground truncate">{emp.branch}</p>
                                </div>
                                <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                  {format(new Date(emp.date), 'MMM dd')}
                                </span>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      </CardContent>
                    </Card>
                  )}

                  {/* Present Employees */}
                  {(attendanceSummary.employeesByStatus['present'] || []).length > 0 && (
                    <Card className="border-green-500/50">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Badge className="text-xs bg-green-500 hover:bg-green-600">Present</Badge>
                          <span className="text-muted-foreground">
                            ({attendanceSummary.employeesByStatus['present'].length})
                          </span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ScrollArea className="h-[200px]">
                          <div className="space-y-2">
                            {attendanceSummary.employeesByStatus['present'].map((emp, idx) => (
                              <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 hover:bg-muted">
                                <Avatar className="h-6 w-6">
                                  <AvatarImage src={emp.photo_url || ''} />
                                  <AvatarFallback className="text-[10px]">
                                    {emp.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium truncate">{emp.name}</p>
                                  <p className="text-[10px] text-muted-foreground truncate">{emp.branch}</p>
                                </div>
                                <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                  {format(new Date(emp.date), 'MMM dd')}
                                </span>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      </CardContent>
                    </Card>
                  )}

                  {/* Other Statuses */}
                  {Object.entries(attendanceSummary.employeesByStatus)
                    .filter(([status]) => !['present', 'absent', 'late', 'day_off'].includes(status))
                    .map(([status, employees]) => (
                      employees.length > 0 && (
                        <Card key={status} className="border-secondary/50">
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm flex items-center gap-2">
                              <Badge variant="secondary" className="text-xs capitalize">{status.replace('_', ' ')}</Badge>
                              <span className="text-muted-foreground">
                                ({employees.length})
                              </span>
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <ScrollArea className="h-[200px]">
                              <div className="space-y-2">
                                {employees.map((emp, idx) => (
                                  <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 hover:bg-muted">
                                    <Avatar className="h-6 w-6">
                                      <AvatarImage src={emp.photo_url || ''} />
                                      <AvatarFallback className="text-[10px]">
                                        {emp.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                                      </AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs font-medium truncate">{emp.name}</p>
                                      <p className="text-[10px] text-muted-foreground truncate">{emp.branch}</p>
                                    </div>
                                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                      {format(new Date(emp.date), 'MMM dd')}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </ScrollArea>
                          </CardContent>
                        </Card>
                      )
                    ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Office Attendance Tab */}
        <TabsContent value="office-attendance" className="space-y-6">
          {/* Date Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-card border rounded-lg p-2 w-fit">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <Select value={attendanceMonth} onValueChange={(val) => { setAttendanceMonth(val); setAttendanceDate(''); }}>
                <SelectTrigger className="w-[130px] border-0 shadow-none focus:ring-0 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  {MONTHS.map((month, index) => (
                    <SelectItem key={index} value={index.toString()}>{month}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={attendanceYear} onValueChange={(val) => { setAttendanceYear(val); setAttendanceDate(''); }}>
                <SelectTrigger className="w-[90px] border-0 shadow-none focus:ring-0 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  {[currentYear - 2, currentYear - 1, currentYear, currentYear + 1].map(year => (
                    <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Specific Date Picker */}
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={attendanceDate}
                onChange={(e) => setAttendanceDate(e.target.value)}
                className="w-[160px] h-9"
                placeholder="Pick a date"
              />
              {attendanceDate && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setAttendanceDate('')}
                  className="h-8 px-2"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 py-1.5 px-3">
              <Building2 className="h-3.5 w-3.5 mr-1.5" />
              Office Only
            </Badge>

            {/* Add Attendance Button */}
            {canAdd && (
              <Dialog open={isOfficeAttendanceModalOpen} onOpenChange={setIsOfficeAttendanceModalOpen}>
                <Button 
                  size="sm" 
                  className="gap-2"
                  onClick={() => setIsOfficeAttendanceModalOpen(true)}
                >
                  <Plus className="h-4 w-4" />
                  Add Attendance
                </Button>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Add Office Attendance</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    {/* Employee Select */}
                    <div className="space-y-2">
                      <Label>Employee *</Label>
                      <Select 
                        value={officeAttendanceForm.employee_id} 
                        onValueChange={(val) => setOfficeAttendanceForm(prev => ({ ...prev, employee_id: val }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select office employee" />
                        </SelectTrigger>
                        <SelectContent className="bg-popover z-50 max-h-60">
                          {officeEmployees.map((emp) => (
                            <SelectItem key={emp.id} value={emp.id}>
                              {emp.full_name} - {emp.position}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Date */}
                    <div className="space-y-2">
                      <Label>Date *</Label>
                      <Input
                        type="date"
                        value={officeAttendanceForm.attendance_date}
                        onChange={(e) => setOfficeAttendanceForm(prev => ({ ...prev, attendance_date: e.target.value }))}
                      />
                    </div>

                    {/* Status */}
                    <div className="space-y-2">
                      <Label>Status *</Label>
                      <Select 
                        value={officeAttendanceForm.status} 
                        onValueChange={(val) => setOfficeAttendanceForm(prev => ({ ...prev, status: val }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-popover z-50">
                          <SelectItem value="present">Present</SelectItem>
                          <SelectItem value="absent">Absent</SelectItem>
                          <SelectItem value="late">Late</SelectItem>
                          <SelectItem value="day_off">Day Off</SelectItem>
                          <SelectItem value="half_day">Half day</SelectItem>
                          <SelectItem value="undertime">Undertime</SelectItem>
                          <SelectItem value="suspension">Suspension</SelectItem>
                          <SelectItem value="unauthorized_absent">Unauthorized absent</SelectItem>
                          <SelectItem value="sil">SIL</SelectItem>
                          <SelectItem value="vl">VL</SelectItem>
                          <SelectItem value="change_day_off">Change Day off</SelectItem>
                          <SelectItem value="change_schedule">Change of Schedule</SelectItem>
                          <SelectItem value="cancel_day_off">Cancel Day off</SelectItem>
                          <SelectItem value="other">Other Concern</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Day Off */}
                    <div className="space-y-2">
                      <Label>Day Off</Label>
                      <Select 
                        value={officeAttendanceForm.day_off} 
                        onValueChange={(val) => setOfficeAttendanceForm(prev => ({ ...prev, day_off: val }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select day off" />
                        </SelectTrigger>
                        <SelectContent className="bg-popover z-50">
                          <SelectItem value="Monday">Monday</SelectItem>
                          <SelectItem value="Tuesday">Tuesday</SelectItem>
                          <SelectItem value="Wednesday">Wednesday</SelectItem>
                          <SelectItem value="Thursday">Thursday</SelectItem>
                          <SelectItem value="Friday">Friday</SelectItem>
                          <SelectItem value="Saturday">Saturday</SelectItem>
                          <SelectItem value="Sunday">Sunday</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Shift */}
                    <div className="space-y-2">
                      <Label>Shift</Label>
                      <Select 
                        value={officeAttendanceForm.shift} 
                        onValueChange={(val) => setOfficeAttendanceForm(prev => ({ ...prev, shift: val }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select shift" />
                        </SelectTrigger>
                        <SelectContent className="bg-popover z-50">
                          <SelectItem value="Opening">Opening</SelectItem>
                          <SelectItem value="Midshift">Midshift</SelectItem>
                          <SelectItem value="Closing">Closing</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Remarks */}
                    <div className="space-y-2">
                      <Label>Remarks</Label>
                      <Textarea
                        placeholder="Optional remarks..."
                        value={officeAttendanceForm.remarks}
                        onChange={(e) => setOfficeAttendanceForm(prev => ({ ...prev, remarks: e.target.value }))}
                        rows={2}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button 
                      variant="outline" 
                      onClick={() => setIsOfficeAttendanceModalOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={() => createOfficeAttendanceMutation.mutate(officeAttendanceForm)}
                      disabled={!officeAttendanceForm.employee_id || !officeAttendanceForm.attendance_date || createOfficeAttendanceMutation.isPending}
                    >
                      {createOfficeAttendanceMutation.isPending ? 'Adding...' : 'Add Attendance'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>

          {/* Overview Cards */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Records</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{officeAttendanceSummary.totalRecords}</div>
                <p className="text-xs text-muted-foreground">
                  {attendanceDate ? `Office records for ${format(new Date(attendanceDate), 'MMM dd, yyyy')}` : 'Office attendance this month'}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Office Employees</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{officeAttendanceSummary.totalEmployees}</div>
                <p className="text-xs text-muted-foreground">Active office staff</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Resume to Work</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{officeAttendanceSummary.resumeCount}</div>
                <p className="text-xs text-muted-foreground">Office returned from absence</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Unique Statuses</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{officeAttendanceSummary.statusData.length}</div>
                <p className="text-xs text-muted-foreground">Different status types</p>
              </CardContent>
            </Card>
          </div>

          {/* Charts */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Office Attendance Status - {attendanceDate ? format(new Date(attendanceDate), 'MMM dd, yyyy') : `${MONTHS[parseInt(attendanceMonth)]} ${attendanceYear}`}</CardTitle>
              </CardHeader>
              <CardContent>
                {officeAttendanceSummary.statusData.length > 0 ? (
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={officeAttendanceSummary.statusData.slice(0, 8)}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                          outerRadius={100}
                          fill="#8884d8"
                          dataKey="count"
                          nameKey="status"
                        >
                          {officeAttendanceSummary.statusData.slice(0, 8).map((_, index) => (
                            <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Building2 className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <p className="text-muted-foreground">No office attendance records for this period</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Office Status Count Summary</CardTitle>
              </CardHeader>
              <CardContent>
                {officeAttendanceSummary.statusData.length > 0 ? (
                  <div className="space-y-3 max-h-[300px] overflow-y-auto">
                    {officeAttendanceSummary.statusData.map((item, index) => (
                      <div key={item.status} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                          />
                          <span className="font-medium capitalize">{item.status.replace(/_/g, ' ')}</span>
                        </div>
                        <Badge variant="secondary">{item.count}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <p className="text-muted-foreground">No data available</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Office Attendance Records Table */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5" />
                Office Attendance Records
              </CardTitle>
            </CardHeader>
            <CardContent>
              {officeAttendanceRecordsList.length > 0 ? (
                <ScrollArea className="h-[500px]">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead>Branch</TableHead>
                        <TableHead className="w-[50px]">Photo</TableHead>
                        <TableHead>Employee Name</TableHead>
                        <TableHead>Date Hired</TableHead>
                        <TableHead>Emp. Status</TableHead>
                        <TableHead>Att. Status</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Day Off</TableHead>
                        <TableHead>Shift</TableHead>
                        <TableHead>Remarks</TableHead>
                        <TableHead className="text-center">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {officeAttendanceRecordsList.map((record: any) => {
                        const emp = record.employees;
                        return (
                          <TableRow key={record.id}>
                            <TableCell className="font-medium">{emp?.branch || '-'}</TableCell>
                            <TableCell>
                              <Avatar className="h-8 w-8">
                                <AvatarImage src={emp?.photo_url || ''} />
                                <AvatarFallback className="text-xs">
                                  {emp?.full_name?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || '?'}
                                </AvatarFallback>
                              </Avatar>
                            </TableCell>
                            <TableCell>{emp?.full_name || '-'}</TableCell>
                            <TableCell>
                              {emp?.date_hired ? format(new Date(emp.date_hired), 'MM-dd-yyyy') : '-'}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="capitalize">
                                {emp?.employment_status || '-'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge 
                                className={cn(
                                  "capitalize text-xs",
                                  record.status === 'present' && "bg-green-500 hover:bg-green-600",
                                  record.status === 'absent' && "bg-destructive hover:bg-destructive/90",
                                  record.status === 'late' && "bg-amber-500 hover:bg-amber-600",
                                  record.status === 'day_off' && "bg-blue-500 hover:bg-blue-600",
                                  !['present', 'absent', 'late', 'day_off'].includes(record.status) && "bg-secondary"
                                )}
                              >
                                {record.status?.replace(/_/g, ' ') || '-'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {record.attendance_date ? format(new Date(record.attendance_date), 'MM-dd-yyyy') : '-'}
                            </TableCell>
                            <TableCell>{record.day_off || '-'}</TableCell>
                            <TableCell>{record.shift || '-'}</TableCell>
                            <TableCell className="max-w-[150px] truncate">{record.remarks || '-'}</TableCell>
                            <TableCell>
                              <div className="flex items-center justify-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleViewOfficeAttendance(record)}
                                  title="View Details"
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                                {canEdit && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleEditOfficeAttendance(record)}
                                    title="Edit"
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                )}
                                {canDelete && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                      if (confirm('Delete this attendance record?')) {
                                        deleteOfficeAttendanceMutation.mutate(record.id);
                                      }
                                    }}
                                    title="Delete"
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </ScrollArea>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <ClipboardList className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <h3 className="text-lg font-medium">No office attendance records</h3>
                  <p className="text-muted-foreground">Add attendance records for office staff to see them here</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Office Employee Details by Status */}
          {officeAttendanceSummary.totalRecords > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Office Employee Details by Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {/* Present Employees */}
                  {(officeAttendanceSummary.employeesByStatus['present'] || []).length > 0 && (
                    <Card className="border-green-500/50">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Badge className="text-xs bg-green-500 hover:bg-green-600">Present</Badge>
                          <span className="text-muted-foreground">
                            ({officeAttendanceSummary.employeesByStatus['present'].length})
                          </span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ScrollArea className="h-[200px]">
                          <div className="space-y-2">
                            {officeAttendanceSummary.employeesByStatus['present'].map((emp, idx) => (
                              <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 hover:bg-muted">
                                <Avatar className="h-6 w-6">
                                  <AvatarImage src={emp.photo_url || ''} />
                                  <AvatarFallback className="text-[10px]">
                                    {emp.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium truncate">{emp.name}</p>
                                  <p className="text-[10px] text-muted-foreground truncate">{emp.position}</p>
                                </div>
                                <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                  {format(new Date(emp.date), 'MMM dd')}
                                </span>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      </CardContent>
                    </Card>
                  )}

                  {/* Absent Employees */}
                  {(officeAttendanceSummary.employeesByStatus['absent'] || []).length > 0 && (
                    <Card className="border-destructive/50">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Badge variant="destructive" className="text-xs">Absent</Badge>
                          <span className="text-muted-foreground">
                            ({officeAttendanceSummary.employeesByStatus['absent'].length})
                          </span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ScrollArea className="h-[200px]">
                          <div className="space-y-2">
                            {officeAttendanceSummary.employeesByStatus['absent'].map((emp, idx) => (
                              <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 hover:bg-muted">
                                <Avatar className="h-6 w-6">
                                  <AvatarImage src={emp.photo_url || ''} />
                                  <AvatarFallback className="text-[10px]">
                                    {emp.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium truncate">{emp.name}</p>
                                  <p className="text-[10px] text-muted-foreground truncate">{emp.position}</p>
                                </div>
                                <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                  {format(new Date(emp.date), 'MMM dd')}
                                </span>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      </CardContent>
                    </Card>
                  )}

                  {/* Late Employees */}
                  {(officeAttendanceSummary.employeesByStatus['late'] || []).length > 0 && (
                    <Card className="border-amber-500/50">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Badge className="text-xs bg-amber-500 hover:bg-amber-600">Late</Badge>
                          <span className="text-muted-foreground">
                            ({officeAttendanceSummary.employeesByStatus['late'].length})
                          </span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ScrollArea className="h-[200px]">
                          <div className="space-y-2">
                            {officeAttendanceSummary.employeesByStatus['late'].map((emp, idx) => (
                              <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 hover:bg-muted">
                                <Avatar className="h-6 w-6">
                                  <AvatarImage src={emp.photo_url || ''} />
                                  <AvatarFallback className="text-[10px]">
                                    {emp.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium truncate">{emp.name}</p>
                                  <p className="text-[10px] text-muted-foreground truncate">{emp.position}</p>
                                </div>
                                <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                  {format(new Date(emp.date), 'MMM dd')}
                                </span>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      </CardContent>
                    </Card>
                  )}

                  {/* Day Off Employees */}
                  {(officeAttendanceSummary.employeesByStatus['day_off'] || []).length > 0 && (
                    <Card className="border-blue-500/50">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Badge className="text-xs bg-blue-500 hover:bg-blue-600">Day Off</Badge>
                          <span className="text-muted-foreground">
                            ({officeAttendanceSummary.employeesByStatus['day_off'].length})
                          </span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ScrollArea className="h-[200px]">
                          <div className="space-y-2">
                            {officeAttendanceSummary.employeesByStatus['day_off'].map((emp, idx) => (
                              <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 hover:bg-muted">
                                <Avatar className="h-6 w-6">
                                  <AvatarImage src={emp.photo_url || ''} />
                                  <AvatarFallback className="text-[10px]">
                                    {emp.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium truncate">{emp.name}</p>
                                  <p className="text-[10px] text-muted-foreground truncate">{emp.position}</p>
                                </div>
                                <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                  {format(new Date(emp.date), 'MMM dd')}
                                </span>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      </CardContent>
                    </Card>
                  )}

                  {/* Other Statuses */}
                  {Object.entries(officeAttendanceSummary.employeesByStatus)
                    .filter(([status]) => !['present', 'absent', 'late', 'day_off'].includes(status))
                    .map(([status, employees]) => (
                      employees.length > 0 && (
                        <Card key={status} className="border-secondary/50">
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm flex items-center gap-2">
                              <Badge variant="secondary" className="text-xs capitalize">{status.replace('_', ' ')}</Badge>
                              <span className="text-muted-foreground">
                                ({employees.length})
                              </span>
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <ScrollArea className="h-[200px]">
                              <div className="space-y-2">
                                {employees.map((emp, idx) => (
                                  <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 hover:bg-muted">
                                    <Avatar className="h-6 w-6">
                                      <AvatarImage src={emp.photo_url || ''} />
                                      <AvatarFallback className="text-[10px]">
                                        {emp.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                                      </AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs font-medium truncate">{emp.name}</p>
                                      <p className="text-[10px] text-muted-foreground truncate">{emp.position}</p>
                                    </div>
                                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                      {format(new Date(emp.date), 'MMM dd')}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </ScrollArea>
                          </CardContent>
                        </Card>
                      )
                    ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Branch Breakdown Table */}
          <Card>
            <CardHeader>
              <CardTitle>Office Attendance by Branch - {attendanceDate ? format(new Date(attendanceDate), 'MMM dd, yyyy') : `${MONTHS[parseInt(attendanceMonth)]} ${attendanceYear}`}</CardTitle>
            </CardHeader>
            <CardContent>
              {officeAttendanceSummary.branchData.length > 0 ? (
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[50px] text-center">#</TableHead>
                        <TableHead>Branch</TableHead>
                        <TableHead className="text-center">Total Records</TableHead>
                        <TableHead className="text-center">Present</TableHead>
                        <TableHead className="text-center">Absent</TableHead>
                        <TableHead className="text-center">Late</TableHead>
                        <TableHead className="text-center">Day Off</TableHead>
                        <TableHead className="text-center">Others</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {officeAttendanceSummary.branchData.map((branch, index) => {
                        const present = branch.statuses['present'] || 0;
                        const absent = branch.statuses['absent'] || 0;
                        const late = branch.statuses['late'] || 0;
                        const dayOff = branch.statuses['day_off'] || 0;
                        const others = branch.total - present - absent - late - dayOff;
                        
                        return (
                          <TableRow key={branch.branch}>
                            <TableCell className="text-center text-muted-foreground">{index + 1}</TableCell>
                            <TableCell className="font-medium">{branch.branch}</TableCell>
                            <TableCell className="text-center font-bold">{branch.total}</TableCell>
                            <TableCell className="text-center">
                              {present > 0 ? (
                                <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                                  {present}
                                </Badge>
                              ) : '-'}
                            </TableCell>
                            <TableCell className="text-center">
                              {absent > 0 ? (
                                <Badge variant="outline" className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                                  {absent}
                                </Badge>
                              ) : '-'}
                            </TableCell>
                            <TableCell className="text-center">
                              {late > 0 ? (
                                <Badge variant="outline" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
                                  {late}
                                </Badge>
                              ) : '-'}
                            </TableCell>
                            <TableCell className="text-center">
                              {dayOff > 0 ? (
                                <Badge variant="outline" className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                                  {dayOff}
                                </Badge>
                              ) : '-'}
                            </TableCell>
                            <TableCell className="text-center">
                              {others > 0 ? (
                                <Badge variant="secondary">{others}</Badge>
                              ) : '-'}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {/* Totals Row */}
                      <TableRow className="bg-muted/50 font-bold">
                        <TableCell></TableCell>
                        <TableCell>TOTAL</TableCell>
                        <TableCell className="text-center">{officeAttendanceSummary.totalRecords}</TableCell>
                        <TableCell className="text-center">
                          {officeAttendanceSummary.branchData.reduce((sum, b) => sum + (b.statuses['present'] || 0), 0)}
                        </TableCell>
                        <TableCell className="text-center">
                          {officeAttendanceSummary.branchData.reduce((sum, b) => sum + (b.statuses['absent'] || 0), 0)}
                        </TableCell>
                        <TableCell className="text-center">
                          {officeAttendanceSummary.branchData.reduce((sum, b) => sum + (b.statuses['late'] || 0), 0)}
                        </TableCell>
                        <TableCell className="text-center">
                          {officeAttendanceSummary.branchData.reduce((sum, b) => sum + (b.statuses['day_off'] || 0), 0)}
                        </TableCell>
                        <TableCell className="text-center">
                          {officeAttendanceSummary.branchData.reduce((sum, b) => {
                            const present = b.statuses['present'] || 0;
                            const absent = b.statuses['absent'] || 0;
                            const late = b.statuses['late'] || 0;
                            const dayOff = b.statuses['day_off'] || 0;
                            return sum + (b.total - present - absent - late - dayOff);
                          }, 0)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Building2 className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <h3 className="text-lg font-medium">No office attendance records found</h3>
                  <p className="text-muted-foreground">No office attendance data for {attendanceDate ? format(new Date(attendanceDate), 'MMM dd, yyyy') : `${MONTHS[parseInt(attendanceMonth)]} ${attendanceYear}`}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* View Office Attendance Dialog */}
          <Dialog open={isOfficeViewModalOpen} onOpenChange={setIsOfficeViewModalOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Attendance Details</DialogTitle>
              </DialogHeader>
              {viewingOfficeAttendance && (
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <Avatar className="h-16 w-16">
                      <AvatarImage src={viewingOfficeAttendance.employees?.photo_url || ''} />
                      <AvatarFallback>
                        {viewingOfficeAttendance.employees?.full_name?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || '?'}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-semibold">{viewingOfficeAttendance.employees?.full_name}</p>
                      <p className="text-sm text-muted-foreground">{viewingOfficeAttendance.employees?.position}</p>
                      <p className="text-sm text-muted-foreground">{viewingOfficeAttendance.employees?.branch}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-muted-foreground">Date</Label>
                      <p className="font-medium">{viewingOfficeAttendance.attendance_date ? format(new Date(viewingOfficeAttendance.attendance_date), 'MMM dd, yyyy') : '-'}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Status</Label>
                      <p className="font-medium capitalize">{viewingOfficeAttendance.status?.replace(/_/g, ' ')}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Day Off</Label>
                      <p className="font-medium">{viewingOfficeAttendance.day_off || '-'}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Shift</Label>
                      <p className="font-medium">{viewingOfficeAttendance.shift || '-'}</p>
                    </div>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Remarks</Label>
                    <p className="font-medium">{viewingOfficeAttendance.remarks || '-'}</p>
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsOfficeViewModalOpen(false)}>
                  Close
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Edit Office Attendance Dialog */}
          <Dialog open={isOfficeEditModalOpen} onOpenChange={setIsOfficeEditModalOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Edit Attendance</DialogTitle>
              </DialogHeader>
              {editingOfficeAttendance && (
                <div className="space-y-4">
                  <div className="flex items-center gap-4 pb-4 border-b">
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={editingOfficeAttendance.employees?.photo_url || ''} />
                      <AvatarFallback>
                        {editingOfficeAttendance.employees?.full_name?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || '?'}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-semibold">{editingOfficeAttendance.employees?.full_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {editingOfficeAttendance.attendance_date ? format(new Date(editingOfficeAttendance.attendance_date), 'MMM dd, yyyy') : '-'}
                      </p>
                    </div>
                  </div>

                  {/* Status */}
                  <div className="space-y-2">
                    <Label>Status *</Label>
                    <Select 
                      value={officeEditForm.status} 
                      onValueChange={(val) => setOfficeEditForm(prev => ({ ...prev, status: val }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-popover z-50">
                        <SelectItem value="present">Present</SelectItem>
                        <SelectItem value="absent">Absent</SelectItem>
                        <SelectItem value="late">Late</SelectItem>
                        <SelectItem value="day_off">Day Off</SelectItem>
                        <SelectItem value="half_day">Half day</SelectItem>
                        <SelectItem value="undertime">Undertime</SelectItem>
                        <SelectItem value="suspension">Suspension</SelectItem>
                        <SelectItem value="unauthorized_absent">Unauthorized absent</SelectItem>
                        <SelectItem value="sil">SIL</SelectItem>
                        <SelectItem value="vl">VL</SelectItem>
                        <SelectItem value="change_day_off">Change Day off</SelectItem>
                        <SelectItem value="change_schedule">Change of Schedule</SelectItem>
                        <SelectItem value="cancel_day_off">Cancel Day off</SelectItem>
                        <SelectItem value="other">Other Concern</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Day Off */}
                  <div className="space-y-2">
                    <Label>Day Off</Label>
                    <Select 
                      value={officeEditForm.day_off} 
                      onValueChange={(val) => setOfficeEditForm(prev => ({ ...prev, day_off: val }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select day off" />
                      </SelectTrigger>
                      <SelectContent className="bg-popover z-50">
                        <SelectItem value="Monday">Monday</SelectItem>
                        <SelectItem value="Tuesday">Tuesday</SelectItem>
                        <SelectItem value="Wednesday">Wednesday</SelectItem>
                        <SelectItem value="Thursday">Thursday</SelectItem>
                        <SelectItem value="Friday">Friday</SelectItem>
                        <SelectItem value="Saturday">Saturday</SelectItem>
                        <SelectItem value="Sunday">Sunday</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Shift */}
                  <div className="space-y-2">
                    <Label>Shift</Label>
                    <Select 
                      value={officeEditForm.shift} 
                      onValueChange={(val) => setOfficeEditForm(prev => ({ ...prev, shift: val }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select shift" />
                      </SelectTrigger>
                      <SelectContent className="bg-popover z-50">
                        <SelectItem value="Opening">Opening</SelectItem>
                        <SelectItem value="Midshift">Midshift</SelectItem>
                        <SelectItem value="Closing">Closing</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Remarks */}
                  <div className="space-y-2">
                    <Label>Remarks</Label>
                    <Textarea
                      placeholder="Optional remarks..."
                      value={officeEditForm.remarks}
                      onChange={(e) => setOfficeEditForm(prev => ({ ...prev, remarks: e.target.value }))}
                      rows={2}
                    />
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsOfficeEditModalOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => updateOfficeAttendanceMutation.mutate({ 
                    id: editingOfficeAttendance?.id, 
                    data: officeEditForm 
                  })}
                  disabled={updateOfficeAttendanceMutation.isPending}
                >
                  {updateOfficeAttendanceMutation.isPending ? 'Saving...' : 'Save Changes'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* Recently Deleted Tab */}
        <TabsContent value="recently-deleted" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trash2 className="h-5 w-5" />
                Recently Deleted Employees
              </CardTitle>
            </CardHeader>
            <CardContent>
              {deletedEmployees.length > 0 ? (
                <ScrollArea className="h-[500px]">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="w-[50px]">Photo</TableHead>
                        <TableHead>Emp ID</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Branch</TableHead>
                        <TableHead>Position</TableHead>
                        <TableHead>Deleted At</TableHead>
                        <TableHead className="text-center">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {deletedEmployees.map((emp: Employee) => (
                        <TableRow key={emp.id}>
                          <TableCell>
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={emp.photo_url || ''} />
                              <AvatarFallback className="text-xs">
                                {emp.full_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                              </AvatarFallback>
                            </Avatar>
                          </TableCell>
                          <TableCell className="font-medium">{emp.employee_id || '-'}</TableCell>
                          <TableCell>{emp.full_name}</TableCell>
                          <TableCell>{emp.branch || emp.branches?.name || '-'}</TableCell>
                          <TableCell>{emp.position || '-'}</TableCell>
                          <TableCell>
                            {(emp as any).deleted_at 
                              ? format(new Date((emp as any).deleted_at), 'MMM dd, yyyy hh:mm a')
                              : '-'}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => restoreMutation.mutate(emp.id)}
                                title="Restore"
                              >
                                <RotateCcw className="h-4 w-4 text-green-600" />
                              </Button>
                              {canDelete && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => {
                                    if (confirm('Permanently delete this employee? This cannot be undone.')) {
                                      permanentDeleteMutation.mutate(emp.id);
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
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Trash2 className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <h3 className="text-lg font-medium">No deleted employees</h3>
                  <p className="text-muted-foreground">Deleted employees will appear here</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Employee Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingEmployee ? 'Edit Employee' : 'Add New Employee'}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 py-4">
            {/* Left Column */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Employee ID</Label>
                <Input
                  value={form.employee_id}
                  onChange={(e) => updateFormField('employee_id', e.target.value)}
                  placeholder="e.g., EMP-001"
                />
              </div>
              <div className="space-y-2">
                <Label>Full Name *</Label>
                <Input
                  value={form.full_name}
                  onChange={(e) => updateFormField('full_name', e.target.value)}
                  placeholder="Enter full name"
                />
              </div>
              <div className="space-y-2">
                <Label>Age</Label>
                <Input
                  type="number"
                  value={form.age}
                  onChange={(e) => updateFormField('age', e.target.value)}
                  placeholder="Age"
                />
              </div>
              <div className="space-y-2">
                <Label>Gender</Label>
                <Select value={form.gender} onValueChange={(v) => updateFormField('gender', v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent>
                    {genderOptions.map(g => (
                      <SelectItem key={g} value={g}>{g}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Date of Birth</Label>
                <Input
                  type="date"
                  value={form.date_of_birth}
                  onChange={(e) => updateFormField('date_of_birth', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Address</Label>
                <Textarea
                  value={form.address}
                  onChange={(e) => updateFormField('address', e.target.value)}
                  placeholder="Complete address"
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label>Cell No</Label>
                <Input
                  value={form.cell_no}
                  onChange={(e) => updateFormField('cell_no', e.target.value)}
                  placeholder="09XX-XXX-XXXX"
                />
              </div>
            </div>

            {/* Middle Column */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Branch</Label>
                <Input
                  value={form.branch}
                  onChange={(e) => updateFormField('branch', e.target.value)}
                  placeholder="Enter branch (e.g., SM Jerry)"
                />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Input
                  value={form.category}
                  onChange={(e) => updateFormField('category', e.target.value)}
                  placeholder="Enter category (e.g., MHB, MLP)"
                />
              </div>
              <div className="space-y-2">
                <Label>Position</Label>
                <Select value={form.position} onValueChange={(v) => updateFormField('position', v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select position" />
                  </SelectTrigger>
                  <SelectContent>
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50">Office Positions</div>
                    {officePositions.map(pos => (
                      <SelectItem key={pos} value={pos}>{pos}</SelectItem>
                    ))}
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50 mt-1">Store Positions</div>
                    {storePositions.map(pos => (
                      <SelectItem key={pos} value={pos}>{pos}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.employment_status} onValueChange={(v) => updateFormField('employment_status', v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map(status => (
                      <SelectItem key={status} value={status}>{status}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Date of Hire *</Label>
                <Input
                  type="date"
                  value={form.date_hired}
                  onChange={(e) => updateFormField('date_hired', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Maternity</Label>
                <Select value={form.maternity} onValueChange={(v) => updateFormField('maternity', v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {maternityOptions.map(opt => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Remarks</Label>
                <Textarea
                  value={form.remarks}
                  onChange={(e) => updateFormField('remarks', e.target.value)}
                  placeholder="Additional notes"
                  rows={2}
                />
              </div>
            </div>

            {/* Right Column - Photo */}
            <div className="space-y-4">
              <Label>Photo</Label>
              <div className="border-2 border-dashed rounded-lg p-4 flex flex-col items-center justify-center min-h-[200px] bg-muted/30">
                {photoPreview ? (
                  <div className="relative">
                    <img src={photoPreview} alt="Preview" className="w-40 h-40 object-cover rounded-lg" />
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute -top-2 -right-2 h-6 w-6"
                      onClick={() => {
                        setPhotoFile(null);
                        setPhotoPreview(null);
                        updateFormField('photo_url', '');
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="text-center">
                    <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground mb-2">Upload a photo</p>
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  id="photo-upload"
                  onChange={handlePhotoChange}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => document.getElementById('photo-upload')?.click()}
                >
                  Browse Photo
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeModal}>Cancel</Button>
            <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending || uploadingPhoto}>
              {uploadingPhoto ? 'Uploading...' : editingEmployee ? 'Update' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      {/* View Employee Details Dialog */}
      <Dialog open={!!viewingEmployee} onOpenChange={(open) => !open && setViewingEmployee(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <Avatar className="h-12 w-12">
                <AvatarImage src={viewingEmployee?.photo_url || ''} />
                <AvatarFallback className="text-lg">
                  {viewingEmployee?.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2) || '?'}
                </AvatarFallback>
              </Avatar>
              <div>
                <span className="block">{viewingEmployee?.full_name || 'Employee Details'}</span>
                <span className="text-sm text-muted-foreground font-normal">{viewingEmployee?.employee_id || 'No ID'}</span>
              </div>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            {/* Personal Information */}
            <div>
              <h4 className="text-sm font-semibold text-muted-foreground mb-3">Personal Information</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Gender</p>
                  <p className="font-medium">{viewingEmployee?.gender || '-'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Age</p>
                  <p className="font-medium">{viewingEmployee?.age || '-'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Date of Birth</p>
                  <p className="font-medium">{viewingEmployee?.date_of_birth ? format(new Date(viewingEmployee.date_of_birth), 'MMMM dd, yyyy') : '-'}</p>
                </div>
                <div className="space-y-1 col-span-2 md:col-span-3">
                  <p className="text-sm text-muted-foreground">Address</p>
                  <p className="font-medium">{viewingEmployee?.address || '-'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Cell No.</p>
                  <p className="font-medium">{viewingEmployee?.cell_no || '-'}</p>
                </div>
              </div>
            </div>

            {/* Employment Information */}
            <div>
              <h4 className="text-sm font-semibold text-muted-foreground mb-3">Employment Information</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Branch</p>
                  <p className="font-medium">{viewingEmployee?.branch || '-'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Category</p>
                  <p className="font-medium">{viewingEmployee?.category || '-'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Position</p>
                  <p className="font-medium">{viewingEmployee?.position || '-'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Employment Status</p>
                  <Badge variant="outline" className={cn(
                    viewingEmployee?.employment_status === 'regular' && 'bg-green-500/10 text-green-700 border-green-500/30',
                    viewingEmployee?.employment_status === 'probationary' && 'bg-yellow-500/10 text-yellow-700 border-yellow-500/30',
                    viewingEmployee?.employment_status === 'contractual' && 'bg-blue-500/10 text-blue-700 border-blue-500/30',
                    viewingEmployee?.employment_status === 'resigned' && 'bg-red-500/10 text-red-700 border-red-500/30'
                  )}>
                    {viewingEmployee?.employment_status || '-'}
                  </Badge>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Date Hired</p>
                  <p className="font-medium">{viewingEmployee?.date_hired ? format(new Date(viewingEmployee.date_hired), 'MMMM dd, yyyy') : '-'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Length of Service</p>
                  <p className="font-medium">{viewingEmployee?.date_hired ? getLengthOfService(viewingEmployee.date_hired) : '-'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Maternity</p>
                  <p className="font-medium">{viewingEmployee?.maternity || '-'}</p>
                </div>
              </div>
            </div>

            {/* Remarks */}
            {viewingEmployee?.remarks && (
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-3">Remarks</h4>
                <p className="font-medium bg-muted p-3 rounded-md">{viewingEmployee.remarks}</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
      )}
    </>
  );
};

export default Manpower;
