import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, differenceInYears, differenceInMonths, startOfMonth, endOfMonth, getMonth, getYear } from 'date-fns';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  Calendar
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
  { key: 'photo', label: 'Photo', visible: true, width: 50, minWidth: 40, maxWidth: 80 },
  { key: 'employee_id', label: 'Emp ID', visible: true, width: 100, minWidth: 80, maxWidth: 150 },
  { key: 'name', label: 'Name', visible: true, width: 150, minWidth: 100, maxWidth: 250 },
  { key: 'branch', label: 'Branch', visible: true, width: 120, minWidth: 80, maxWidth: 180 },
  { key: 'category', label: 'Category', visible: true, width: 100, minWidth: 80, maxWidth: 150 },
  { key: 'position', label: 'Position', visible: true, width: 120, minWidth: 80, maxWidth: 180 },
  { key: 'date_hired', label: 'Date Hired', visible: true, width: 120, minWidth: 100, maxWidth: 150 },
  { key: 'status', label: 'Status', visible: true, width: 110, minWidth: 90, maxWidth: 150 },
  { key: 'contact', label: 'Contact No.', visible: true, width: 120, minWidth: 100, maxWidth: 150 },
  { key: 'service', label: 'Service', visible: true, width: 100, minWidth: 80, maxWidth: 130 },
  { key: 'address', label: 'Address', visible: true, width: 150, minWidth: 100, maxWidth: 250 },
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
const positionOptions = ['Manager', 'Assistant Manager', 'Sales Assistant', 'Stock Merchandising', 'Encoder Inventory', 'Stock Support Event', 'Team Leader', 'OIC', 'AOIC', 'Key Person', 'Demo'];
const statusOptions = ['Regular', 'Probationary', 'Seasonal', 'Newly Hired', 'Back Up', 'Support Event', 'Stock Man', 'Resigned'];
const maternityOptions = ['N/A', 'On Leave', 'Returned'];

const Manpower = () => {
  const { user, userRole } = useAuth();
  const { selectedBranch } = useBranch();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Column settings
  const { columns, setColumns, isAdmin: isColumnAdmin } = useGenericColumnSettings('manpower', defaultManpowerColumns);

  const [searchQuery, setSearchQuery] = useState('');
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [positionFilter, setPositionFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [viewingPhoto, setViewingPhoto] = useState<{ url: string; name: string } | null>(null);
  const [photoZoomLevel, setPhotoZoomLevel] = useState(1);
  const [viewingEmployee, setViewingEmployee] = useState<Employee | null>(null);
  const [activeTab, setActiveTab] = useState('manpower');
  
  // Attendance summary filters
  const currentYear = new Date().getFullYear();
  const currentMonth = getMonth(new Date());
  const [attendanceMonth, setAttendanceMonth] = useState(currentMonth.toString());
  const [attendanceYear, setAttendanceYear] = useState(currentYear.toString());

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

  // Fetch active employees
  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['manpower-employees'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('*, branches(name)')
        .is('deleted_at', null)
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
    queryKey: ['manpower-attendance-summary', attendanceYear, attendanceMonth],
    queryFn: async () => {
      const monthNum = parseInt(attendanceMonth) + 1;
      const startDate = `${attendanceYear}-${String(monthNum).padStart(2, '0')}-01`;
      const endDate = format(endOfMonth(new Date(parseInt(attendanceYear), parseInt(attendanceMonth))), 'yyyy-MM-dd');
      
      const { data, error } = await supabase
        .from('attendance_records')
        .select('*, employees(full_name, branch, category, photo_url)')
        .gte('attendance_date', startDate)
        .lte('attendance_date', endDate);
      
      if (error) throw error;
      return data || [];
    },
  });

  // Get unique branch names from employees
  const uniqueBranches = useMemo(() => {
    const branchNames = employees
      .map(emp => emp.branch)
      .filter((branch): branch is string => !!branch && branch.trim() !== '');
    return [...new Set(branchNames)].sort();
  }, [employees]);

  // Get the global branch id for filtering (use branch_id instead of branch name)
  const globalBranchId = selectedBranch?.id || null;

  // Filter employees - prioritize global branch by branch_id
  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => {
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
      return matchesSearch && matchesBranch && matchesPosition && matchesCategory && matchesStatus;
    });
  }, [employees, searchQuery, globalBranchId, branchFilter, positionFilter, categoryFilter, statusFilter]);

  // Attendance summary data with employee details by status
  const attendanceSummary = useMemo(() => {
    const statusCounts: Record<string, number> = {};
    const branchCounts: Record<string, { total: number; statuses: Record<string, number> }> = {};
    const employeesByStatus: Record<string, Array<{ name: string; branch: string; date: string; photo_url?: string }>> = {};
    
    attendanceRecords.forEach((record: any) => {
      const status = record.status || 'unknown';
      const branch = record.employees?.branch || 'Unknown';
      const employeeName = record.employees?.full_name || 'Unknown';
      const photoUrl = record.employees?.photo_url;
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
        photo_url: photoUrl
      });
    });
    
    const statusData = Object.entries(statusCounts)
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);
    
    const branchData = Object.entries(branchCounts)
      .map(([branch, data]) => ({ branch, ...data }))
      .sort((a, b) => b.total - a.total);
    
    const resumeRecords = attendanceRecords.filter((r: any) => r.date_of_resume);
    
    return {
      totalRecords: attendanceRecords.length,
      statusData,
      branchData,
      resumeCount: resumeRecords.length,
      totalEmployees: employees.length,
      employeesByStatus,
    };
  }, [attendanceRecords, employees]);

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['manpower-employees'] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['manpower-employees'] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['manpower-employees'] });
      queryClient.invalidateQueries({ queryKey: ['manpower-deleted-employees'] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
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
      toast({ title: 'Employee permanently deleted!' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  });

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
        branch: emp.branches?.name || '',
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
    a.download = `manpower-database-${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export to PDF
  const handleExportPDF = () => {
    const doc = new jsPDF('landscape');
    doc.setFontSize(16);
    doc.text('Manpower Database', 14, 15);
    doc.setFontSize(10);
    doc.text(`Generated: ${format(new Date(), 'MMM dd, yyyy')}`, 14, 22);

    const tableData = filteredEmployees.map(emp => [
      emp.employee_id || '',
      emp.full_name,
      emp.gender || '',
      emp.branches?.name || '',
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

    doc.save(`manpower-database-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  const updateFormField = useCallback((field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  }, []);

  return (
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
          {isColumnAdmin && (
            <ColumnSettings 
              columns={columns} 
              onColumnChange={setColumns} 
              defaultColumns={defaultManpowerColumns}
              excludeFromWidthControl={['photo', 'actions']}
            />
          )}
          {canEdit && (
            <Button onClick={() => { resetForm(); setIsModalOpen(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              Add Employee
            </Button>
          )}
          <Button variant="outline" onClick={handleExportExcel}>
            <Download className="h-4 w-4 mr-2" />
            Excel
          </Button>
          <Button variant="outline" onClick={handleExportPDF}>
            <FileText className="h-4 w-4 mr-2" />
            PDF
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
        <TabsList className="grid w-full max-w-2xl grid-cols-3">
          <TabsTrigger value="manpower" className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            Manpower Database
          </TabsTrigger>
          <TabsTrigger value="attendance-summary" className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            Attendance Summary
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
            <div className="relative flex-1 min-w-[200px]">
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
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Position" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Positions</SelectItem>
                {positionOptions.map(pos => (
                  <SelectItem key={pos} value={pos}>{pos}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
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
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                {statusOptions.map(status => (
                  <SelectItem key={status} value={status.toLowerCase()}>{status}</SelectItem>
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
                  {columns.find(c => c.key === 'photo')?.visible && <TableHead className="w-[50px]">Photo</TableHead>}
                  {columns.find(c => c.key === 'employee_id')?.visible && <TableHead style={{ width: columns.find(c => c.key === 'employee_id')?.width }}>Emp ID</TableHead>}
                  {columns.find(c => c.key === 'name')?.visible && <TableHead style={{ width: columns.find(c => c.key === 'name')?.width }}>Name</TableHead>}
                  {columns.find(c => c.key === 'branch')?.visible && <TableHead style={{ width: columns.find(c => c.key === 'branch')?.width }}>Branch</TableHead>}
                  {columns.find(c => c.key === 'category')?.visible && <TableHead style={{ width: columns.find(c => c.key === 'category')?.width }}>Category</TableHead>}
                  {columns.find(c => c.key === 'position')?.visible && <TableHead style={{ width: columns.find(c => c.key === 'position')?.width }}>Position</TableHead>}
                  {columns.find(c => c.key === 'date_hired')?.visible && <TableHead style={{ width: columns.find(c => c.key === 'date_hired')?.width }}>Date Hired</TableHead>}
                  {columns.find(c => c.key === 'status')?.visible && <TableHead style={{ width: columns.find(c => c.key === 'status')?.width }}>Status</TableHead>}
                  {columns.find(c => c.key === 'contact')?.visible && <TableHead style={{ width: columns.find(c => c.key === 'contact')?.width }}>Contact No.</TableHead>}
                  {columns.find(c => c.key === 'service')?.visible && <TableHead style={{ width: columns.find(c => c.key === 'service')?.width }}>Service</TableHead>}
                  {columns.find(c => c.key === 'address')?.visible && <TableHead style={{ width: columns.find(c => c.key === 'address')?.width }}>Address</TableHead>}
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
                  filteredEmployees.map((emp) => (
                    <TableRow key={emp.id} className="hover:bg-muted/30">
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
                      {columns.find(c => c.key === 'employee_id')?.visible && (
                        <TableCell className="font-mono text-sm">{emp.employee_id || '-'}</TableCell>
                      )}
                      {columns.find(c => c.key === 'name')?.visible && (
                        <TableCell className="font-medium">{emp.full_name}</TableCell>
                      )}
                      {columns.find(c => c.key === 'branch')?.visible && (
                        <TableCell>{emp.branch || emp.branches?.name || '-'}</TableCell>
                      )}
                      {columns.find(c => c.key === 'category')?.visible && (
                        <TableCell>{emp.category || '-'}</TableCell>
                      )}
                      {columns.find(c => c.key === 'position')?.visible && (
                        <TableCell>{emp.position || '-'}</TableCell>
                      )}
                      {columns.find(c => c.key === 'date_hired')?.visible && (
                        <TableCell>{format(new Date(emp.date_hired), 'MMM dd, yyyy')}</TableCell>
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
                      {columns.find(c => c.key === 'contact')?.visible && (
                        <TableCell>{emp.cell_no || '-'}</TableCell>
                      )}
                      {columns.find(c => c.key === 'service')?.visible && (
                        <TableCell>{getLengthOfService(emp.date_hired)}</TableCell>
                      )}
                      {columns.find(c => c.key === 'address')?.visible && (
                        <TableCell className="max-w-[150px] truncate" title={emp.address || ''}>{emp.address || '-'}</TableCell>
                      )}
                      {columns.find(c => c.key === 'actions')?.visible && (
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewingEmployee(emp)} title="View Details">
                              <Eye className="h-4 w-4" />
                            </Button>
                            {canEdit && (
                              <>
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(emp)} title="Edit">
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                {isAdmin && (
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(emp.id)} title="Delete">
                                    <Trash2 className="h-4 w-4" />
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
          </ScrollArea>
        </CardContent>
        </Card>
        </TabsContent>

        {/* Attendance Summary Tab */}
        <TabsContent value="attendance-summary" className="space-y-6">
          {/* Date Filters */}
          <div className="flex items-center gap-2 bg-card border rounded-lg p-2 w-fit">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <Select value={attendanceMonth} onValueChange={setAttendanceMonth}>
              <SelectTrigger className="w-[130px] border-0 shadow-none focus:ring-0 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover z-50">
                {MONTHS.map((month, index) => (
                  <SelectItem key={index} value={index.toString()}>{month}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={attendanceYear} onValueChange={setAttendanceYear}>
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

          {/* Overview Cards */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Records</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{attendanceSummary.totalRecords}</div>
                <p className="text-xs text-muted-foreground">Attendance records this month</p>
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
                <CardTitle>Attendance Status Distribution - {MONTHS[parseInt(attendanceMonth)]} {attendanceYear}</CardTitle>
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
              <CardTitle>Attendance by Branch - {MONTHS[parseInt(attendanceMonth)]} {attendanceYear}</CardTitle>
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
                  <p className="text-muted-foreground">No attendance data for {MONTHS[parseInt(attendanceMonth)]} {attendanceYear}</p>
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
                              {isAdmin && (
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
                    {positionOptions.map(pos => (
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
                  <p className="font-medium">{viewingEmployee?.branches?.name || viewingEmployee?.branch || '-'}</p>
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
  );
};

export default Manpower;
