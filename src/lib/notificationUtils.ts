import type { UserRole } from '@/types/inventory';

export const NOTIFICATION_VISIBLE_ROLES: UserRole[] = [
  'admin',
  'assistant',
  'staff',
  'oic',
  'teamleader',
  'uploader',
  'hr',
  'encoder',
  'warehouse',
];

export const canViewNotifications = (role: UserRole | null | undefined) => {
  return Boolean(role && NOTIFICATION_VISIBLE_ROLES.includes(role));
};

export const canViewDiscrepancyNotifications = (role: UserRole | null | undefined) => {
  return role === 'admin' || role === 'assistant';
};
