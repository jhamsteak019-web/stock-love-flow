import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Profile, UserRole, UserRoleRecord } from '@/types/inventory';
import { useToast } from '@/hooks/use-toast';

export interface UserWithRole extends Profile {
  role: UserRole;
  role_id: string;
}

export const useUsers = () => {
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchUsers = async () => {
    try {
      setLoading(true);
      
      // Fetch profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      // Fetch roles
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('*');

      if (rolesError) throw rolesError;

      // Combine profiles with roles
      const usersWithRoles: UserWithRole[] = (profiles || []).map(profile => {
        const roleRecord = roles?.find(r => r.user_id === profile.id);
        return {
          ...profile,
          role: (roleRecord?.role as UserRole) || 'staff',
          role_id: roleRecord?.id || '',
        };
      });

      setUsers(usersWithRoles);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch users',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const updateProfile = async (userId: string, updates: Partial<Profile>) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', userId);

      if (error) throw error;

      setUsers(users.map(user => 
        user.id === userId ? { ...user, ...updates } : user
      ));

      toast({
        title: 'Success',
        description: 'Profile updated successfully',
      });

      return true;
    } catch (error) {
      console.error('Error updating profile:', error);
      toast({
        title: 'Error',
        description: 'Failed to update profile',
        variant: 'destructive',
      });
      return false;
    }
  };

  const updateUserRole = async (userId: string, newRole: UserRole) => {
    try {
      const { error } = await supabase
        .from('user_roles')
        .update({ role: newRole })
        .eq('user_id', userId);

      if (error) throw error;

      setUsers(users.map(user => 
        user.id === userId ? { ...user, role: newRole } : user
      ));

      toast({
        title: 'Success',
        description: `User role updated to ${newRole}`,
      });

      return true;
    } catch (error) {
      console.error('Error updating role:', error);
      toast({
        title: 'Error',
        description: 'Failed to update user role',
        variant: 'destructive',
      });
      return false;
    }
  };

  const deleteUser = async (userId: string) => {
    try {
      // Delete user role first
      await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId);

      // Delete profile
      const { error } = await supabase
        .from('profiles')
        .delete()
        .eq('id', userId);

      if (error) throw error;

      setUsers(users.filter(user => user.id !== userId));

      toast({
        title: 'Success',
        description: 'User deleted successfully',
      });

      return true;
    } catch (error) {
      console.error('Error deleting user:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete user',
        variant: 'destructive',
      });
      return false;
    }
  };

  return {
    users,
    loading,
    fetchUsers,
    refetch: fetchUsers,
    updateProfile,
    updateUserRole,
    deleteUser,
  };
};
