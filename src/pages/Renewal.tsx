import React, { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, differenceInDays } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { useToast } from '@/hooks/use-toast';
import { useActivityLog } from '@/hooks/useActivityLog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Search, RefreshCcw, Upload, X, Eye, ZoomIn, ZoomOut, Check, Clock, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RenewalEmployee {
  id: string;
  employee_id: string | null;
  full_name: string;
  branch: string | null;
  branch_id: string | null;
  category: string | null;
  position: string | null;
  employment_status: string;
  date_hired: string;
  photo_url: string | null;
  last_renewal_date: string | null;
  renewal_photos: string[] | null;
}

const Renewal = () => {
  const { user, userRole } = useAuth();
  const { selectedBranch } = useBranch();
  const { toast } = useToast();
  const { logActivity } = useActivityLog();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState('');
  const [isRenewModalOpen, setIsRenewModalOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<RenewalEmployee | null>(null);
  const [newEmployeeId, setNewEmployeeId] = useState('');
  const [renewalPhotos, setRenewalPhotos] = useState<File[]>([]);
  const [renewalPhotoPreviews, setRenewalPhotoPreviews] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [viewingPhoto, setViewingPhoto] = useState<{ url: string; name: string } | null>(null);
  const [photoZoomLevel, setPhotoZoomLevel] = useState(1);
  const [viewingEmployee, setViewingEmployee] = useState<RenewalEmployee | null>(null);

  const isAdmin = userRole === 'admin';
  const isStaff = userRole === 'staff';
  const isHR = userRole === 'hr';
  const isAssistant = userRole === 'assistant';
  const canRenew = isAdmin || isStaff || isHR || isAssistant;

  const globalBranchId = selectedBranch?.id || null;

  // Fetch employees that need renewal (1+ month since date_hired or last_renewal_date)
  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['renewal-employees'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('id, employee_id, full_name, branch, branch_id, category, position, employment_status, date_hired, photo_url, last_renewal_date, renewal_photos')
        .is('deleted_at', null)
        .eq('is_active', true)
        .neq('employment_status', 'Resigned')
        .order('full_name');

      if (error) throw error;
      return (data || []) as RenewalEmployee[];
    }
  });

  // Filter employees needing renewal: 30+ days since hire or last renewal
  const needsRenewal = useMemo(() => {
    const now = new Date();
    return employees.filter(emp => {
      if (globalBranchId && emp.branch_id !== globalBranchId) return false;
      
      const referenceDate = emp.last_renewal_date ? new Date(emp.last_renewal_date) : new Date(emp.date_hired);
      const daysSince = differenceInDays(now, referenceDate);
      
      if (daysSince < 30) return false;

      const matchesSearch = !searchQuery ||
        emp.employee_id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        emp.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        emp.branch?.toLowerCase().includes(searchQuery.toLowerCase());

      return matchesSearch;
    });
  }, [employees, globalBranchId, searchQuery]);

  // Recently renewed (last 7 days)
  const recentlyRenewed = useMemo(() => {
    const now = new Date();
    return employees.filter(emp => {
      if (globalBranchId && emp.branch_id !== globalBranchId) return false;
      if (!emp.last_renewal_date) return false;
      const daysSince = differenceInDays(now, new Date(emp.last_renewal_date));
      return daysSince < 7;
    });
  }, [employees, globalBranchId]);

  const handleOpenRenew = (emp: RenewalEmployee) => {
    setSelectedEmployee(emp);
    setNewEmployeeId(emp.employee_id || '');
    setRenewalPhotos([]);
    setRenewalPhotoPreviews([]);
    setIsRenewModalOpen(true);
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (renewalPhotos.length + files.length > 3) {
      toast({ title: 'Maximum 3 photos allowed', variant: 'destructive' });
      return;
    }
    const newPhotos = [...renewalPhotos, ...files].slice(0, 3);
    setRenewalPhotos(newPhotos);
    
    const previews = newPhotos.map(f => URL.createObjectURL(f));
    setRenewalPhotoPreviews(previews);
    if (e.target) e.target.value = '';
  };

  const removePhoto = (index: number) => {
    const newPhotos = [...renewalPhotos];
    newPhotos.splice(index, 1);
    setRenewalPhotos(newPhotos);
    
    const newPreviews = [...renewalPhotoPreviews];
    URL.revokeObjectURL(newPreviews[index]);
    newPreviews.splice(index, 1);
    setRenewalPhotoPreviews(newPreviews);
  };

  const renewMutation = useMutation({
    mutationFn: async () => {
      if (!selectedEmployee || !newEmployeeId.trim()) throw new Error('Employee ID is required');
      if (renewalPhotos.length === 0) throw new Error('At least 1 photo is required as proof');

      setUploading(true);

      // Upload photos
      const photoUrls: string[] = [];
      for (const file of renewalPhotos) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${selectedEmployee.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('renewal-photos')
          .upload(fileName, file);
        
        if (uploadError) throw uploadError;
        
        const { data: urlData } = supabase.storage
          .from('renewal-photos')
          .getPublicUrl(fileName);
        
        photoUrls.push(urlData.publicUrl);
      }

      // Update employee
      const { error } = await supabase
        .from('employees')
        .update({
          employee_id: newEmployeeId.trim(),
          last_renewal_date: new Date().toISOString().split('T')[0],
          renewal_photos: photoUrls,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedEmployee.id);

      if (error) throw error;
      return { employeeName: selectedEmployee.full_name, newId: newEmployeeId };
    },
    onSuccess: (data) => {
      toast({ title: `Employee ID renewed for ${data.employeeName}`, description: `New ID: ${data.newId}` });
      logActivity('renew_employee_id', `Renewed employee ID for ${data.employeeName} to ${data.newId}`, 'manpower');
      queryClient.invalidateQueries({ queryKey: ['renewal-employees'] });
      queryClient.invalidateQueries({ queryKey: ['manpower-employees'] });
      setIsRenewModalOpen(false);
      setSelectedEmployee(null);
      setRenewalPhotos([]);
      setRenewalPhotoPreviews([]);
      setUploading(false);
    },
    onError: (error: any) => {
      toast({ title: 'Renewal failed', description: error.message, variant: 'destructive' });
      setUploading(false);
    }
  });

  const getDaysSinceRenewal = (emp: RenewalEmployee) => {
    const ref = emp.last_renewal_date ? new Date(emp.last_renewal_date) : new Date(emp.date_hired);
    return differenceInDays(new Date(), ref);
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <RefreshCcw className="h-6 w-6 text-primary" />
            Employee ID Renewal
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Employees needing ID renewal (30+ days since last renewal or date hired)
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{needsRenewal.length}</p>
                <p className="text-xs text-muted-foreground">Needs Renewal</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Check className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{recentlyRenewed.length}</p>
                <p className="text-xs text-muted-foreground">Recently Renewed (7 days)</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted">
                <Clock className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{employees.length}</p>
                <p className="text-xs text-muted-foreground">Total Active Employees</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search employee..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-base">Employees Needing ID Renewal ({needsRenewal.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="w-full">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">Photo</TableHead>
                  <TableHead>Employee Name</TableHead>
                  <TableHead>Current ID</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Position</TableHead>
                  <TableHead>Days Since</TableHead>
                  <TableHead>Last Renewal</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading...</TableCell>
                  </TableRow>
                ) : needsRenewal.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No employees need renewal at this time.
                    </TableCell>
                  </TableRow>
                ) : (
                  needsRenewal.map(emp => {
                    const days = getDaysSinceRenewal(emp);
                    return (
                      <TableRow key={emp.id}>
                        <TableCell>
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={emp.photo_url || ''} />
                            <AvatarFallback className="text-xs bg-muted">{emp.full_name.charAt(0)}</AvatarFallback>
                          </Avatar>
                        </TableCell>
                        <TableCell className="font-medium">{emp.full_name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-xs">
                            {emp.employee_id || 'N/A'}
                          </Badge>
                        </TableCell>
                        <TableCell>{emp.branch || '-'}</TableCell>
                        <TableCell>{emp.position || '-'}</TableCell>
                        <TableCell>
                          <Badge variant={days > 60 ? 'destructive' : 'secondary'} className="text-xs">
                            {days} days
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {emp.last_renewal_date ? format(new Date(emp.last_renewal_date), 'MMM dd, yyyy') : 'Never'}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {canRenew && (
                              <Button size="sm" variant="default" className="h-7 text-xs gap-1" onClick={() => handleOpenRenew(emp)}>
                                <RefreshCcw className="h-3 w-3" /> Renew
                              </Button>
                            )}
                            {emp.renewal_photos && emp.renewal_photos.length > 0 && (
                              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => setViewingEmployee(emp)}>
                                <Eye className="h-3 w-3" /> Photos
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Renew Modal */}
      <Dialog open={isRenewModalOpen} onOpenChange={setIsRenewModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Renew Employee ID</DialogTitle>
          </DialogHeader>
          {selectedEmployee && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={selectedEmployee.photo_url || ''} />
                  <AvatarFallback>{selectedEmployee.full_name.charAt(0)}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium text-sm">{selectedEmployee.full_name}</p>
                  <p className="text-xs text-muted-foreground">Current ID: {selectedEmployee.employee_id || 'N/A'}</p>
                </div>
              </div>

              <div>
                <Label>New Employee ID <span className="text-destructive">*</span></Label>
                <Input
                  value={newEmployeeId}
                  onChange={e => setNewEmployeeId(e.target.value)}
                  placeholder="Enter new employee ID"
                  className="mt-1"
                />
              </div>

              <div>
                <Label>Upload Proof Photos (max 3) <span className="text-destructive">*</span></Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {renewalPhotoPreviews.map((preview, i) => (
                    <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border border-border">
                      <img src={preview} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                      <button
                        onClick={() => removePhoto(i)}
                        className="absolute top-0.5 right-0.5 bg-destructive text-destructive-foreground rounded-full p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  {renewalPhotos.length < 3 && (
                    <button
                      onClick={() => photoInputRef.current?.click()}
                      className="w-20 h-20 rounded-lg border-2 border-dashed border-border hover:border-primary flex items-center justify-center transition-colors"
                    >
                      <Upload className="h-5 w-5 text-muted-foreground" />
                    </button>
                  )}
                </div>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handlePhotoSelect}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRenewModalOpen(false)}>Cancel</Button>
            <Button
              onClick={() => renewMutation.mutate()}
              disabled={uploading || !newEmployeeId.trim() || renewalPhotos.length === 0}
            >
              {uploading ? 'Renewing...' : 'Confirm Renewal'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Renewal Photos Modal */}
      <Dialog open={!!viewingEmployee} onOpenChange={() => setViewingEmployee(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Renewal Photos - {viewingEmployee?.full_name}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-3">
            {viewingEmployee?.renewal_photos?.map((url, i) => (
              <div
                key={i}
                className="aspect-square rounded-lg overflow-hidden border border-border cursor-pointer hover:ring-2 hover:ring-primary transition-all"
                onClick={() => setViewingPhoto({ url, name: `Renewal Photo ${i + 1}` })}
              >
                <img src={url} alt={`Renewal ${i + 1}`} className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Full Photo Viewer */}
      <Dialog open={!!viewingPhoto} onOpenChange={() => { setViewingPhoto(null); setPhotoZoomLevel(1); }}>
        <DialogContent className="max-w-3xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              {viewingPhoto?.name}
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => setPhotoZoomLevel(z => Math.max(0.5, z - 0.25))}>
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <span className="text-xs text-muted-foreground w-12 text-center">{Math.round(photoZoomLevel * 100)}%</span>
                <Button size="sm" variant="ghost" onClick={() => setPhotoZoomLevel(z => Math.min(3, z + 0.25))}>
                  <ZoomIn className="h-4 w-4" />
                </Button>
              </div>
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-auto max-h-[70vh] flex items-center justify-center">
            {viewingPhoto && (
              <img
                src={viewingPhoto.url}
                alt={viewingPhoto.name}
                style={{ transform: `scale(${photoZoomLevel})`, transformOrigin: 'center' }}
                className="max-w-full transition-transform"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Renewal;
