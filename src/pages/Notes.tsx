import { useState, useEffect, useMemo, useCallback, useTransition, useRef } from 'react';
import { StickyNote, Plus, Trash2, Edit2, Save, X, Search, Loader2, ChevronLeft, ChevronRight, CheckCircle, Clock, Calendar, Hourglass, FileCheck, Eye, FileDown, RotateCcw, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { useDebounce } from '@/hooks/useDebounce';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { toast as sonnerToast } from 'sonner';
import { exportToExcel } from '@/lib/excelExport';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

type NoteStatus = 'pending' | 'waiting_to_follow' | 'waiting_approval' | 'approved';

interface Note {
  id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
  color: string;
  concern: string;
  status: NoteStatus;
  user_id: string;
  is_public: boolean;
  deleted_at: string | null;
  profiles?: {
    full_name: string | null;
    email: string;
  };
}

const STATUS_OPTIONS: { value: NoteStatus; label: string; icon: React.ComponentType<{ className?: string }>; bgClass: string; textClass: string }[] = [
  { value: 'pending', label: 'Pending', icon: Clock, bgClass: 'bg-yellow-500 hover:bg-yellow-600', textClass: 'text-black' },
  { value: 'waiting_to_follow', label: 'Waiting to Follow', icon: Hourglass, bgClass: 'bg-blue-500 hover:bg-blue-600', textClass: 'text-white' },
  { value: 'waiting_approval', label: 'Waiting Approval', icon: FileCheck, bgClass: 'bg-orange-500 hover:bg-orange-600', textClass: 'text-white' },
  { value: 'approved', label: 'Approved', icon: CheckCircle, bgClass: 'bg-green-500 hover:bg-green-600', textClass: 'text-white' },
];


const ITEMS_PER_PAGE = 15;

const Notes = () => {
  const { toast } = useToast();
  const { user, userRole } = useAuth();
  const { selectedBranch } = useBranch();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const isAdmin = userRole === 'admin';
  const isStaff = userRole === 'staff';
  const canExport = userRole !== 'uploader';
  const canAdd = isAdmin || isStaff; // Staff can input
  const canEdit = isAdmin; // Only admin can edit
  const canDelete = isAdmin; // Only admin can delete
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formConcern, setFormConcern] = useState('');
  const [formIsPublic, setFormIsPublic] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [isPending, startTransition] = useTransition();
  const [viewingNote, setViewingNote] = useState<Note | null>(null);
  const [statusChangeNote, setStatusChangeNote] = useState<{ id: string; status: NoteStatus; currentDate: string } | null>(null);
  const [selectedStatusDate, setSelectedStatusDate] = useState<Date | undefined>(undefined);
  const [isExporting, setIsExporting] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState('active');
  const [deletedNotes, setDeletedNotes] = useState<Note[]>([]);

  // Month/Year filter state
  const currentDate = new Date();
  const [selectedMonth, setSelectedMonth] = useState<number>(currentDate.getMonth());
  const [selectedYear, setSelectedYear] = useState<number>(currentDate.getFullYear());


  const debouncedSearch = useDebounce(searchQuery, 350);

  const fetchNotes = useCallback(async () => {
    try {
      // Fetch active notes - filtered by branch
      let activeQuery = supabase
        .from('notes')
        .select('*, profiles(full_name, email)')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (selectedBranch) {
        activeQuery = activeQuery.eq('branch_id', selectedBranch.id);
      }

      const { data, error } = await activeQuery;

      if (error) throw error;
      setNotes((data || []).map(note => ({
        ...note,
        status: note.status as NoteStatus,
        profiles: note.profiles as { full_name: string | null; email: string } | undefined
      })));

      // Fetch deleted notes - filtered by branch
      let deletedQuery = supabase
        .from('notes')
        .select('*, profiles(full_name, email)')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false });

      if (selectedBranch) {
        deletedQuery = deletedQuery.eq('branch_id', selectedBranch.id);
      }

      const { data: deleted, error: deletedError } = await deletedQuery;

      if (deletedError) throw deletedError;
      setDeletedNotes((deleted || []).map(note => ({
        ...note,
        status: note.status as NoteStatus,
        profiles: note.profiles as { full_name: string | null; email: string } | undefined
      })));
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [selectedBranch, toast]);

  useEffect(() => {
    fetchNotes();

    // Subscribe to realtime updates for status changes
    const channel = supabase
      .channel('notes-status-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notes'
        },
        (payload) => {
          setNotes(prev => prev.map(note =>
            note.id === payload.new.id
              ? { ...note, ...payload.new, status: payload.new.status as NoteStatus }
              : note
          ));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedBranch, fetchNotes]);

  const filteredNotes = useMemo(() => {
    // First filter by month/year
    const monthYearFiltered = notes.filter(note => {
      const noteDate = new Date(note.created_at);
      return noteDate.getMonth() === selectedMonth && noteDate.getFullYear() === selectedYear;
    });
    
    // Then filter by search
    if (!debouncedSearch.trim()) return monthYearFiltered;
    const query = debouncedSearch.toLowerCase();
    return monthYearFiltered.filter(note =>
      note.title.toLowerCase().includes(query) ||
      note.content.toLowerCase().includes(query)
    );
  }, [notes, debouncedSearch, selectedMonth, selectedYear]);

  const handleExportPDF = async () => {
    if (!tableRef.current) return;
    
    setIsExporting(true);
    sonnerToast.info('Generating PDF...');
    
    try {
      const canvas = await html2canvas(tableRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });
      
      const imgWidth = 297;
      const pageHeight = 210;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;
      
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      
      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }
      
      const monthName = MONTHS[selectedMonth];
      pdf.save(`reminders-${monthName}-${selectedYear}.pdf`);
      sonnerToast.success('PDF exported successfully!');
    } catch (error) {
      console.error('PDF export error:', error);
      sonnerToast.error('Failed to export PDF');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportExcel = async () => {
    setIsExporting(true);
    sonnerToast.info('Generating Excel...');
    
    try {
      const excelData = filteredNotes.map(note => ({
        title: note.title || 'Untitled',
        concern: note.concern || '-',
        content: note.content || 'No content',
        created_by: note.profiles?.full_name || note.profiles?.email?.split('@')[0] || 'Unknown',
        status: STATUS_OPTIONS.find(s => s.value === note.status)?.label || note.status,
        created_at: format(new Date(note.created_at), 'MMM dd, yyyy'),
        updated_at: format(new Date(note.updated_at), 'MMM dd, yyyy'),
      }));

      await exportToExcel({
        title: 'Reminders Report',
        subtitle: `${MONTHS[selectedMonth]} ${selectedYear}`,
        filename: `reminders-${MONTHS[selectedMonth]}-${selectedYear}`,
        columns: [
          { header: 'Title', key: 'title', width: 25 },
          { header: 'Concern', key: 'concern', width: 20 },
          { header: 'Remarks', key: 'content', width: 40 },
          { header: 'Created By', key: 'created_by', width: 18 },
          { header: 'Status', key: 'status', width: 18 },
          { header: 'Date Created', key: 'created_at', width: 15 },
          { header: 'Last Updated', key: 'updated_at', width: 15 },
        ],
        data: excelData,
      });
      sonnerToast.success('Excel exported successfully!');
    } catch (error) {
      console.error('Excel export error:', error);
      sonnerToast.error('Failed to export Excel');
    } finally {
      setIsExporting(false);
    }
  };

  const totalPages = Math.ceil(filteredNotes.length / ITEMS_PER_PAGE);
  const paginatedNotes = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredNotes.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredNotes, currentPage]);

  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    startTransition(() => {
      setCurrentPage(1);
    });
  }, []);

  const goToPage = useCallback((page: number) => {
    startTransition(() => {
      setCurrentPage(Math.max(1, Math.min(page, totalPages)));
    });
  }, [totalPages]);

  const openCreateDialog = () => {
    setFormTitle('');
    setFormContent('');
    setFormConcern('');
    setFormIsPublic(false);
    setEditingNote(null);
    setIsCreateOpen(true);
  };

  const openEditDialog = (note: Note) => {
    setFormTitle(note.title);
    setFormContent(note.content);
    setFormConcern(note.concern || '');
    setFormIsPublic(note.is_public || false);
    setEditingNote(note);
    setIsCreateOpen(true);
  };

  const closeDialog = () => {
    setIsCreateOpen(false);
    setEditingNote(null);
    setFormTitle('');
    setFormContent('');
    setFormConcern('');
    setFormIsPublic(false);
  };

  const handleSave = async () => {
    if (!formTitle.trim() && !formContent.trim()) {
      toast({ title: 'Error', description: 'Please enter a title or content', variant: 'destructive' });
      return;
    }

    if (!user) {
      toast({ title: 'Error', description: 'You must be logged in', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      if (editingNote) {
        const { error } = await supabase
          .from('notes')
          .update({
            title: formTitle.trim() || 'Untitled',
            content: formContent.trim(),
            concern: formConcern.trim(),
            is_public: isAdmin ? formIsPublic : editingNote.is_public,
          })
          .eq('id', editingNote.id);

        if (error) throw error;

        setNotes(notes.map(note =>
          note.id === editingNote.id
            ? { ...note, title: formTitle.trim() || 'Untitled', content: formContent.trim(), concern: formConcern.trim(), is_public: isAdmin ? formIsPublic : editingNote.is_public, updated_at: new Date().toISOString() }
            : note
        ));
        toast({ title: 'Success', description: 'Reminder updated' });
      } else {
        const { data, error } = await supabase
          .from('notes')
          .insert({
            user_id: user.id,
            title: formTitle.trim() || 'Untitled',
            content: formContent.trim(),
            concern: formConcern.trim(),
            is_public: isAdmin ? formIsPublic : false,
            branch_id: selectedBranch?.id || null,
          })
          .select()
          .single();

        if (error) throw error;

        setNotes([{ ...data, status: data.status as NoteStatus, is_public: data.is_public }, ...notes]);
        
        // Notify all admins when non-admin creates a note
        if (!isAdmin) {
          const { data: adminUsers } = await supabase
            .from('user_roles')
            .select('user_id')
            .eq('role', 'admin');
          
          if (adminUsers && adminUsers.length > 0) {
            const notifications = adminUsers.map(admin => ({
              user_id: admin.user_id,
              title: 'New Reminder Created',
              message: `${user.email} created a new reminder: "${formTitle.trim() || 'Untitled'}"`,
              type: 'info',
              link: '/notes',
              created_by: user.id,
            }));
            
            await supabase.from('notifications').insert(notifications);
          }
        }
        
        toast({ title: 'Success', description: 'Reminder created' });
      }
      closeDialog();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // Soft delete (move to recently deleted)
  const handleSoftDelete = async (noteId: string) => {
    try {
      const { error } = await supabase
        .from('notes')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', noteId);

      if (error) throw error;

      const deletedNote = notes.find(note => note.id === noteId);
      if (deletedNote) {
        setNotes(notes.filter(note => note.id !== noteId));
        setDeletedNotes([{ ...deletedNote, deleted_at: new Date().toISOString() }, ...deletedNotes]);
      }
      toast({ title: 'Success', description: 'Moved to recently deleted' });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  // Restore from recently deleted
  const handleRestore = async (noteId: string) => {
    try {
      const { error } = await supabase
        .from('notes')
        .update({ deleted_at: null })
        .eq('id', noteId);

      if (error) throw error;

      const restoredNote = deletedNotes.find(note => note.id === noteId);
      if (restoredNote) {
        setDeletedNotes(deletedNotes.filter(note => note.id !== noteId));
        setNotes([{ ...restoredNote, deleted_at: null }, ...notes]);
      }
      toast({ title: 'Success', description: 'Reminder restored' });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  // Permanent delete
  const handleDelete = async (noteId: string) => {
    if (!confirm('Are you sure you want to permanently delete this note?')) return;

    try {
      const { error } = await supabase
        .from('notes')
        .delete()
        .eq('id', noteId);

      if (error) throw error;

      setDeletedNotes(deletedNotes.filter(note => note.id !== noteId));
      toast({ title: 'Success', description: 'Permanently deleted' });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const handleStatusChange = async (noteId: string, newStatus: NoteStatus) => {
    // Show calendar dialog for admin to optionally set a new date
    const note = notes.find(n => n.id === noteId);
    if (note) {
      setStatusChangeNote({ id: noteId, status: newStatus, currentDate: note.updated_at });
      setSelectedStatusDate(new Date(note.updated_at));
    }
  };

  const confirmStatusChange = async () => {
    if (!statusChangeNote) return;
    
    try {
      const updateData: { status: NoteStatus; updated_at?: string } = { 
        status: statusChangeNote.status 
      };
      
      // Only update the date if admin selected a different date
      if (selectedStatusDate) {
        updateData.updated_at = selectedStatusDate.toISOString();
      }

      const { error } = await supabase
        .from('notes')
        .update(updateData)
        .eq('id', statusChangeNote.id);

      if (error) throw error;

      setNotes(notes.map(note =>
        note.id === statusChangeNote.id 
          ? { 
              ...note, 
              status: statusChangeNote.status,
              ...(selectedStatusDate && { updated_at: selectedStatusDate.toISOString() })
            } 
          : note
      ));
      toast({ title: 'Success', description: 'Status updated' });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setStatusChangeNote(null);
      setSelectedStatusDate(undefined);
    }
  };

  const handleUpdateDate = async (noteId: string, newDate: Date, field: 'created_at' | 'updated_at') => {
    try {
      const { error } = await supabase
        .from('notes')
        .update({ [field]: newDate.toISOString() })
        .eq('id', noteId);

      if (error) throw error;

      setNotes(notes.map(note =>
        note.id === noteId ? { ...note, [field]: newDate.toISOString() } : note
      ));
      toast({ title: 'Success', description: 'Date updated' });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };


  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Tabs for Active / Recently Deleted */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="active" className="flex items-center gap-2">
            Active ({notes.length})
          </TabsTrigger>
          <TabsTrigger value="deleted" className="flex items-center gap-2">
            <Trash2 className="h-4 w-4" />
            Recently Deleted ({deletedNotes.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search notes..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-10 pr-10"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
              onClick={() => handleSearchChange('')}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Month/Year Filter */}
          <div className="flex items-center gap-2 bg-muted/50 border border-border rounded-lg px-3 py-1.5">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <Select value={selectedMonth.toString()} onValueChange={(val) => setSelectedMonth(parseInt(val))}>
              <SelectTrigger className="w-[110px] h-8 border-0 bg-transparent focus:ring-0">
                <SelectValue placeholder="Month" />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((month, index) => (
                  <SelectItem key={index} value={index.toString()}>{month}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedYear.toString()} onValueChange={(val) => setSelectedYear(parseInt(val))}>
              <SelectTrigger className="w-[80px] h-8 border-0 bg-transparent focus:ring-0">
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                {[2024, 2025, 2026].map((year) => (
                  <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {filteredNotes.length > 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{filteredNotes.length} note{filteredNotes.length !== 1 ? 's' : ''}</span>
              {isPending && (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              )}
            </div>
          )}
          
          {canExport && (
            <Button variant="outline" size="sm" onClick={handleExportExcel} disabled={isExporting || filteredNotes.length === 0}>
              {isExporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 mr-2" />}
              Save Excel
            </Button>
          )}
          {canExport && (
            <Button variant="outline" size="sm" onClick={handleExportPDF} disabled={isExporting || filteredNotes.length === 0}>
              {isExporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileDown className="h-4 w-4 mr-2" />}
              Save PDF
            </Button>
          )}
          
          {canAdd && (
            <Button onClick={openCreateDialog} className="gap-2">
              <Plus className="h-4 w-4" />
              New Reminder
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <div ref={tableRef} className="rounded-xl border bg-card shadow-sm overflow-hidden overflow-x-auto transition-all duration-300">
        <Table>
          <TableHeader>
            <TableRow className="transition-all duration-300">
              <TableHead className="w-[200px]">Title</TableHead>
              <TableHead className="w-[150px]">Concern</TableHead>
              <TableHead>Remarks</TableHead>
              <TableHead className="w-[150px]">Created By</TableHead>
              <TableHead className="w-[180px]">Status</TableHead>
              <TableHead className="w-[120px]">Date Created</TableHead>
              <TableHead className="w-[120px]">Last Updated</TableHead>
              <TableHead className="w-[120px] text-center">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedNotes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12">
                  <StickyNote className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
                  <p className="text-muted-foreground">
                    {debouncedSearch ? 'No matching notes found' : 'No notes yet'}
                  </p>
                  {!debouncedSearch && (
                    <p className="text-sm text-muted-foreground/60 mt-1">
                      Click "New Note" to create your first note
                    </p>
                  )}
                </TableCell>
              </TableRow>
            ) : (
              paginatedNotes.map((note, index) => (
                <TableRow
                  key={note.id}
                  className="transition-all duration-300 ease-out hover:bg-muted/50"
                  style={{ animation: `fade-in 0.3s ease-out ${index * 30}ms forwards`, opacity: 0 }}
                >
                  <TableCell className="font-medium">{note.title || 'Untitled'}</TableCell>
                  <TableCell className="text-muted-foreground">{note.concern || '-'}</TableCell>
                  <TableCell className="max-w-[250px] truncate text-muted-foreground">
                    {note.content || 'No content'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {note.profiles?.full_name || note.profiles?.email?.split('@')[0] || 'Unknown'}
                  </TableCell>
                  <TableCell>
                    {isAdmin && note.status !== 'approved' ? (
                      <Select
                        value={note.status}
                        onValueChange={(value: NoteStatus) => handleStatusChange(note.id, value)}
                      >
                        <SelectTrigger className="w-[170px] h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              <div className="flex items-center gap-2">
                                <option.icon className="h-3 w-3" />
                                {option.label}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      (() => {
                        const statusOption = STATUS_OPTIONS.find(s => s.value === note.status) || STATUS_OPTIONS[0];
                        return (
                          <Badge 
                            variant="secondary"
                            className={`${statusOption.bgClass} ${statusOption.textClass}`}
                          >
                            <statusOption.icon className="h-3 w-3 mr-1" />
                            {statusOption.label}
                          </Badge>
                        );
                      })()
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {format(new Date(note.created_at), 'MMM d, yyyy')}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {format(new Date(note.updated_at), 'MMM d, yyyy')}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 transition-transform hover:scale-110"
                        onClick={() => setViewingNote(note)}
                        title="View details"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 transition-transform hover:scale-110"
                          onClick={() => openEditDialog(note)}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive transition-transform hover:scale-110"
                          onClick={() => handleSoftDelete(note.id)}
                          title="Move to recently deleted"
                        >
                          <Trash2 className="h-4 w-4" />
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-2">
          <div className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 1 || isPending}
              className="h-8 w-8"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage === totalPages || isPending}
              className="h-8 w-8"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
        </TabsContent>

        {/* Recently Deleted Tab */}
        <TabsContent value="deleted" className="space-y-6">
          <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">Title</TableHead>
                  <TableHead className="w-[150px]">Concern</TableHead>
                  <TableHead>Remarks</TableHead>
                  <TableHead className="w-[150px]">Deleted At</TableHead>
                  <TableHead className="w-[120px] text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deletedNotes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12">
                      <Trash2 className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
                      <p className="text-muted-foreground">No deleted reminders</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  deletedNotes.map((note) => (
                    <TableRow key={note.id} className="hover:bg-muted/50">
                      <TableCell className="font-medium">{note.title || 'Untitled'}</TableCell>
                      <TableCell className="text-muted-foreground">{note.concern || '-'}</TableCell>
                      <TableCell className="max-w-[250px] truncate text-muted-foreground">
                        {note.content || 'No content'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {note.deleted_at && format(new Date(note.deleted_at), 'MMM d, yyyy h:mm a')}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-green-600 hover:text-green-700"
                            onClick={() => handleRestore(note.id)}
                            title="Restore"
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                title="Delete permanently"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Permanently Delete?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently delete "{note.title || 'Untitled'}". This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDelete(note.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Delete Permanently
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* Create/Edit Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editingNote ? 'Edit Reminder' : 'Create New Reminder'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Title</label>
              <Input
                placeholder="Note title..."
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Concern</label>
              <Input
                placeholder="Enter concern..."
                value={formConcern}
                onChange={(e) => setFormConcern(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Remarks</label>
              <Textarea
                placeholder="Write your remarks here..."
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                rows={5}
                className="resize-none"
              />
            </div>
            {isAdmin && (
              <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/50">
                <div className="space-y-0.5">
                  <Label htmlFor="is-public" className="text-sm font-medium">Staff View</Label>
                  <p className="text-xs text-muted-foreground">Make this reminder visible to all staff</p>
                </div>
                <Switch
                  id="is-public"
                  checked={formIsPublic}
                  onCheckedChange={setFormIsPublic}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              {editingNote ? 'Save Changes' : 'Create Reminder'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={!!viewingNote} onOpenChange={(open) => !open && setViewingNote(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {viewingNote?.title || 'Untitled'}
            </DialogTitle>
          </DialogHeader>
          {viewingNote && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Status</label>
                <div>
                  {(() => {
                    const statusOption = STATUS_OPTIONS.find(s => s.value === viewingNote.status) || STATUS_OPTIONS[0];
                    return (
                      <Badge 
                        variant="secondary"
                        className={`${statusOption.bgClass} ${statusOption.textClass}`}
                      >
                        <statusOption.icon className="h-3 w-3 mr-1" />
                        {statusOption.label}
                      </Badge>
                    );
                  })()}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Remarks</label>
                <p className="text-sm whitespace-pre-wrap bg-muted/50 p-3 rounded-lg">
                  {viewingNote.content || 'No remarks'}
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Created By</label>
                <p className="text-sm">
                  {viewingNote.profiles?.full_name || viewingNote.profiles?.email || 'Unknown'}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Date Created</label>
                  <p className="text-sm">{format(new Date(viewingNote.created_at), 'MMM d, yyyy')}</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Last Updated</label>
                  <p className="text-sm">{format(new Date(viewingNote.updated_at), 'MMM d, yyyy')}</p>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewingNote(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Status Change Date Picker Dialog */}
      <Dialog open={!!statusChangeNote} onOpenChange={(open) => {
        if (!open) {
          setStatusChangeNote(null);
          setSelectedStatusDate(undefined);
        }
      }}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Update Status
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground mb-4">
              Select a date for "Last Updated" (optional):
            </p>
            <CalendarComponent
              mode="single"
              selected={selectedStatusDate}
              onSelect={setSelectedStatusDate}
              initialFocus
              className="rounded-md border pointer-events-auto"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => {
              setStatusChangeNote(null);
              setSelectedStatusDate(undefined);
            }}>
              Cancel
            </Button>
            <Button onClick={confirmStatusChange}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Notes;
