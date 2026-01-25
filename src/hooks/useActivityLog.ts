import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type ActionType = 'login' | 'logout' | 'create' | 'update' | 'delete' | 'view';

interface LogActivityParams {
  actionType: ActionType;
  module?: string;
  description?: string;
  metadata?: Record<string, any>;
}

export const useActivityLog = () => {
  const { user } = useAuth();

  const logActivity = useCallback(async ({
    actionType,
    module,
    description,
    metadata = {}
  }: LogActivityParams) => {
    if (!user) return;

    try {
      const { error } = await supabase.from('activity_logs').insert({
        user_id: user.id,
        user_email: user.email,
        user_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Unknown',
        action_type: actionType,
        module: module || null,
        description: description || null,
        metadata
      });

      if (error) {
        console.error('Failed to log activity:', error);
      }
    } catch (err) {
      console.error('Activity logging error:', err);
    }
  }, [user]);

  return { logActivity };
};

// Standalone function for logging without hook context (e.g., in AuthContext)
export const logActivityDirect = async (
  userId: string,
  userEmail: string | undefined,
  userName: string | undefined,
  actionType: ActionType,
  module?: string,
  description?: string,
  metadata: Record<string, any> = {}
) => {
  try {
    const { error } = await supabase.from('activity_logs').insert({
      user_id: userId,
      user_email: userEmail || null,
      user_name: userName || userEmail?.split('@')[0] || 'Unknown',
      action_type: actionType,
      module: module || null,
      description: description || null,
      metadata
    });

    if (error) {
      console.error('Failed to log activity:', error);
    }
  } catch (err) {
    console.error('Activity logging error:', err);
  }
};
