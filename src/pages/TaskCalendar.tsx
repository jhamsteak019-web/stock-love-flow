import { TaskCalendar as TaskCalendarComponent } from '@/components/dashboard/TaskCalendar';

const TaskCalendarPage = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Task Calendar</h1>
        <p className="text-muted-foreground">View and manage your scheduled tasks</p>
      </div>
      
      <TaskCalendarComponent />
    </div>
  );
};

export default TaskCalendarPage;
