import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
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

const moduleLinks: Record<ModuleType, string> = {
  deliveries: '/deliveries',
  stock_releases: '/history',
  inventory: '/inventory',
  attendance: '/attendance',
  manpower: '/manpower',
  notes: '/notes',
  repeat_orders: '/repeat-order',
  containers: '/container',
  auth: '/activity-history',
};

const formatLabel = (value: string) => value.replace(/_/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase());

export const useActivityLog = () => {
  const { user, userRole } = useAuth();
  const { selectedBranch, userBranch } = useBranch();

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
      const actorName =
        currentUser.user_metadata?.full_name ||
        currentUser.email?.split('@')[0] ||
        'User';
      const metadataBranchId = typeof metadata.branch_id === 'string' ? metadata.branch_id : null;
      let activityBranchId = metadataBranchId || selectedBranch?.id || userBranch?.id || null;
      let activityBranchName =
        typeof metadata.branch === 'string'
          ? metadata.branch
          : selectedBranch?.name || userBranch?.name || null;

      if (!activityBranchId) {
        const { data: actorProfile } = await supabase
          .from('profiles')
          .select('branch_id, branches(name)')
          .eq('id', currentUser.id)
          .maybeSingle();

        activityBranchId = actorProfile?.branch_id || null;
        activityBranchName = activityBranchName || actorProfile?.branches?.name || null;
      }

      const { error } = await supabase
        .from('activity_logs')
        .insert({
          user_id: currentUser.id,
          user_email: currentUser.email,
          user_name: actorName,
          action_type: actionType,
          module,
          description,
          metadata: {
            ...metadata,
            branch_id: activityBranchId,
            branch: activityBranchName,
            role: userRole,
          }
        });

      if (error) {
        console.error('Failed to log activity:', error);
      }

      let recipientsQuery = supabase
        .from('profiles')
        .select('id, branch_id');

      if (!activityBranchId) return;

      recipientsQuery = recipientsQuery.eq('branch_id', activityBranchId);

      const { data: recipients, error: recipientsError } = await recipientsQuery;

      if (recipientsError) {
        console.error('Failed to fetch notification recipients:', recipientsError);
        return;
      }

      const recipientIds = Array.from(
        new Set((recipients || []).map((recipient) => recipient.id).filter(Boolean))
      );

      if (recipientIds.length === 0) return;

      const notifications = recipientIds.map((userId) => ({
        user_id: userId,
        title: `${formatLabel(actionType)} ${formatLabel(module)}`,
        message: `${actorName}: ${description}`,
        type: 'activity',
        link: moduleLinks[module] || '/activity-history',
        created_by: currentUser.id,
      }));

      const { error: notificationError } = await supabase
        .from('notifications')
        .insert(notifications);

      if (notificationError) {
        console.error('Failed to create activity notifications:', notificationError);
      }
    } catch (err) {
      console.error('Activity log error:', err);
    }
  }, [selectedBranch?.id, selectedBranch?.name, user, userBranch?.id, userBranch?.name, userRole]);

  return { logActivity };
};
