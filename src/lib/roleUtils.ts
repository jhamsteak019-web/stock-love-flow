import { UserRole } from '@/types/inventory';

// Map role keys to display names
export const roleDisplayNames: Record<string, string> = {
  admin: 'Admin',
  staff: 'Staff',
  viewer: 'Viewer',
  oic: 'OIC',
  teamleader: 'Team Leader',
  uploader: 'Uploader',
  pending: 'Pending',
  hr: 'HR',
  encoder: 'Encoder',
  assistant: 'Assistant',
  warehouse: 'Warehouse',
};

export const getRoleDisplayName = (role: string | null | undefined): string => {
  if (!role) return 'Unknown';
  return roleDisplayNames[role] || role;
};

// Helper function to check if a role can edit (has add/edit permissions)
export const canRoleEdit = (role: string | null | undefined): boolean => {
  if (!role) return false;
  const editableRoles = ['admin', 'staff', 'hr', 'assistant', 'encoder'];
  return editableRoles.includes(role);
};
