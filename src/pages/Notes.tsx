import { useState, useEffect, useMemo, useCallback, useTransition } from 'react';
import { StickyNote, Plus, Trash2, Edit2, Save, X, Search, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useDebounce } from '@/hooks/useDebounce';

interface Note {
  id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
  color: string;
}

const COLORS = [
  { value: 'yellow', label: 'Yellow', class: 'bg-yellow-500' },
  { value: 'blue', label: 'Blue', class: 'bg-blue-500' },
  { value: 'green', label: 'Green', class: 'bg-green-500' },
  { value: 'pink', label: 'Pink', class: 'bg-pink-500' },
  { value: 'purple', label: 'Purple', class: 'bg-purple-500' },
  { value: 'orange', label: 'Orange', class: 'bg-orange-500' },
];

const ITEMS_PER_PAGE = 15;

const Notes = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formColor, setFormColor] = useState('yellow');
  const [currentPage, setCurrentPage] = useState(1);
  const [isPending, startTransition] = useTransition();

  const debouncedSearch = useDebounce(searchQuery, 350);

  const fetchNotes = async () => {
    try {
      const { data, error } = await supabase
        .from('notes')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setNotes(data || []);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotes();
  }, []);

  const filteredNotes = useMemo(() => {
    if (!debouncedSearch.trim()) return notes;
    const query = debouncedSearch.toLowerCase();
    return notes.filter(note =>
      note.title.toLowerCase().includes(query) ||
      note.content.toLowerCase().includes(query)
    );
  }, [notes, debouncedSearch]);

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
    setFormColor('yellow');
    setEditingNote(null);
    setIsCreateOpen(true);
  };

  const openEditDialog = (note: Note) => {
    setFormTitle(note.title);
    setFormContent(note.content);
    setFormColor(note.color || 'yellow');
    setEditingNote(note);
    setIsCreateOpen(true);
  };

  const closeDialog = () => {
    setIsCreateOpen(false);
    setEditingNote(null);
    setFormTitle('');
    setFormContent('');
    setFormColor('yellow');
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
            color: formColor,
          })
          .eq('id', editingNote.id);

        if (error) throw error;

        setNotes(notes.map(note =>
          note.id === editingNote.id
            ? { ...note, title: formTitle.trim() || 'Untitled', content: formContent.trim(), color: formColor, updated_at: new Date().toISOString() }
            : note
        ));
        toast({ title: 'Success', description: 'Note updated' });
      } else {
        const { data, error } = await supabase
          .from('notes')
          .insert({
            user_id: user.id,
            title: formTitle.trim() || 'Untitled',
            content: formContent.trim(),
            color: formColor,
          })
          .select()
          .single();

        if (error) throw error;

        setNotes([data, ...notes]);
        toast({ title: 'Success', description: 'Note created' });
      }
      closeDialog();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (noteId: string) => {
    if (!confirm('Are you sure you want to delete this note?')) return;

    try {
      const { error } = await supabase
        .from('notes')
        .delete()
        .eq('id', noteId);

      if (error) throw error;

      setNotes(notes.filter(note => note.id !== noteId));
      toast({ title: 'Success', description: 'Note deleted' });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const getColorClass = (color: string) => {
    return COLORS.find(c => c.value === color)?.class || 'bg-yellow-500';
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
        <div className="flex items-center gap-3">
          {filteredNotes.length > 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{filteredNotes.length} note{filteredNotes.length !== 1 ? 's' : ''}</span>
              {isPending && (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              )}
            </div>
          )}
          <Button onClick={openCreateDialog} className="gap-2">
            <Plus className="h-4 w-4" />
            New Note
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden overflow-x-auto transition-all duration-300">
        <Table>
          <TableHeader>
            <TableRow className="transition-all duration-300">
              <TableHead className="w-[50px]">Color</TableHead>
              <TableHead className="w-[200px]">Title</TableHead>
              <TableHead>Content</TableHead>
              <TableHead className="w-[150px]">Date Created</TableHead>
              <TableHead className="w-[150px]">Last Updated</TableHead>
              <TableHead className="w-[100px] text-center">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedNotes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12">
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
                  <TableCell>
                    <div className={`h-4 w-4 rounded-full ${getColorClass(note.color)}`} />
                  </TableCell>
                  <TableCell className="font-medium">{note.title || 'Untitled'}</TableCell>
                  <TableCell className="max-w-[300px] truncate text-muted-foreground">
                    {note.content || 'No content'}
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
                        onClick={() => openEditDialog(note)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive transition-transform hover:scale-110"
                        onClick={() => handleDelete(note.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
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

      {/* Create/Edit Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editingNote ? 'Edit Note' : 'Create New Note'}</DialogTitle>
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
              <label className="text-sm font-medium">Content</label>
              <Textarea
                placeholder="Write your note here..."
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                rows={5}
                className="resize-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Color</label>
              <div className="flex items-center gap-2">
                {COLORS.map((color) => (
                  <button
                    key={color.value}
                    onClick={() => setFormColor(color.value)}
                    className={`h-8 w-8 rounded-full ${color.class} border-2 transition-transform ${
                      formColor === color.value ? 'scale-125 ring-2 ring-primary ring-offset-2' : 'hover:scale-110'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              {editingNote ? 'Save Changes' : 'Create Note'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Notes;
