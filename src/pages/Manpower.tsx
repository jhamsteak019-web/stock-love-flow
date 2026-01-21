import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, differenceInYears, differenceInMonths } from 'date-fns';
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
  ZoomOut
} from 'lucide-react';
import { cn } from '@/lib/utils';
import * as ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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
const categoryOptions = ['Sales', 'Operations', 'Admin', 'Warehouse', 'Logistics', 'Others'];
const positionOptions = ['Manager', 'Assistant Manager', 'Sales Assistant', 'Stock Merchandising', 'Encoder Inventory', 'Stock Support Event', 'Team Leader', 'OIC', 'AOIC', 'Key Person', 'Demo'];
const statusOptions = ['Regular', 'Probationary', 'Seasonal', 'Newly Hired', 'Back Up', 'Support Event', 'Stock Man', 'Resigned'];
const maternityOptions = ['N/A', 'On Leave', 'Returned'];

const Manpower = () => {
  const { user, userRole } = useAuth();
  const { selectedBranch } = useBranch();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState('');
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [viewingPhoto, setViewingPhoto] = useState<{ url: string; name: string } | null>(null);
  const [photoZoomLevel, setPhotoZoomLevel] = useState(1);

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

  // Fetch employees
  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['manpower-employees', selectedBranch?.id],
    queryFn: async () => {
      let query = supabase
        .from('employees')
        .select('*, branches(name)')
        .eq('is_active', true)
        .order('full_name');

      if (selectedBranch?.id) {
        query = query.eq('branch_id', selectedBranch.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Employee[];
    }
  });

  // Filter employees
  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => {
      const matchesSearch = !searchQuery || 
        emp.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        emp.employee_id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        emp.position?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesBranch = branchFilter === 'all' || emp.branch_id === branchFilter;
      const matchesCategory = categoryFilter === 'all' || emp.category === categoryFilter;
      const matchesStatus = statusFilter === 'all' || emp.employment_status.toLowerCase() === statusFilter.toLowerCase();
      return matchesSearch && matchesBranch && matchesCategory && matchesStatus;
    });
  }, [employees, searchQuery, branchFilter, categoryFilter, statusFilter]);

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
        branch_id: data.branch_id || null,
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
        branch_id: data.branch_id || null,
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
      const { error } = await supabase.from('employees').update({ is_active: false }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['manpower-employees'] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      toast({ title: 'Employee deleted successfully!' });
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
    setEditingEmployee(null);
    setPhotoFile(null);
    setPhotoPreview(null);
  }, []);

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

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, ID, or position..."
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
                {branches.map(branch => (
                  <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>
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
                  <TableHead className="w-[50px]">Photo</TableHead>
                  <TableHead>Emp ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Position</TableHead>
                  <TableHead>Date Hired</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Contact No.</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Address</TableHead>
                  {canEdit && <TableHead className="w-[100px]">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center py-8">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : filteredEmployees.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">
                      No employees found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredEmployees.map((emp) => (
                    <TableRow key={emp.id} className="hover:bg-muted/30">
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
                      <TableCell className="font-mono text-sm">{emp.employee_id || '-'}</TableCell>
                      <TableCell className="font-medium">{emp.full_name}</TableCell>
                      <TableCell>{emp.branch || emp.branches?.name || '-'}</TableCell>
                      <TableCell>{emp.category || '-'}</TableCell>
                      <TableCell>{emp.position || '-'}</TableCell>
                      <TableCell>{format(new Date(emp.date_hired), 'MMM dd, yyyy')}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn(
                          emp.employment_status === 'regular' && 'bg-green-500/10 text-green-700 border-green-500/30',
                          emp.employment_status === 'probationary' && 'bg-yellow-500/10 text-yellow-700 border-yellow-500/30',
                          emp.employment_status === 'contractual' && 'bg-blue-500/10 text-blue-700 border-blue-500/30',
                          emp.employment_status === 'resigned' && 'bg-red-500/10 text-red-700 border-red-500/30'
                        )}>
                          {emp.employment_status}
                        </Badge>
                      </TableCell>
                      <TableCell>{emp.cell_no || '-'}</TableCell>
                      <TableCell>{getLengthOfService(emp.date_hired)}</TableCell>
                      <TableCell className="max-w-[150px] truncate" title={emp.address || ''}>{emp.address || '-'}</TableCell>
                      {canEdit && (
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(emp)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            {isAdmin && (
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(emp.id)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
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
    </div>
  );
};

export default Manpower;
