import { CalendarDays } from 'lucide-react';
import { TaskCalendar as TaskCalendarComponent } from '@/components/dashboard/TaskCalendar';

const TaskCalendarPage = () => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <CalendarDays className="h-6 w-6" />
            Tasks Calendar
          </h1>
          <p className="text-muted-foreground">Manage your daily tasks and events</p>
        </div>
      </div>
      
      <TaskCalendarComponent />
    </div>
  );
};

export default TaskCalendarPage;
