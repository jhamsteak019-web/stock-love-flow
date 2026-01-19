import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Plus, Pencil, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek } from 'date-fns';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { toast } from 'sonner';

interface Task {
  id: string;
  title: string;
  description: string | null;
  task_date: string;
  color: string;
  created_by: string;
  branch_id: string | null;
}

const colorOptions = [
  { value: 'blue', label: 'Blue', class: 'bg-blue-500 text-white' },
  { value: 'green', label: 'Green', class: 'bg-green-500 text-white' },
  { value: 'orange', label: 'Orange', class: 'bg-orange-500 text-white' },
  { value: 'purple', label: 'Purple', class: 'bg-purple-500 text-white' },
  { value: 'red', label: 'Red', class: 'bg-red-500 text-white' },
  { value: 'cyan', label: 'Cyan', class: 'bg-cyan-500 text-white' },
];

const colorClasses: Record<string, string> = {
  blue: 'bg-blue-500 text-white',
  green: 'bg-green-500 text-white',
  orange: 'bg-orange-500 text-white',
  purple: 'bg-purple-500 text-white',
  red: 'bg-red-500 text-white',
  cyan: 'bg-cyan-500 text-white',
};

const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dayHeaderColors = [
  'bg-cyan-600',
  'bg-cyan-500',
  'bg-cyan-400',
  'bg-cyan-500',
  'bg-cyan-400',
  'bg-cyan-500',
  'bg-cyan-600',
];

export function TaskCalendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [formData, setFormData] = useState({ title: '', description: '', color: 'blue' });
  
  const { user, userRole } = useAuth();
  const { selectedBranch } = useBranch();
  const queryClient = useQueryClient();
  
  const canEdit = userRole === 'admin' || userRole === 'staff' || userRole === 'uploader';
  const canDelete = userRole === 'admin';

  // Fetch tasks
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks', selectedBranch?.id],
    queryFn: async () => {
      let query = supabase.from('tasks').select('*').order('task_date', { ascending: true });
      
      if (selectedBranch) {
        query = query.eq('branch_id', selectedBranch.id);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as Task[];
    },
  });

  // Create task mutation
  const createMutation = useMutation({
    mutationFn: async (taskData: { title: string; description: string; color: string; task_date: string }) => {
      const { error } = await supabase.from('tasks').insert({
        title: taskData.title,
        description: taskData.description || null,
        color: taskData.color,
        task_date: taskData.task_date,
        created_by: user?.id,
        branch_id: selectedBranch?.id || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success('Task created successfully');
      closeModal();
    },
    onError: (error: Error) => {
      toast.error('Failed to create task: ' + error.message);
    },
  });

  // Update task mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, ...taskData }: { id: string; title: string; description: string; color: string }) => {
      const { error } = await supabase.from('tasks').update({
        title: taskData.title,
        description: taskData.description || null,
        color: taskData.color,
      }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success('Task updated successfully');
      closeModal();
    },
    onError: (error: Error) => {
      toast.error('Failed to update task: ' + error.message);
    },
  });

  // Delete task mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tasks').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success('Task deleted successfully');
    },
    onError: (error: Error) => {
      toast.error('Failed to delete task: ' + error.message);
    },
  });

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calendarStart = startOfWeek(monthStart);
    const calendarEnd = endOfWeek(monthEnd);
    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  }, [currentDate]);

  const getTasksForDay = (day: Date) => {
    const dateStr = format(day, 'yyyy-MM-dd');
    return tasks.filter(task => task.task_date === dateStr);
  };

  const handlePrevMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const handleNextMonth = () => setCurrentDate(addMonths(currentDate, 1));

  const weeks = useMemo(() => {
    const result: Date[][] = [];
    for (let i = 0; i < calendarDays.length; i += 7) {
      result.push(calendarDays.slice(i, i + 7));
    }
    return result;
  }, [calendarDays]);

  const openCreateModal = (date: Date) => {
    if (!canEdit) return;
    setSelectedDate(date);
    setEditingTask(null);
    setFormData({ title: '', description: '', color: 'blue' });
    setIsModalOpen(true);
  };

  const openEditModal = (task: Task, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canEdit) return;
    setEditingTask(task);
    setFormData({
      title: task.title,
      description: task.description || '',
      color: task.color,
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingTask(null);
    setSelectedDate(null);
    setFormData({ title: '', description: '', color: 'blue' });
  };

  const handleSubmit = () => {
    if (!formData.title.trim()) {
      toast.error('Please enter a task title');
      return;
    }

    if (editingTask) {
      updateMutation.mutate({
        id: editingTask.id,
        title: formData.title,
        description: formData.description,
        color: formData.color,
      });
    } else if (selectedDate) {
      createMutation.mutate({
        title: formData.title,
        description: formData.description,
        color: formData.color,
        task_date: format(selectedDate, 'yyyy-MM-dd'),
      });
    }
  };

  const handleDelete = (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canDelete) {
      toast.error('Only admins can delete tasks');
      return;
    }
    if (confirm('Are you sure you want to delete this task?')) {
      deleteMutation.mutate(taskId);
    }
  };

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={handlePrevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-lg font-semibold min-w-[140px] text-center">
            {format(currentDate, 'MMMM yyyy')}
          </h2>
          <Button variant="ghost" size="icon" onClick={handleNextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Button 
          variant="outline" 
          size="sm"
          onClick={() => setCurrentDate(new Date())}
        >
          Today
        </Button>
      </div>

      {/* Day Headers */}
      <div className="grid grid-cols-7">
        {dayHeaders.map((day, index) => (
          <div 
            key={day} 
            className={cn(
              "py-3 text-center text-sm font-semibold text-white",
              dayHeaderColors[index]
            )}
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="divide-y divide-border">
        {weeks.map((week, weekIndex) => (
          <div key={weekIndex} className="grid grid-cols-7 divide-x divide-border">
            {week.map((day) => {
              const dayTasks = getTasksForDay(day);
              const isCurrentMonth = isSameMonth(day, currentDate);
              const isToday = isSameDay(day, new Date());

              return (
                <div
                  key={day.toISOString()}
                  onClick={() => openCreateModal(day)}
                  className={cn(
                    "min-h-[100px] p-2 transition-colors cursor-pointer hover:bg-muted/30",
                    !isCurrentMonth && "bg-muted/20",
                    isToday && "bg-primary/5",
                    !canEdit && "cursor-default"
                  )}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span
                      className={cn(
                        "text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full",
                        !isCurrentMonth && "text-muted-foreground",
                        isToday && "bg-primary text-primary-foreground"
                      )}
                    >
                      {format(day, 'd')}
                    </span>
                    {canEdit && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          openCreateModal(day);
                        }}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  <div className="space-y-1">
                    {dayTasks.slice(0, 2).map((task) => (
                      <div
                        key={task.id}
                        className={cn(
                          "text-xs px-2 py-1 rounded truncate cursor-pointer hover:opacity-80 transition-opacity group flex items-center gap-1",
                          colorClasses[task.color] || colorClasses.blue
                        )}
                        title={task.title}
                        onClick={(e) => openEditModal(task, e)}
                      >
                        <span className="flex-1 truncate">{task.title}</span>
                        {canDelete && (
                          <button
                            onClick={(e) => handleDelete(task.id, e)}
                            className="opacity-0 group-hover:opacity-100 hover:text-red-200 transition-opacity"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    ))}
                    {dayTasks.length > 2 && (
                      <div className="text-xs text-muted-foreground px-1">
                        +{dayTasks.length - 2} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Task Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingTask ? 'Edit Task' : `New Task - ${selectedDate ? format(selectedDate, 'MMM d, yyyy') : ''}`}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Title</label>
              <Input
                placeholder="Task title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <Textarea
                placeholder="Task description (optional)"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Color</label>
              <Select value={formData.color} onValueChange={(value) => setFormData({ ...formData, color: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {colorOptions.map((color) => (
                    <SelectItem key={color.value} value={color.value}>
                      <div className="flex items-center gap-2">
                        <div className={cn("w-4 h-4 rounded", color.class)} />
                        <span>{color.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={closeModal}>
              Cancel
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {editingTask ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
