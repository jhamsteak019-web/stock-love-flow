import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { History, LogIn, LogOut, Eye, Plus, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ActivityLog {
  id: string;
  user_id: string;
  user_email: string | null;
  user_name: string | null;
  action_type: string;
  module: string | null;
  description: string | null;
  metadata: Record<string, any>;
  created_at: string;
}

const actionIcons: Record<string, React.ElementType> = {
  login: LogIn,
  logout: LogOut,
  view: Eye,
  create: Plus,
  update: Pencil,
  delete: Trash2,
};

const actionColors: Record<string, string> = {
  login: 'bg-green-500/10 text-green-600 border-green-200',
  logout: 'bg-red-500/10 text-red-600 border-red-200',
  view: 'bg-blue-500/10 text-blue-600 border-blue-200',
  create: 'bg-purple-500/10 text-purple-600 border-purple-200',
  update: 'bg-yellow-500/10 text-yellow-600 border-yellow-200',
  delete: 'bg-red-500/10 text-red-600 border-red-200',
};

export const ActivityHistory = () => {
  const { userRole } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  
  const isAdmin = userRole === 'admin';

  const { data: activities = [], isLoading } = useQuery({
    queryKey: ['activity-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activity_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return (data || []) as ActivityLog[];
    },
    enabled: isAdmin && isOpen,
    refetchInterval: isOpen ? 30000 : false, // Refresh every 30s when open
  });

  // Only show for admin
  if (!isAdmin) return null;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <History className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0 z-50 bg-background border" align="end">
        <div className="p-4 border-b">
          <h3 className="font-semibold text-lg">Activity History</h3>
          <p className="text-sm text-muted-foreground">User login/logout and actions</p>
        </div>
        <ScrollArea className="h-[400px]">
          {isLoading ? (
            <div className="p-4 text-center text-muted-foreground">Loading...</div>
          ) : activities.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground">No activity recorded yet</div>
          ) : (
            <div className="divide-y">
              {activities.map((activity) => {
                const Icon = actionIcons[activity.action_type] || Eye;
                const colorClass = actionColors[activity.action_type] || 'bg-gray-500/10 text-gray-600';
                
                return (
                  <div key={activity.id} className="p-3 hover:bg-muted/50 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className={cn("p-2 rounded-full", colorClass)}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate">
                            {activity.user_name || activity.user_email?.split('@')[0] || 'Unknown'}
                          </span>
                          <Badge variant="outline" className="text-xs capitalize">
                            {activity.action_type}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {activity.description || `${activity.action_type} on ${activity.module || 'system'}`}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {format(new Date(activity.created_at), 'MMM dd, yyyy hh:mm:ss a')}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};
