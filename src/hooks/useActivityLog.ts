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
    // NOTE:
    // Some pages can run mutations before AuthContext finishes hydrating.
    // If we bail out here, nothing will ever be logged.
    // Fallback to the current auth session user.
    const currentUser =
      user ?? (await supabase.auth.getUser()).data.user;

    if (!currentUser) {
      // Keep this quiet in prod UI, but helpful in console during debugging.
      console.debug('[activity_logs] Skipped: no authenticated user available');
      return;
    }

    try {
      const { error } = await supabase
        .from('activity_logs')
        .insert({
          user_id: currentUser.id,
          user_email: currentUser.email,
          user_name:
            currentUser.user_metadata?.full_name ||
            currentUser.email?.split('@')[0],
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
