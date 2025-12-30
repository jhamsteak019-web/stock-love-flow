import { UserRole } from '@/types/inventory';

// Map role keys to display names
export const roleDisplayNames: Record<string, string> = {
  admin: 'Admin',
  staff: 'Staff',
  viewer: 'OIC',
  teamleader: 'Team Leader',
  uploader: 'Uploader',
  pending: 'Pending',
};

export const getRoleDisplayName = (role: string | null | undefined): string => {
  if (!role) return 'Unknown';
  return roleDisplayNames[role] || role;
};
