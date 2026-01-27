import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCallback } from 'react';

export type ActionType = 
  | 'create' 
  | 'update' 
  | 'delete' 
  | 'login' 
  | 'logout'
  | 'import'
  | 'export';

export type ModuleType = 
  | 'deliveries'
  | 'stock_releases'
  | 'inventory'
  | 'attendance'
  | 'manpower'
  | 'notes'
  | 'repeat_orders'
  | 'containers'
  | 'auth';

interface LogActivityParams {
  actionType: ActionType;
  module: ModuleType;
  description: string;
  metadata?: Record<string, unknown>;
}

export const useActivityLog = () => {
  const { user, userRole } = useAuth();

  const logActivity = useCallback(async ({
    actionType,
    module,
    description,
    metadata = {}
  }: LogActivityParams) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('activity_logs')
        .insert({
          user_id: user.id,
          user_email: user.email,
          user_name: user.user_metadata?.full_name || user.email?.split('@')[0],
          action_type: actionType,
          module,
          description,
          metadata: {
            ...metadata,
            role: userRole,
          }
        });

      if (error) {
        console.error('Failed to log activity:', error);
      }
    } catch (err) {
      console.error('Activity log error:', err);
    }
  }, [user, userRole]);

  return { logActivity };
};
