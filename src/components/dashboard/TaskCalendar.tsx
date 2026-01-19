import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek } from 'date-fns';

interface Task {
  id: string;
  title: string;
  date: Date;
  color: 'blue' | 'green' | 'orange' | 'purple' | 'red';
}

// Sample tasks - in a real app these would come from the database
const sampleTasks: Task[] = [
  { id: '1', title: 'Client Call', date: new Date(2025, 0, 1), color: 'blue' },
  { id: '2', title: "Team Review", date: new Date(2025, 0, 16), color: 'blue' },
  { id: '3', title: "Team Review", date: new Date(2025, 0, 17), color: 'blue' },
  { id: '4', title: "Sales Meeting", date: new Date(2025, 0, 18), color: 'green' },
  { id: '5', title: "Inventory Check", date: new Date(2025, 0, 25), color: 'orange' },
  { id: '6', title: "Delivery Schedule", date: new Date(2025, 0, 26), color: 'purple' },
];

const colorClasses = {
  blue: 'bg-blue-500 text-white',
  green: 'bg-green-500 text-white',
  orange: 'bg-orange-500 text-white',
  purple: 'bg-purple-500 text-white',
  red: 'bg-red-500 text-white',
};

const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dayHeaderColors = [
  'bg-cyan-600', // Sun
  'bg-cyan-500', // Mon
  'bg-cyan-400', // Tue
  'bg-cyan-500', // Wed
  'bg-cyan-400', // Thu
  'bg-cyan-500', // Fri
  'bg-cyan-600', // Sat
];

export function TaskCalendar() {
  const [currentDate, setCurrentDate] = useState(new Date());

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calendarStart = startOfWeek(monthStart);
    const calendarEnd = endOfWeek(monthEnd);
    
    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  }, [currentDate]);

  const getTasksForDay = (day: Date) => {
    return sampleTasks.filter(task => isSameDay(task.date, day));
  };

  const handlePrevMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const handleNextMonth = () => setCurrentDate(addMonths(currentDate, 1));

  // Group days into weeks
  const weeks = useMemo(() => {
    const result: Date[][] = [];
    for (let i = 0; i < calendarDays.length; i += 7) {
      result.push(calendarDays.slice(i, i + 7));
    }
    return result;
  }, [calendarDays]);

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
            {week.map((day, dayIndex) => {
              const tasks = getTasksForDay(day);
              const isCurrentMonth = isSameMonth(day, currentDate);
              const isToday = isSameDay(day, new Date());

              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    "min-h-[100px] p-2 transition-colors",
                    !isCurrentMonth && "bg-muted/20",
                    isToday && "bg-primary/5"
                  )}
                >
                  <div className="flex justify-end mb-1">
                    <span
                      className={cn(
                        "text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full",
                        !isCurrentMonth && "text-muted-foreground",
                        isToday && "bg-primary text-primary-foreground"
                      )}
                    >
                      {format(day, 'd')}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {tasks.slice(0, 2).map((task) => (
                      <div
                        key={task.id}
                        className={cn(
                          "text-xs px-2 py-1 rounded truncate cursor-pointer hover:opacity-80 transition-opacity",
                          colorClasses[task.color]
                        )}
                        title={task.title}
                      >
                        {task.title}
                      </div>
                    ))}
                    {tasks.length > 2 && (
                      <div className="text-xs text-muted-foreground px-1">
                        +{tasks.length - 2} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
