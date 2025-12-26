import { useState } from 'react';
import { StickyNote, Plus, Trash2, Edit2, Save, X, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  color: string;
}

const COLORS = [
  'bg-yellow-100 dark:bg-yellow-900/30 border-yellow-300 dark:border-yellow-700',
  'bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700',
  'bg-green-100 dark:bg-green-900/30 border-green-300 dark:border-green-700',
  'bg-pink-100 dark:bg-pink-900/30 border-pink-300 dark:border-pink-700',
  'bg-purple-100 dark:bg-purple-900/30 border-purple-300 dark:border-purple-700',
  'bg-orange-100 dark:bg-orange-900/30 border-orange-300 dark:border-orange-700',
];

const STORAGE_KEY = 'app-notes';

const Notes = () => {
  const { toast } = useToast();
  const [notes, setNotes] = useState<Note[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        return JSON.parse(saved).map((note: Note) => ({
          ...note,
          createdAt: new Date(note.createdAt),
          updatedAt: new Date(note.updatedAt),
        }));
      } catch {
        return [];
      }
    }
    return [];
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);

  const saveNotes = (updatedNotes: Note[]) => {
    setNotes(updatedNotes);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedNotes));
  };

  const handleCreateNote = () => {
    if (!newTitle.trim() && !newContent.trim()) {
      toast({ title: 'Error', description: 'Please enter a title or content', variant: 'destructive' });
      return;
    }

    const newNote: Note = {
      id: crypto.randomUUID(),
      title: newTitle.trim() || 'Untitled',
      content: newContent.trim(),
      createdAt: new Date(),
      updatedAt: new Date(),
      color: selectedColor,
    };

    saveNotes([newNote, ...notes]);
    setNewTitle('');
    setNewContent('');
    setIsCreating(false);
    setSelectedColor(COLORS[0]);
    toast({ title: 'Success', description: 'Note created' });
  };

  const handleEditNote = (note: Note) => {
    setEditingId(note.id);
    setEditTitle(note.title);
    setEditContent(note.content);
  };

  const handleSaveEdit = (noteId: string) => {
    if (!editTitle.trim() && !editContent.trim()) {
      toast({ title: 'Error', description: 'Please enter a title or content', variant: 'destructive' });
      return;
    }

    const updatedNotes = notes.map(note =>
      note.id === noteId
        ? { ...note, title: editTitle.trim() || 'Untitled', content: editContent.trim(), updatedAt: new Date() }
        : note
    );

    saveNotes(updatedNotes);
    setEditingId(null);
    toast({ title: 'Success', description: 'Note updated' });
  };

  const handleDeleteNote = (noteId: string) => {
    if (!confirm('Are you sure you want to delete this note?')) return;
    saveNotes(notes.filter(note => note.id !== noteId));
    toast({ title: 'Success', description: 'Note deleted' });
  };

  const filteredNotes = notes.filter(note =>
    note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    note.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button onClick={() => setIsCreating(true)} disabled={isCreating} className="gap-2">
          <Plus className="h-4 w-4" />
          New Note
        </Button>
      </div>

      {/* Create Note Form */}
      {isCreating && (
        <Card className="border-2 border-dashed border-primary/50 animate-scale-in">
          <CardHeader className="pb-3">
            <Input
              placeholder="Note title..."
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="text-lg font-semibold border-none p-0 h-auto focus-visible:ring-0"
            />
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              placeholder="Write your note here..."
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              rows={4}
              className="resize-none"
            />
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Color:</span>
              {COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setSelectedColor(color)}
                  className={`h-6 w-6 rounded-full border-2 transition-transform ${color} ${
                    selectedColor === color ? 'scale-125 ring-2 ring-primary' : 'hover:scale-110'
                  }`}
                />
              ))}
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => { setIsCreating(false); setNewTitle(''); setNewContent(''); }}>
                <X className="h-4 w-4 mr-1" />
                Cancel
              </Button>
              <Button size="sm" onClick={handleCreateNote}>
                <Save className="h-4 w-4 mr-1" />
                Save Note
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Notes Grid */}
      {filteredNotes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <StickyNote className="h-16 w-16 text-muted-foreground/40 mb-4" />
          <h3 className="text-lg font-medium text-muted-foreground">
            {searchQuery ? 'No notes found' : 'No notes yet'}
          </h3>
          <p className="text-sm text-muted-foreground/60 mt-1">
            {searchQuery ? 'Try a different search term' : 'Click "New Note" to create your first note'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredNotes.map((note, index) => (
            <Card
              key={note.id}
              className={`${note.color} border transition-all duration-300 hover:shadow-lg hover:-translate-y-1`}
              style={{ animation: `fade-in 0.3s ease-out ${index * 50}ms forwards`, opacity: 0 }}
            >
              {editingId === note.id ? (
                <CardContent className="p-4 space-y-3">
                  <Input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="font-semibold"
                    placeholder="Title"
                  />
                  <Textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    rows={4}
                    className="resize-none"
                    placeholder="Content"
                  />
                  <div className="flex gap-2 justify-end">
                    <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                      <X className="h-4 w-4" />
                    </Button>
                    <Button size="sm" onClick={() => handleSaveEdit(note.id)}>
                      <Save className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              ) : (
                <>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-semibold line-clamp-1 text-foreground">
                      {note.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-4 mb-3">
                      {note.content || 'No content'}
                    </p>
                    <div className="flex items-center justify-between pt-2 border-t border-foreground/10">
                      <span className="text-xs text-muted-foreground">
                        {format(note.updatedAt, 'MMM d, yyyy')}
                      </span>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 transition-transform hover:scale-110"
                          onClick={() => handleEditNote(note)}
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive transition-transform hover:scale-110"
                          onClick={() => handleDeleteNote(note.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default Notes;
