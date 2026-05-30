import { supabase } from '@/integrations/supabase/client';
import type { UserRole } from '@/types/inventory';

interface RecipientOptions {
  branchId?: string | null;
  includeUnassigned?: boolean;
  excludeUserId?: string | null;
}

interface ProfileRecipient {
  id: string;
  branch_id: string | null;
}

const roleMatches = (role: string | null | undefined, roles: UserRole[]) => {
  return Boolean(role && roles.includes(role as UserRole));
};

const branchMatches = (profile: ProfileRecipient, branchId?: string | null, includeUnassigned = false) => {
  if (!branchId) return true;
  return profile.branch_id === branchId || (includeUnassigned && !profile.branch_id);
};

export const getNotificationRecipientIdsByRoles = async (
  roles: UserRole[],
  options: RecipientOptions = {}
) => {
  const recipientIds = new Set<string>();

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, branch_id');

  if (profilesError) throw profilesError;

  const profileMap = new Map(
    ((profiles || []) as ProfileRecipient[]).map((profile) => [profile.id, profile])
  );

  const { data: directRoles } = await supabase
    .from('user_roles')
    .select('user_id, role')
    .in('role', roles);

  (directRoles || []).forEach((row) => {
    const profile = row.user_id ? profileMap.get(row.user_id) : null;
    const canIncludeBranch = !profile || branchMatches(profile, options.branchId, options.includeUnassigned);

    if (row.user_id && row.user_id !== options.excludeUserId && canIncludeBranch) {
      recipientIds.add(row.user_id);
    }
  });

  const candidateProfiles = ((profiles || []) as ProfileRecipient[]).filter((profile) => {
    if (!profile.id || profile.id === options.excludeUserId) return false;
    if (recipientIds.has(profile.id)) return false;
    return branchMatches(profile, options.branchId, options.includeUnassigned);
  });

  const roleLookups = await Promise.all(
    candidateProfiles.map(async (profile) => {
      const { data, error } = await supabase.rpc('get_user_role', { _user_id: profile.id });
      if (error) return null;
      return {
        userId: profile.id,
        role: data as string | null,
      };
    })
  );

  roleLookups.forEach((lookup) => {
    if (lookup && roleMatches(lookup.role, roles)) {
      recipientIds.add(lookup.userId);
    }
  });

  return Array.from(recipientIds);
};
