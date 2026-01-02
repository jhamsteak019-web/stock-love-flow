import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Plus, Search, Pencil, Trash2, Container as ContainerIcon, Camera, RefreshCw, Eye, FileSpreadsheet, FileText, CalendarIcon, ZoomIn, ZoomOut, X, Calendar } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { cn } from '@/lib/utils';
import jsPDF from 'jspdf';
import ExcelJS from 'exceljs';

interface ContainerItem {
  id: string;
  date: string;
  out_factory: string | null;
  photo_url: string | null;
  date_receive_factory: string | null;
  receive_photo_url: string | null;
  category: string | null;
  notes: string | null;
  remarks: string | null;
  status: string | null;
  created_at: string;
}

const STATUS_OPTIONS = ['ON PROCESS WAREHOUSE', 'FOR DISTRIBUTION ON WAREHOUSE', 'FOR DELIVERY ON STORE'];

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const Container = () => {
  const { user, userRole } = useAuth();
  const queryClient = useQueryClient();
  const photoInputRef = useRef<HTMLInputElement>(null);
  const receivePhotoInputRef = useRef<HTMLInputElement>(null);
  
  const currentDate = new Date();
  const [selectedMonth, setSelectedMonth] = useState<number>(currentDate.getMonth());
  const [selectedYear, setSelectedYear] = useState<number>(currentDate.getFullYear());
  
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ContainerItem | null>(null);
  const [viewingItem, setViewingItem] = useState<ContainerItem | null>(null);
  const [uploadingPhotoId, setUploadingPhotoId] = useState<string | null>(null);
  const [uploadingReceivePhotoId, setUploadingReceivePhotoId] = useState<string | null>(null);
  const [datePickerContainerId, setDatePickerContainerId] = useState<string | null>(null);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [receiveDatePickerContainerId, setReceiveDatePickerContainerId] = useState<string | null>(null);
  const [isReceiveDatePickerOpen, setIsReceiveDatePickerOpen] = useState(false);
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  
  const [formData, setFormData] = useState({
    date: '',
    out_factory: '',
    date_receive_factory: '',
    category: '',
    notes: '',
    remarks: ''
  });

  const canEdit = userRole === 'admin' || userRole === 'staff';
  const canDelete = userRole === 'admin';
  const canExport = userRole !== 'uploader';

  // Fetch containers
  const { data: containers = [], isLoading, refetch } = useQuery({
    queryKey: ['containers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('containers')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as ContainerItem[];
    }
  });

  // Filter containers by month and year
  const filteredByDate = containers.filter(item => {
    const itemDate = new Date(item.date);
    return itemDate.getMonth() === selectedMonth && itemDate.getFullYear() === selectedYear;
  });

  // Add container
  const addMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase
        .from('containers')
        .insert({
          date: data.date,
          out_factory: data.out_factory || null,
          date_receive_factory: data.date_receive_factory || null,
          category: data.category || null,
          notes: data.notes || null,
          remarks: data.remarks || null,
          created_by: user?.id
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['containers'] });
      toast.success('Container added successfully');
      setIsAddDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast.error(`Failed to add: ${error.message}`);
    }
  });

  // Update container
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ContainerItem> }) => {
      const { error } = await supabase
        .from('containers')
        .update(data)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['containers'] });
      toast.success('Container updated successfully');
      setIsEditDialogOpen(false);
      setEditingItem(null);
    },
    onError: (error: any) => {
      toast.error(`Failed to update: ${error.message}`);
    }
  });

  // Delete container
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('containers')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['containers'] });
      toast.success('Container deleted successfully');
    },
    onError: (error: any) => {
      toast.error(`Failed to delete: ${error.message}`);
    }
  });

  // Upload photo
  const uploadPhoto = async (file: File, containerId: string, type: 'photo' | 'receive') => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${containerId}-${type}-${Date.now()}.${fileExt}`;
    
    const { error: uploadError } = await supabase.storage
      .from('container-photos')
      .upload(fileName, file);
    
    if (uploadError) throw uploadError;
    
    const { data: urlData } = supabase.storage
      .from('container-photos')
      .getPublicUrl(fileName);
    
    return urlData.publicUrl;
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>, containerId: string, type: 'photo' | 'receive') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (type === 'photo') {
      setUploadingPhotoId(containerId);
    } else {
      setUploadingReceivePhotoId(containerId);
    }

    try {
      const url = await uploadPhoto(file, containerId, type);
      await updateMutation.mutateAsync({
        id: containerId,
        data: type === 'photo' ? { photo_url: url } : { receive_photo_url: url }
      });
      toast.success('Photo uploaded successfully');
      
      // Show calendar popup after photo upload
      if (type === 'photo') {
        setDatePickerContainerId(containerId);
        setIsDatePickerOpen(true);
      } else {
        setReceiveDatePickerContainerId(containerId);
        setIsReceiveDatePickerOpen(true);
      }
    } catch (error: any) {
      toast.error(`Failed to upload: ${error.message}`);
    } finally {
      setUploadingPhotoId(null);
      setUploadingReceivePhotoId(null);
    }
  };

  const handleDeletePhoto = async (containerId: string, type: 'photo' | 'receive') => {
    try {
      const updateField = type === 'photo' ? 'photo_url' : 'receive_photo_url';
      const { error } = await supabase
        .from('containers')
        .update({ [updateField]: null })
        .eq('id', containerId);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['containers'] });
      toast.success('Photo removed successfully');
    } catch (error: any) {
      toast.error(`Failed to remove photo: ${error.message}`);
    }
  };

  const resetForm = () => {
    setFormData({
      date: '',
      out_factory: '',
      date_receive_factory: '',
      category: '',
      notes: '',
      remarks: ''
    });
  };

  const handleEdit = (item: ContainerItem) => {
    setEditingItem(item);
    setFormData({
      date: item.date,
      out_factory: item.out_factory || '',
      date_receive_factory: item.date_receive_factory || '',
      category: item.category || '',
      notes: item.notes || '',
      remarks: item.remarks || ''
    });
    setIsEditDialogOpen(true);
  };

  const handleView = (item: ContainerItem) => {
    setViewingItem(item);
    setIsViewDialogOpen(true);
  };

  const handleSubmitAdd = () => {
    addMutation.mutate(formData);
  };

  const handleSubmitEdit = () => {
    if (!editingItem) return;
    updateMutation.mutate({
      id: editingItem.id,
      data: {
        date: formData.date,
        out_factory: formData.out_factory || null,
        date_receive_factory: formData.date_receive_factory || null,
        category: formData.category || null,
        notes: formData.notes || null,
        remarks: formData.remarks || null
      }
    });
  };

  // Filter containers by search
  const filteredContainers = filteredByDate.filter(item => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      item.notes?.toLowerCase().includes(search) ||
      item.category?.toLowerCase().includes(search)
    );
  });

  // Helper to fetch image as base64
  const fetchImageAsBase64 = async (url: string): Promise<string | null> => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  };

  // Export to Excel with images
  const handleExportExcel = async () => {
    toast.info('Preparing Excel with images...');
    
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Containers');

    // Define columns matching table order
    worksheet.columns = [
      { header: 'Container', key: 'container', width: 35 },
      { header: 'Date Out Factory', key: 'date_out', width: 18 },
      { header: 'Photo', key: 'photo', width: 15 },
      { header: 'Date Receive Warehouse', key: 'date_receive', width: 22 },
      { header: 'Delivery Days', key: 'delivery_days', width: 14 },
      { header: 'Receive Photo', key: 'receive_photo', width: 15 },
      { header: 'Category Manual', key: 'category', width: 16 },
      { header: 'Status', key: 'status', width: 30 }
    ];

    // Style header row
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF3B82F6' }
    };
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

    // Add data rows
    for (let i = 0; i < filteredContainers.length; i++) {
      const item = filteredContainers[i];
      const rowIndex = i + 2;

      worksheet.addRow({
        container: item.notes || '-',
        date_out: format(new Date(item.date), 'MMM dd, yyyy'),
        photo: '',
        date_receive: item.date_receive_factory ? format(new Date(item.date_receive_factory), 'MMM dd, yyyy') : '-',
        delivery_days: item.date && item.date_receive_factory ? differenceInDays(new Date(item.date_receive_factory), new Date(item.date)) : '-',
        receive_photo: '',
        category: item.category || '-',
        status: item.status || '-'
      });

      worksheet.getRow(rowIndex).height = 60;

      // Add photo if exists
      if (item.photo_url) {
        const base64 = await fetchImageAsBase64(item.photo_url);
        if (base64) {
          const imageId = workbook.addImage({
            base64: base64.split(',')[1],
            extension: 'png'
          });
          worksheet.addImage(imageId, {
            tl: { col: 2, row: rowIndex - 1 },
            ext: { width: 70, height: 70 }
          });
        }
      }

      // Add receive photo if exists
      if (item.receive_photo_url) {
        const base64 = await fetchImageAsBase64(item.receive_photo_url);
        if (base64) {
          const imageId = workbook.addImage({
            base64: base64.split(',')[1],
            extension: 'png'
          });
          worksheet.addImage(imageId, {
            tl: { col: 5, row: rowIndex - 1 },
            ext: { width: 70, height: 70 }
          });
        }
      }
    }

    // Download
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `containers_${MONTHS[selectedMonth]}_${selectedYear}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Exported to Excel with images successfully');
  };

  // Export to PDF - Allocation Bill Style
  const handleExportPDF = async () => {
    toast.info('Preparing PDF...');
    
    const doc = new jsPDF({ orientation: 'portrait' });
    
    // Title
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Container Report', 105, 20, { align: 'center' });
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`${MONTHS[selectedMonth]} ${selectedYear}`, 105, 28, { align: 'center' });
    
    doc.setFontSize(10);
    doc.text(`Generated: ${format(new Date(), 'MMM dd, yyyy HH:mm')}`, 105, 35, { align: 'center' });

    let y = 50;
    const pageHeight = 280;
    const itemsWithPhotos = filteredContainers.filter(item => item.photo_url || item.receive_photo_url);
    const itemsWithoutPhotos = filteredContainers.filter(item => !item.photo_url && !item.receive_photo_url);

    // Containers with photos
    if (itemsWithPhotos.length > 0) {
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Containers with Photos', 14, y);
      y += 10;

      for (const item of itemsWithPhotos) {
        if (y > pageHeight - 80) {
          doc.addPage();
          y = 20;
        }

        // Box for each container
        doc.setDrawColor(59, 130, 246);
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(14, y, 182, 70, 3, 3, 'FD');

        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(59, 130, 246);
        doc.text(`Container: ${(item.notes || 'No Name').substring(0, 50)}`, 18, y + 8);

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(9);
        
        doc.text(`Date Out Factory: ${format(new Date(item.date), 'MMM dd, yyyy')}`, 18, y + 18);
        doc.text(`Date Receive: ${item.date_receive_factory ? format(new Date(item.date_receive_factory), 'MMM dd, yyyy') : '-'}`, 18, y + 26);
        doc.text(`Delivery Days: ${item.date && item.date_receive_factory ? differenceInDays(new Date(item.date_receive_factory), new Date(item.date)) : '-'}`, 18, y + 34);
        doc.text(`Category: ${item.category || '-'}`, 18, y + 42);
        // Status with blue pill/badge style
        const statusText = item.status || '-';
        doc.setFillColor(219, 234, 254); // bg-blue-100
        doc.setDrawColor(59, 130, 246); // border-blue-500
        const statusWidth = doc.getTextWidth(statusText) + 6;
        doc.roundedRect(18, y + 45, statusWidth, 7, 2, 2, 'FD');
        doc.setTextColor(37, 99, 235); // text-blue-600
        doc.text(statusText, 21, y + 50);

        // Photos
        let photoX = 120;
        if (item.photo_url) {
          try {
            const base64 = await fetchImageAsBase64(item.photo_url);
            if (base64) {
              doc.addImage(base64, 'PNG', photoX, y + 5, 30, 30);
              doc.setFontSize(7);
              doc.text('Out Photo', photoX + 5, y + 38);
            }
          } catch {}
          photoX += 35;
        }

        if (item.receive_photo_url) {
          try {
            const base64 = await fetchImageAsBase64(item.receive_photo_url);
            if (base64) {
              doc.addImage(base64, 'PNG', photoX, y + 5, 30, 30);
              doc.setFontSize(7);
              doc.text('Receive Photo', photoX + 2, y + 38);
            }
          } catch {}
        }

        y += 75;
      }
    }

    // Containers without photos
    if (itemsWithoutPhotos.length > 0) {
      if (y > pageHeight - 40) {
        doc.addPage();
        y = 20;
      }

      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text('Containers without Photos', 14, y);
      y += 10;

      // Table header
      doc.setFillColor(59, 130, 246);
      doc.rect(14, y, 182, 8, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.text('Container', 16, y + 5.5);
      doc.text('Date Out', 70, y + 5.5);
      doc.text('Date Receive', 100, y + 5.5);
      doc.text('Days', 135, y + 5.5);
      doc.text('Category', 150, y + 5.5);
      doc.text('Status', 175, y + 5.5);
      y += 10;

      doc.setTextColor(0, 0, 0);
      for (const item of itemsWithoutPhotos) {
        if (y > pageHeight - 10) {
          doc.addPage();
          y = 20;
        }

        doc.text((item.notes || '-').substring(0, 25), 16, y + 4);
        doc.text(format(new Date(item.date), 'MMM dd, yy'), 70, y + 4);
        doc.text(item.date_receive_factory ? format(new Date(item.date_receive_factory), 'MMM dd, yy') : '-', 100, y + 4);
        doc.text(item.date && item.date_receive_factory ? String(differenceInDays(new Date(item.date_receive_factory), new Date(item.date))) : '-', 135, y + 4);
        doc.text((item.category || '-').substring(0, 6), 150, y + 4);
        // Status with blue pill/badge style
        const statusText = (item.status || '-').substring(0, 15);
        doc.setFillColor(219, 234, 254); // bg-blue-100
        doc.setDrawColor(59, 130, 246); // border-blue-500
        const statusWidth = doc.getTextWidth(statusText) + 4;
        doc.roundedRect(175, y - 1, statusWidth, 6, 1.5, 1.5, 'FD');
        doc.setTextColor(37, 99, 235); // text-blue-600
        doc.text(statusText, 177, y + 4);
        doc.setTextColor(0, 0, 0); // reset to black

        doc.setDrawColor(200, 200, 200);
        doc.line(14, y + 6, 196, y + 6);
        y += 8;
      }
    }

    doc.save(`containers_${MONTHS[selectedMonth]}_${selectedYear}.pdf`);
    toast.success('Exported to PDF successfully');
  };

  const handleZoomIn = () => setZoomLevel(prev => Math.min(prev + 0.5, 5));
  const handleZoomOut = () => setZoomLevel(prev => Math.max(prev - 0.5, 0.5));

  return (
    <div className="space-y-6 p-4 md:p-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="flex items-center gap-2">
            <ContainerIcon className="h-5 w-5" />
            Container ({filteredContainers.length})
          </CardTitle>
          <div className="flex items-center gap-2">
            {/* Month/Year Filter */}
            <div className="flex items-center gap-2 bg-muted/50 border border-border rounded-lg px-3 py-1.5">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <Select value={selectedMonth.toString()} onValueChange={(val) => setSelectedMonth(parseInt(val))}>
                <SelectTrigger className="w-[110px] h-8 border-0 bg-transparent focus:ring-0">
                  <SelectValue placeholder="Month" />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  {MONTHS.map((month, index) => (
                    <SelectItem key={index} value={index.toString()}>{month}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedYear.toString()} onValueChange={(val) => setSelectedYear(parseInt(val))}>
                <SelectTrigger className="w-[80px] h-8 border-0 bg-transparent focus:ring-0">
                  <SelectValue placeholder="Year" />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  {[2024, 2025, 2026].map((year) => (
                    <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {canExport && (
              <>
                <Button variant="outline" size="sm" onClick={handleExportPDF}>
                  <FileText className="h-4 w-4 mr-2" />
                  PDF
                </Button>
                <Button variant="outline" size="sm" onClick={handleExportExcel}>
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Excel
                </Button>
              </>
            )}
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            {canEdit && (
              <Button onClick={() => setIsAddDialogOpen(true)} size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {/* Search */}
          <div className="flex items-center gap-4 mb-6">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search container name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredContainers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <ContainerIcon className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">No containers for {MONTHS[selectedMonth]} {selectedYear}</h3>
              <p className="text-muted-foreground mb-4">Get started by adding your first container.</p>
              {canEdit && (
                <Button onClick={() => setIsAddDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Container
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-primary/50 scrollbar-track-muted" style={{ scrollbarWidth: 'auto', scrollbarColor: 'hsl(var(--primary) / 0.5) hsl(var(--muted))' }}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Container</TableHead>
                    <TableHead>Date Out Factory</TableHead>
                    <TableHead>Photo</TableHead>
                    <TableHead>Date Receive Warehouse</TableHead>
                    <TableHead>Delivery Days</TableHead>
                    <TableHead>Upload Photo</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Remarks</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredContainers.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium max-w-[200px]">
                        <span className="truncate block" title={item.notes || ''}>
                          {item.notes || '-'}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {format(new Date(item.date), 'MMM dd, yyyy')}
                      </TableCell>
                      <TableCell>
                        <div className="text-center">
                          {item.photo_url ? (
                            <div className="relative inline-block">
                              <button
                                type="button"
                                onClick={() => {
                                  setPreviewPhotoUrl(item.photo_url);
                                  setZoomLevel(1);
                                }}
                                className="focus:outline-none"
                              >
                                <img 
                                  src={item.photo_url} 
                                  alt="Container" 
                                  className="h-12 w-12 object-cover rounded-xl cursor-pointer hover:opacity-80 transition-all shadow-md"
                                />
                              </button>
                              {canEdit && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeletePhoto(item.id, 'photo');
                                  }}
                                  className="absolute -top-1 -right-1 h-5 w-5 bg-destructive rounded-full flex items-center justify-center hover:bg-destructive/80 transition-all shadow-sm"
                                >
                                  <X className="h-3 w-3 text-white" />
                                </button>
                              )}
                            </div>
                          ) : canEdit ? (
                            <label className="cursor-pointer inline-block">
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => handlePhotoUpload(e, item.id, 'photo')}
                                disabled={uploadingPhotoId === item.id}
                              />
                              <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center hover:bg-muted/80 transition-all mx-auto">
                                {uploadingPhotoId === item.id ? (
                                  <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
                                ) : (
                                  <Camera className="h-5 w-5 text-muted-foreground" />
                                )}
                              </div>
                            </label>
                          ) : (
                            <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center mx-auto">
                              <Camera className="h-5 w-5 text-muted-foreground" />
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {item.date_receive_factory 
                          ? format(new Date(item.date_receive_factory), 'MMM dd, yyyy')
                          : '-'
                        }
                      </TableCell>
                      <TableCell className="text-center">
                        {item.date && item.date_receive_factory 
                          ? differenceInDays(new Date(item.date_receive_factory), new Date(item.date))
                          : '-'
                        }
                      </TableCell>
                      <TableCell>
                        <div className="text-center">
                          {item.receive_photo_url ? (
                            <div className="relative inline-block">
                              <button
                                type="button"
                                onClick={() => {
                                  setPreviewPhotoUrl(item.receive_photo_url);
                                  setZoomLevel(1);
                                }}
                                className="focus:outline-none"
                              >
                                <img 
                                  src={item.receive_photo_url} 
                                  alt="Receive" 
                                  className="h-12 w-12 object-cover rounded-xl cursor-pointer hover:opacity-80 transition-all shadow-md"
                                />
                              </button>
                              {canEdit && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeletePhoto(item.id, 'receive');
                                  }}
                                  className="absolute -top-1 -right-1 h-5 w-5 bg-destructive rounded-full flex items-center justify-center hover:bg-destructive/80 transition-all shadow-sm"
                                >
                                  <X className="h-3 w-3 text-white" />
                                </button>
                              )}
                            </div>
                          ) : canEdit ? (
                            <label className="cursor-pointer inline-block">
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => handlePhotoUpload(e, item.id, 'receive')}
                                disabled={uploadingReceivePhotoId === item.id}
                              />
                              <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center hover:bg-muted/80 transition-all mx-auto">
                                {uploadingReceivePhotoId === item.id ? (
                                  <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
                                ) : (
                                  <Camera className="h-5 w-5 text-muted-foreground" />
                                )}
                              </div>
                            </label>
                          ) : (
                            <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center mx-auto">
                              <Camera className="h-5 w-5 text-muted-foreground" />
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{item.category || '-'}</TableCell>
                      <TableCell>{item.remarks || '-'}</TableCell>
                      <TableCell className="min-w-[240px]">
                        <Select 
                          value={item.status || 'ON PROCESS WAREHOUSE'} 
                          onValueChange={(value) => {
                            updateMutation.mutate({
                              id: item.id,
                              data: { status: value }
                            });
                          }}
                          disabled={!canEdit}
                        >
                          <SelectTrigger className="w-full h-8 bg-background text-xs">
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                          <SelectContent className="bg-background z-50">
                            {STATUS_OPTIONS.map(status => (
                              <SelectItem key={status} value={status} className="text-xs">{status}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => handleView(item)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          {canEdit && (
                            <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {canDelete && (
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="text-destructive hover:text-destructive"
                              onClick={() => deleteMutation.mutate(item.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Container</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date Out Factory *</Label>
                <Input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Date Receive Warehouse</Label>
                <Input
                  type="date"
                  value={formData.date_receive_factory}
                  onChange={(e) => setFormData({ ...formData, date_receive_factory: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Input
                placeholder="Enter category"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Container Name</Label>
              <Input
                placeholder="Enter container name"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Remarks</Label>
              <Textarea
                placeholder="Enter remarks"
                value={formData.remarks}
                onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsAddDialogOpen(false); resetForm(); }}>
              Cancel
            </Button>
            <Button onClick={handleSubmitAdd} disabled={addMutation.isPending}>
              {addMutation.isPending ? 'Adding...' : 'Add Container'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Container</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date Out Factory *</Label>
                <Input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Date Receive Warehouse</Label>
                <Input
                  type="date"
                  value={formData.date_receive_factory}
                  onChange={(e) => setFormData({ ...formData, date_receive_factory: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Input
                placeholder="Enter category"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Container Name</Label>
              <Input
                placeholder="Enter container name"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Remarks</Label>
              <Textarea
                placeholder="Enter remarks"
                value={formData.remarks}
                onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsEditDialogOpen(false); setEditingItem(null); }}>
              Cancel
            </Button>
            <Button onClick={handleSubmitEdit} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Dialog - Allocation Bill Style */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="border-b pb-4">
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2 text-foreground">
                <ContainerIcon className="h-5 w-5" />
                Container Information
              </DialogTitle>
            </div>
            <DialogDescription className="sr-only">Container details and information</DialogDescription>
          </DialogHeader>
          {viewingItem && (
            <div className="space-y-6 py-4" id="container-view-content">
              {/* Title */}
              <div className="text-center border-b pb-4">
                <h2 className="text-xl font-bold tracking-wide text-foreground">CONTAINER INFORMATION</h2>
                <div className="w-full h-px bg-border mt-2" />
              </div>

              {/* Header Info Section */}
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <p className="text-sm">
                    <span className="font-semibold text-foreground">Container:</span>{' '}
                    <span className="text-foreground">{viewingItem.notes || '-'}</span>
                  </p>
                  <p className="text-sm">
                    <span className="font-semibold text-foreground">Category:</span>{' '}
                    <span className="text-foreground">{viewingItem.category || '-'}</span>
                  </p>
                  <p className="text-sm">
                    <span className="font-semibold text-foreground">Remarks:</span>{' '}
                    <span className="text-foreground">{viewingItem.remarks || '-'}</span>
                  </p>
                </div>
                <div className="text-right space-y-1">
                  <p className="text-lg font-bold text-primary">{viewingItem.notes || 'CONTAINER'}</p>
                  <p className="text-sm text-muted-foreground">{format(new Date(viewingItem.date), 'yyyy-MM-dd')}</p>
                </div>
              </div>

              {/* Details Table */}
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-semibold text-foreground">Field</TableHead>
                      <TableHead className="font-semibold text-foreground">Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="font-medium text-muted-foreground">Container Name</TableCell>
                      <TableCell className="text-primary font-medium">{viewingItem.notes || '-'}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium text-muted-foreground">Category</TableCell>
                      <TableCell>{viewingItem.category || '-'}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium text-muted-foreground">Remarks</TableCell>
                      <TableCell>{viewingItem.remarks || '-'}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium text-muted-foreground">Status</TableCell>
                      <TableCell>
                        <span className={cn(
                          "px-2 py-1 rounded text-xs font-medium",
                          viewingItem.status === 'FOR DELIVERY ON STORE' ? 'bg-green-100 text-green-700' :
                          viewingItem.status === 'FOR DISTRIBUTION ON WAREHOUSE' ? 'bg-blue-100 text-blue-700' :
                          'bg-yellow-100 text-yellow-700'
                        )}>
                          {viewingItem.status || 'ON PROCESS WAREHOUSE'}
                        </span>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              {/* Footer Info Section */}
              <div className="border rounded-lg p-4 bg-muted/30">
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div>
                    <p className="text-sm">
                      <span className="font-semibold text-foreground">Date Out Factory:</span>{' '}
                      <span className="text-foreground">{format(new Date(viewingItem.date), 'yyyy-MM-dd')}</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-sm">
                      <span className="font-semibold text-foreground">Date Received:</span>{' '}
                      <span className="text-foreground">
                        {viewingItem.date_receive_factory 
                          ? format(new Date(viewingItem.date_receive_factory), 'yyyy-MM-dd')
                          : '-'
                        }
                      </span>
                    </p>
                  </div>
                  <div>
                    <p className="text-sm">
                      <span className="font-semibold text-foreground">Delivery Days:</span>{' '}
                      <span className="text-primary font-bold">
                        {viewingItem.date && viewingItem.date_receive_factory 
                          ? `${differenceInDays(new Date(viewingItem.date_receive_factory), new Date(viewingItem.date))} days`
                          : '-'
                        }
                      </span>
                    </p>
                  </div>
                </div>
              </div>



              {/* Signature Section */}
              <div className="border-t pt-6 mt-6">
                <div className="grid grid-cols-3 gap-8 text-center">
                  <div>
                    <div className="border-b border-muted-foreground/30 mb-2 h-8" />
                    <p className="text-sm text-muted-foreground italic">Checked By</p>
                  </div>
                  <div>
                    <div className="border-b border-muted-foreground/30 mb-2 h-8" />
                    <p className="text-sm text-muted-foreground italic">Delivered By</p>
                  </div>
                  <div>
                    <div className="border-b border-muted-foreground/30 mb-2 h-8" />
                    <p className="text-sm text-muted-foreground italic">Received By</p>
                  </div>
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="border-t pt-4">
            <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Photo Preview Dialog with Zoom */}
      <Dialog open={!!previewPhotoUrl} onOpenChange={() => { setPreviewPhotoUrl(null); setZoomLevel(1); }}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Photo Preview</span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={handleZoomOut} disabled={zoomLevel <= 0.5}>
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <span className="text-sm min-w-[60px] text-center">{Math.round(zoomLevel * 100)}%</span>
                <Button variant="outline" size="icon" onClick={handleZoomIn} disabled={zoomLevel >= 5}>
                  <ZoomIn className="h-4 w-4" />
                </Button>
              </div>
            </DialogTitle>
          </DialogHeader>
          {previewPhotoUrl && (
            <div className="flex justify-center overflow-auto max-h-[70vh]">
              <img 
                src={previewPhotoUrl} 
                alt="Preview" 
                className="rounded-lg transition-transform duration-200"
                style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'center center' }}
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPreviewPhotoUrl(null); setZoomLevel(1); }}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Container;
