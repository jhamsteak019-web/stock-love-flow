import React, { useState, useMemo, useRef } from 'react';
import { ChevronLeft, ChevronRight, Plus, X, CalendarDays, ListTodo, Grid3X3, LayoutList, Printer, ImageDown } from 'lucide-react';
import html2canvas from 'html2canvas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek, isToday, addWeeks, subWeeks } from 'date-fns';
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
  category?: string | null;
}

// Schedule categories with emojis
const scheduleCategories = [
  { value: 'all', label: 'All Schedules', emoji: '📋' },
  { value: 'event', label: 'Event Sched', emoji: '✈️' },
  { value: 'daily', label: 'Daily Sched', emoji: '📅' },
  { value: 'roving', label: 'Roving Sched', emoji: '🚗' },
  { value: 'ccn', label: 'CCN Sched', emoji: '📦' },
];

const colorOptions = [
  { value: 'blue', label: 'Blue', bg: 'bg-blue-500', text: 'text-blue-700', light: 'bg-blue-50', border: 'border-blue-500', hex: '#3b82f6' },
  { value: 'green', label: 'Green', bg: 'bg-green-500', text: 'text-green-700', light: 'bg-green-50', border: 'border-green-500', hex: '#22c55e' },
  { value: 'orange', label: 'Orange', bg: 'bg-orange-500', text: 'text-orange-700', light: 'bg-orange-50', border: 'border-orange-500', hex: '#f97316' },
  { value: 'purple', label: 'Purple', bg: 'bg-purple-500', text: 'text-purple-700', light: 'bg-purple-50', border: 'border-purple-500', hex: '#a855f7' },
  { value: 'red', label: 'Red', bg: 'bg-red-500', text: 'text-red-700', light: 'bg-red-50', border: 'border-red-500', hex: '#ef4444' },
  { value: 'cyan', label: 'Cyan', bg: 'bg-cyan-500', text: 'text-cyan-700', light: 'bg-cyan-50', border: 'border-cyan-500', hex: '#06b6d4' },
];

const getColorClasses = (color: string) => {
  const found = colorOptions.find(c => c.value === color);
  return found || colorOptions[0];
};

const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type ViewMode = 'month' | 'week';

export function TaskCalendar() {
  const calendarRef = React.useRef<HTMLDivElement>(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [viewingDate, setViewingDate] = useState<Date | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [formData, setFormData] = useState({ title: '', description: '', color: 'blue', category: 'event' });
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  
  const { user, userRole } = useAuth();
  const { selectedBranch } = useBranch();
  const queryClient = useQueryClient();
  
  const canEdit = userRole === 'admin' || userRole === 'staff' || userRole === 'uploader' || userRole === 'assistant';
  const canDelete = userRole === 'admin';

  // Print to PDF function
  const handlePrintCalendar = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('Please allow popups to print');
      return;
    }

    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calendarStart = startOfWeek(monthStart);
    const calendarEnd = endOfWeek(monthEnd);
    const allDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
    
    // Group days into weeks
    const printWeeks: Date[][] = [];
    for (let i = 0; i < allDays.length; i += 7) {
      printWeeks.push(allDays.slice(i, i + 7));
    }

    const tasksHtml = printWeeks.map((week) => {
      const weekCells = week.map((day, dayIndex) => {
        const dayTasks = getTasksForDay(day);
        const isCurrentMonth = isSameMonth(day, currentDate);
        const isTodayDate = isToday(day);
        
        const dayColor = dayIndex === 0 ? '#ef4444' : dayIndex === 6 ? '#3b82f6' : '#000';
        
        const tasksListHtml = dayTasks.map(task => {
          const colorClass = getColorClasses(task.color);
          return `
            <div style="background: ${colorClass.hex}; color: white; padding: 4px 8px; border-radius: 4px; margin-bottom: 4px; font-size: 11px;">
              <div style="font-weight: 600;">${task.title}</div>
              ${task.description ? `<div style="font-size: 10px; opacity: 0.9; margin-top: 2px;">${task.description}</div>` : ''}
            </div>
          `;
        }).join('');

        return `
          <td style="
            border: 1px solid #e5e7eb; 
            padding: 8px; 
            vertical-align: top; 
            width: 14.28%; 
            height: 120px;
            ${!isCurrentMonth ? 'background: #f9fafb; opacity: 0.6;' : ''}
            ${isTodayDate ? 'background: #eff6ff;' : ''}
          ">
            <div style="display: flex; justify-content: flex-start; margin-bottom: 6px;">
              <span style="
                font-weight: 600; 
                font-size: 14px; 
                color: ${dayColor};
                ${isTodayDate ? 'background: #3b82f6; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center;' : ''}
              ">
                ${format(day, 'd')}
              </span>
            </div>
            <div>${tasksListHtml}</div>
          </td>
        `;
      }).join('');

      return `<tr>${weekCells}</tr>`;
    }).join('');

    const headerCells = dayHeaders.map((day, index) => {
      const color = index === 0 ? '#ef4444' : index === 6 ? '#3b82f6' : '#374151';
      return `<th style="padding: 12px; text-align: center; font-weight: 600; font-size: 13px; color: ${color}; background: #f3f4f6; border: 1px solid #e5e7eb;">${day}</th>`;
    }).join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Task Calendar - ${format(currentDate, 'MMMM yyyy')}</title>
          <style>
            @page { 
              size: landscape; 
              margin: 15mm;
            }
            * { 
              margin: 0; 
              padding: 0; 
              box-sizing: border-box; 
            }
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
              padding: 20px; 
              color: #000; 
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            .header { 
              text-align: center; 
              margin-bottom: 20px; 
              padding-bottom: 15px;
              border-bottom: 2px solid #3b82f6;
            }
            .header h1 { 
              font-size: 28px; 
              font-weight: 700; 
              color: #1f2937;
              margin-bottom: 5px;
            }
            .header p {
              font-size: 12px;
              color: #6b7280;
            }
            table { 
              width: 100%; 
              border-collapse: collapse; 
              table-layout: fixed;
            }
            .footer {
              margin-top: 15px;
              text-align: center;
              font-size: 10px;
              color: #9ca3af;
            }
            @media print {
              body { padding: 0; }
              .header { margin-bottom: 15px; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>📅 Task Calendar</h1>
            <p>${format(currentDate, 'MMMM yyyy')}${selectedBranch ? ` • ${selectedBranch.name}` : ''}</p>
          </div>
          
          <table>
            <thead>
              <tr>${headerCells}</tr>
            </thead>
            <tbody>
              ${tasksHtml}
            </tbody>
          </table>
          
          <div class="footer">
            Printed on ${format(new Date(), 'MMMM d, yyyy h:mm a')}
          </div>
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 300);
  };

  // Save to Image function
  const handleSaveToImage = async () => {
    if (!calendarRef.current) {
      toast.error('Calendar not found');
      return;
    }

    try {
      toast.info('Generating image...');
      
      const canvas = await html2canvas(calendarRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
      });
      
      const link = document.createElement('a');
      link.download = `task-calendar-${format(currentDate, 'yyyy-MM')}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      
      toast.success('Calendar saved as image!');
    } catch (error) {
      console.error('Failed to save image:', error);
      toast.error('Failed to save calendar as image');
    }
  };

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
      const inRange = taskDate >= monthStart && taskDate <= monthEnd;
      const matchesCategory = categoryFilter === 'all' || task.category === categoryFilter || (!task.category && categoryFilter === 'event');
      return inRange && matchesCategory;
    });
  }, [tasks, currentDate, categoryFilter]);

  // Create task mutation
  const createMutation = useMutation({
    mutationFn: async (taskData: { title: string; description: string; color: string; task_date: string; category: string }) => {
      const { error } = await supabase.from('tasks').insert({
        title: taskData.title,
        description: taskData.description || null,
        color: taskData.color,
        task_date: taskData.task_date,
        created_by: user?.id,
        branch_id: selectedBranch?.id || null,
        category: taskData.category,
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

  // Calendar days for month view
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calendarStart = startOfWeek(monthStart);
    const calendarEnd = endOfWeek(monthEnd);
    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  }, [currentDate]);

  // Week days for week view
  const weekDays = useMemo(() => {
    const weekStart = startOfWeek(currentDate);
    const weekEnd = endOfWeek(currentDate);
    return eachDayOfInterval({ start: weekStart, end: weekEnd });
  }, [currentDate]);

  const getTasksForDay = (day: Date) => {
    const dateStr = format(day, 'yyyy-MM-dd');
    return tasks.filter(task => {
      const matchesDate = task.task_date === dateStr;
      const matchesCategory = categoryFilter === 'all' || task.category === categoryFilter || (!task.category && categoryFilter === 'event');
      return matchesDate && matchesCategory;
    });
  };

  const handlePrevMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const handleNextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const handlePrevWeek = () => setCurrentDate(subWeeks(currentDate, 1));
  const handleNextWeek = () => setCurrentDate(addWeeks(currentDate, 1));
  const goToToday = () => setCurrentDate(new Date());

  const handlePrev = () => viewMode === 'month' ? handlePrevMonth() : handlePrevWeek();
  const handleNext = () => viewMode === 'month' ? handleNextMonth() : handleNextWeek();

  const weeks = useMemo(() => {
    const result: Date[][] = [];
    for (let i = 0; i < calendarDays.length; i += 7) {
      result.push(calendarDays.slice(i, i + 7));
    }
    return result;
  }, [calendarDays]);

  const openViewModal = (date: Date) => {
    setViewingDate(date);
    setIsViewModalOpen(true);
  };

  const closeViewModal = () => {
    setIsViewModalOpen(false);
    setViewingDate(null);
  };

  const openCreateModal = (date: Date) => {
    if (!canEdit) return;
    setSelectedDate(date);
    setEditingTask(null);
    setFormData({ title: '', description: '', color: 'blue', category: categoryFilter === 'all' ? 'event' : categoryFilter });
    setIsModalOpen(true);
  };

  const openCreateFromViewModal = () => {
    if (!canEdit || !viewingDate) return;
    setSelectedDate(viewingDate);
    setEditingTask(null);
    setFormData({ title: '', description: '', color: 'blue', category: categoryFilter === 'all' ? 'event' : categoryFilter });
    setIsViewModalOpen(false);
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
      category: task.category || 'event',
    });
    setIsViewModalOpen(false);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingTask(null);
    setSelectedDate(null);
    setFormData({ title: '', description: '', color: 'blue', category: categoryFilter === 'all' ? 'event' : categoryFilter });
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
        category: formData.category,
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

  // Get selected sidebar date
  const [sidebarSelectedDate, setSidebarSelectedDate] = useState<Date | null>(null);
  const selectedDayTasks = sidebarSelectedDate ? getTasksForDay(sidebarSelectedDate) : [];

  // Get category info for a task
  const getCategoryInfo = (category?: string | null) => {
    const cat = scheduleCategories.find(c => c.value === (category || 'event'));
    return cat || scheduleCategories[1]; // default to event
  };

  return (
    <div className="w-full">
      {/* Main Calendar View */}
      <Card ref={calendarRef} className="w-full overflow-hidden shadow-sm">
        {/* Header */}
        <CardHeader className="pb-4 flex flex-row items-center justify-between space-y-0 border-b bg-muted/30">
          <div className="flex items-center gap-4">
            <CardTitle className="text-xl font-bold">
              {viewMode === 'month' 
                ? format(currentDate, 'MMMM yyyy')
                : `Week of ${format(startOfWeek(currentDate), 'MMM d')} - ${format(endOfWeek(currentDate), 'MMM d, yyyy')}`
              }
            </CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {/* View Mode Toggle */}
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
              <TabsList className="h-8">
                <TabsTrigger value="month" className="text-xs px-3 h-7">
                  <Grid3X3 className="h-3.5 w-3.5 mr-1" />
                  Month
                </TabsTrigger>
                <TabsTrigger value="week" className="text-xs px-3 h-7">
                  <LayoutList className="h-3.5 w-3.5 mr-1" />
                  Week
                </TabsTrigger>
              </TabsList>
            </Tabs>
            
            <div className="flex items-center border rounded-lg overflow-hidden">
              <Button variant="ghost" size="icon" onClick={handlePrev} className="rounded-none h-8 w-8">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={handleNext} className="rounded-none h-8 w-8">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <Button variant="outline" size="sm" onClick={goToToday}>
              Today
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrintCalendar}>
              <Printer className="h-4 w-4 mr-1" />
              Print PDF
            </Button>
            <Button variant="outline" size="sm" onClick={handleSaveToImage}>
              <ImageDown className="h-4 w-4 mr-1" />
              Save Image
            </Button>
            {canEdit && (
              <Button size="sm" onClick={() => openCreateModal(new Date())}>
                <Plus className="h-4 w-4 mr-1" />
                Add Task
              </Button>
            )}
          </div>
        </CardHeader>

        {/* Category Tabs */}
        <div className="px-4 py-3 border-b bg-muted/20">
          <div className="flex flex-wrap items-center gap-2">
            {scheduleCategories.map((cat) => (
              <Button
                key={cat.value}
                variant={categoryFilter === cat.value ? "default" : "outline"}
                size="sm"
                onClick={() => setCategoryFilter(cat.value)}
                className="h-8"
              >
                <span className="mr-1.5">{cat.emoji}</span>
                {cat.label}
              </Button>
            ))}
          </div>
        </div>

        <CardContent className="p-0">
          {viewMode === 'month' ? (
            <>
              {/* Day Headers */}
              <div className="grid grid-cols-7 border-b bg-muted/50">
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

              {/* Month Calendar Grid */}
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
                          onClick={() => openViewModal(day)}
                          className={cn(
                            "min-h-[160px] p-2 transition-all cursor-pointer hover:bg-accent/50 group relative",
                            !isCurrentMonth && "bg-muted/20 opacity-60",
                            isTodayDate && "bg-primary/5 dark:bg-primary/10"
                          )}
                        >
                          <div className="flex justify-between items-start mb-1">
                            <span
                              className={cn(
                                "text-sm font-medium w-6 h-6 flex items-center justify-center rounded-full transition-colors",
                                dayIndex === 0 && "text-red-500",
                                dayIndex === 6 && "text-blue-500",
                                isTodayDate && "bg-primary text-primary-foreground shadow-sm"
                              )}
                            >
                              {format(day, 'd')}
                            </span>
                          </div>
                          <div className="space-y-0.5">
                            {dayTasks.slice(0, 3).map((task) => {
                              const colors = getColorClasses(task.color);
                              const catInfo = getCategoryInfo(task.category);
                              return (
                                <div
                                  key={task.id}
                                  className={cn(
                                    "text-xs px-1.5 py-0.5 rounded truncate cursor-pointer hover:opacity-80 transition-all font-medium group/task",
                                    colors.bg,
                                    "text-white"
                                  )}
                                  title={`${task.title}${task.description ? ` - ${task.description}` : ''}`}
                                  onClick={(e) => openEditModal(task, e)}
                                >
                                  <span className="truncate">{task.title}</span>
                                </div>
                              );
                            })}
                            {dayTasks.length > 3 && (
                              <Badge variant="secondary" className="text-[10px] py-0 h-4 px-1">
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
            </>
          ) : (
            /* Week View - Shows descriptions */
            <>
              {/* Day Headers for Week View */}
              <div className="grid grid-cols-7 border-b bg-muted/50">
                {weekDays.map((day, index) => {
                  const isTodayDate = isToday(day);
                  return (
                    <div 
                      key={day.toISOString()} 
                      className={cn(
                        "py-3 text-center border-r last:border-r-0",
                        index === 0 && "text-red-500",
                        index === 6 && "text-blue-500"
                      )}
                    >
                      <div className="text-xs font-medium text-muted-foreground uppercase">
                        {format(day, 'EEE')}
                      </div>
                      <div className={cn(
                        "text-lg font-bold mt-1 w-8 h-8 flex items-center justify-center mx-auto rounded-full",
                        isTodayDate && "bg-primary text-primary-foreground"
                      )}>
                        {format(day, 'd')}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Week View Content - Taller cells with descriptions */}
              <div className="grid grid-cols-7 divide-x divide-border min-h-[400px]">
                {weekDays.map((day, dayIndex) => {
                  const dayTasks = getTasksForDay(day);
                  const isTodayDate = isToday(day);

                  return (
                    <div
                      key={day.toISOString()}
                      onClick={() => openViewModal(day)}
                      className={cn(
                        "p-2 transition-all cursor-pointer hover:bg-accent/30 group",
                        isTodayDate && "bg-primary/5 dark:bg-primary/10"
                      )}
                    >
                      <ScrollArea className="h-[360px]">
                        <div className="space-y-2 pr-2">
                          {dayTasks.length === 0 ? (
                            <p className="text-xs text-muted-foreground text-center py-4 opacity-0 group-hover:opacity-100 transition-opacity">
                              Click to view
                            </p>
                          ) : (
                            dayTasks.map((task) => {
                              const colors = getColorClasses(task.color);
                              const catInfo = getCategoryInfo(task.category);
                              return (
                                <div
                                  key={task.id}
                                  className={cn(
                                    "p-2 rounded-lg cursor-pointer hover:shadow-md transition-all border-l-4 group/task",
                                    colors.light
                                  )}
                                  style={{ borderLeftColor: colors.hex }}
                                  onClick={(e) => openEditModal(task, e)}
                                >
                                  <div className="flex items-start justify-between gap-1">
                                    <div className="flex-1 min-w-0">
                                      <p className="font-medium text-sm leading-tight">{task.title}</p>
                                      {task.description && (
                                        <p className="text-xs text-muted-foreground mt-1 line-clamp-3">
                                          {task.description}
                                        </p>
                                      )}
                                    </div>
                                    {canDelete && (
                                      <button
                                        onClick={(e) => handleDelete(task.id, e)}
                                        className="opacity-0 group-hover/task:opacity-100 p-0.5 hover:bg-destructive/10 rounded transition-all flex-shrink-0"
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
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* View Tasks Modal */}
      <Dialog open={isViewModalOpen} onOpenChange={setIsViewModalOpen}>
        <DialogContent className="sm:max-w-6xl w-[95vw] h-[85vh] max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <CalendarDays className="h-5 w-5" />
              {viewingDate ? format(viewingDate, 'EEEE, MMMM d, yyyy') : 'Tasks'}
              {viewingDate && getTasksForDay(viewingDate).length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {getTasksForDay(viewingDate).length} {getTasksForDay(viewingDate).length === 1 ? 'task' : 'tasks'}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          
          <ScrollArea className="flex-1 pr-4">
            {viewingDate && getTasksForDay(viewingDate).length === 0 ? (
              <div className="text-center py-8">
                <ListTodo className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground">No tasks for this day</p>
              </div>
            ) : (
              <div className="space-y-3">
                {viewingDate && getTasksForDay(viewingDate).map((task) => {
                  const colors = getColorClasses(task.color);
                  const catInfo = getCategoryInfo(task.category);
                  return (
                    <div
                      key={task.id}
                      className={cn(
                        "p-3 rounded-lg border-l-4 transition-all hover:shadow-md cursor-pointer",
                        colors.light
                      )}
                      style={{ borderLeftColor: colors.hex }}
                      onClick={(e) => openEditModal(task, e)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0 overflow-hidden">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="text-xs py-0 h-5">
                              {catInfo.emoji} {catInfo.label}
                            </Badge>
                          </div>
                          <p className="font-semibold text-sm break-words">{task.title}</p>
                          {task.description && (
                            <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap break-words overflow-wrap-anywhere">
                              {task.description}
                            </p>
                          )}
                        </div>
                        {canDelete && (
                          <button
                            onClick={(e) => handleDelete(task.id, e)}
                            className="p-1 hover:bg-destructive/10 rounded transition-all flex-shrink-0"
                          >
                            <X className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={closeViewModal}>
              Close
            </Button>
            {canEdit && (
              <Button onClick={openCreateFromViewModal}>
                <Plus className="h-4 w-4 mr-1" />
                Add Task
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Schedule Category</label>
              <div className="flex gap-2 flex-wrap">
                {scheduleCategories.filter(c => c.value !== 'all').map((cat) => (
                  <Button
                    key={cat.value}
                    type="button"
                    variant={formData.category === cat.value ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFormData({ ...formData, category: cat.value })}
                    className="h-8"
                  >
                    <span className="mr-1.5">{cat.emoji}</span>
                    {cat.label}
                  </Button>
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
