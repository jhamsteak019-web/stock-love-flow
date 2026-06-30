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

const roleAliases: Record<string, string> = {
  tl: 'teamleader',
  'team leader': 'teamleader',
  team_leader: 'teamleader',
  teamleader: 'teamleader',
};

export const normalizeRoleKey = (role: string | null | undefined): string => {
  if (!role) return '';
  const key = role.trim().toLowerCase();
  return roleAliases[key] || key;
};

export const getRoleDisplayName = (role: string | null | undefined): string => {
  const normalizedRole = normalizeRoleKey(role);
  if (!normalizedRole) return 'Unknown';
  return roleDisplayNames[normalizedRole] || role || 'Unknown';
};

// Helper function to check if a role can edit (has add/edit permissions)
export const canRoleEdit = (role: string | null | undefined): boolean => {
  const normalizedRole = normalizeRoleKey(role);
  if (!normalizedRole) return false;
  const editableRoles = ['admin', 'staff', 'hr', 'assistant', 'encoder'];
  return editableRoles.includes(normalizedRole);
};
