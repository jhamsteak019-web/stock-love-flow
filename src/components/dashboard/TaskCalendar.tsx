import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Plus, X, CalendarDays, ListTodo } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek, isToday } from 'date-fns';
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
  { value: 'blue', label: 'Blue', bg: 'bg-blue-500', text: 'text-blue-700', light: 'bg-blue-100' },
  { value: 'green', label: 'Green', bg: 'bg-green-500', text: 'text-green-700', light: 'bg-green-100' },
  { value: 'orange', label: 'Orange', bg: 'bg-orange-500', text: 'text-orange-700', light: 'bg-orange-100' },
  { value: 'purple', label: 'Purple', bg: 'bg-purple-500', text: 'text-purple-700', light: 'bg-purple-100' },
  { value: 'red', label: 'Red', bg: 'bg-red-500', text: 'text-red-700', light: 'bg-red-100' },
  { value: 'cyan', label: 'Cyan', bg: 'bg-cyan-500', text: 'text-cyan-700', light: 'bg-cyan-100' },
];

const getColorClasses = (color: string) => {
  const found = colorOptions.find(c => c.value === color);
  return found || colorOptions[0];
};

const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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

  // Get tasks for current month
  const currentMonthTasks = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    return tasks.filter(task => {
      const taskDate = new Date(task.task_date);
      return taskDate >= monthStart && taskDate <= monthEnd;
    });
  }, [tasks, currentDate]);

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
  const goToToday = () => setCurrentDate(new Date());

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

  // Get dates with tasks for mini calendar highlights
  const datesWithTasks = useMemo(() => {
    return tasks.map(task => new Date(task.task_date));
  }, [tasks]);

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* Left Sidebar - Mini Calendar & Summary */}
      <div className="lg:w-80 space-y-4 flex-shrink-0">
        {/* Mini Calendar */}
        <Card className="overflow-hidden">
          <CardHeader className="pb-2 bg-primary/5">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CalendarDays className="h-4 w-4" />
              {format(currentDate, 'MMMM yyyy')}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2">
            <Calendar
              mode="single"
              selected={selectedDate || undefined}
              onSelect={(date) => date && openCreateModal(date)}
              month={currentDate}
              onMonthChange={setCurrentDate}
              className="pointer-events-auto"
              modifiers={{
                hasTask: datesWithTasks,
              }}
              modifiersClassNames={{
                hasTask: 'bg-primary/20 font-bold',
              }}
            />
          </CardContent>
        </Card>

        {/* Task Summary */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ListTodo className="h-4 w-4" />
              This Month's Tasks ({currentMonthTasks.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[250px]">
              <div className="px-4 pb-4 space-y-2">
                {currentMonthTasks.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No tasks scheduled this month
                  </p>
                ) : (
                  currentMonthTasks.map((task) => {
                    const colors = getColorClasses(task.color);
                    return (
                      <div
                        key={task.id}
                        onClick={(e) => openEditModal(task, e)}
                        className={cn(
                          "p-3 rounded-lg cursor-pointer transition-all hover:shadow-md border-l-4",
                          colors.light,
                          `border-l-${task.color}-500`
                        )}
                        style={{ borderLeftColor: `var(--${task.color}-500, ${task.color === 'blue' ? '#3b82f6' : task.color === 'green' ? '#22c55e' : task.color === 'orange' ? '#f97316' : task.color === 'purple' ? '#a855f7' : task.color === 'red' ? '#ef4444' : '#06b6d4'})` }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{task.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(task.task_date), 'MMM d, yyyy')}
                            </p>
                          </div>
                          {canDelete && (
                            <button
                              onClick={(e) => handleDelete(task.id, e)}
                              className="p-1 hover:bg-destructive/10 rounded transition-colors"
                            >
                              <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Main Calendar View */}
      <Card className="flex-1 overflow-hidden">
        {/* Header */}
        <CardHeader className="pb-4 flex flex-row items-center justify-between space-y-0 border-b">
          <div className="flex items-center gap-4">
            <CardTitle className="text-xl font-bold">
              {format(currentDate, 'MMMM yyyy')}
            </CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center border rounded-lg overflow-hidden">
              <Button variant="ghost" size="icon" onClick={handlePrevMonth} className="rounded-none h-8 w-8">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={handleNextMonth} className="rounded-none h-8 w-8">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <Button variant="outline" size="sm" onClick={goToToday}>
              Today
            </Button>
            {canEdit && (
              <Button size="sm" onClick={() => openCreateModal(new Date())}>
                <Plus className="h-4 w-4 mr-1" />
                Add Task
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {/* Day Headers */}
          <div className="grid grid-cols-7 border-b bg-muted/30">
            {dayHeaders.map((day, index) => (
              <div 
                key={day} 
                className={cn(
                  "py-3 text-center text-sm font-semibold",
                  index === 0 && "text-red-500",
                  index === 6 && "text-blue-500"
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
                {week.map((day, dayIndex) => {
                  const dayTasks = getTasksForDay(day);
                  const isCurrentMonth = isSameMonth(day, currentDate);
                  const isTodayDate = isToday(day);

                  return (
                    <div
                      key={day.toISOString()}
                      onClick={() => openCreateModal(day)}
                      className={cn(
                        "min-h-[120px] p-2 transition-all cursor-pointer hover:bg-accent/50 group relative",
                        !isCurrentMonth && "bg-muted/30 opacity-50",
                        isTodayDate && "bg-primary/5 ring-2 ring-primary/20 ring-inset",
                        !canEdit && "cursor-default"
                      )}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <span
                          className={cn(
                            "text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full transition-colors",
                            dayIndex === 0 && "text-red-500",
                            dayIndex === 6 && "text-blue-500",
                            isTodayDate && "bg-primary text-primary-foreground shadow-sm"
                          )}
                        >
                          {format(day, 'd')}
                        </span>
                      </div>
                      <div className="space-y-1">
                        {dayTasks.slice(0, 3).map((task) => {
                          const colors = getColorClasses(task.color);
                          return (
                            <div
                              key={task.id}
                              className={cn(
                                "text-xs px-2 py-1 rounded-md truncate cursor-pointer hover:opacity-80 transition-all font-medium flex items-center gap-1 group/task shadow-sm",
                                colors.bg,
                                "text-white"
                              )}
                              title={task.title}
                              onClick={(e) => openEditModal(task, e)}
                            >
                              <span className="flex-1 truncate">{task.title}</span>
                              {canDelete && (
                                <button
                                  onClick={(e) => handleDelete(task.id, e)}
                                  className="opacity-0 group-hover/task:opacity-100 hover:text-red-200 transition-opacity flex-shrink-0"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          );
                        })}
                        {dayTasks.length > 3 && (
                          <Badge variant="secondary" className="text-xs py-0 h-5">
                            +{dayTasks.length - 3} more
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

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
              <div className="flex gap-2 flex-wrap">
                {colorOptions.map((color) => (
                  <button
                    key={color.value}
                    type="button"
                    onClick={() => setFormData({ ...formData, color: color.value })}
                    className={cn(
                      "w-8 h-8 rounded-full transition-all",
                      color.bg,
                      formData.color === color.value && "ring-2 ring-offset-2 ring-primary scale-110"
                    )}
                    title={color.label}
                  />
                ))}
              </div>
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
