export type PendingAllocationStatus = 'pending' | 'warehouse_process' | 'cancelled' | 'for_delete';

export const PENDING_ALLOCATION_STATUS_OPTIONS: Array<{ value: PendingAllocationStatus; label: string }> = [
  { value: 'pending', label: 'Pending' },
  { value: 'warehouse_process', label: 'Warehouse Process' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'for_delete', label: 'For Delete' },
];

export const PENDING_ALLOCATION_ACTION_STATUS_BY_STATUS: Record<PendingAllocationStatus, string> = {
  pending: 'pending_allocation',
  warehouse_process: 'pending_allocation_warehouse_process',
  cancelled: 'pending_allocation_cancelled',
  for_delete: 'pending_allocation_for_delete',
};

export const PENDING_ALLOCATION_ACTION_STATUSES = Object.values(PENDING_ALLOCATION_ACTION_STATUS_BY_STATUS);

export const isPendingAllocationActionStatus = (status?: string | null) =>
  Boolean(status && PENDING_ALLOCATION_ACTION_STATUSES.includes(status));

export const getPendingAllocationActionStatus = (status: PendingAllocationStatus) =>
  PENDING_ALLOCATION_ACTION_STATUS_BY_STATUS[status];

export const getPendingAllocationStatusFromAction = (actionStatus?: string | null): PendingAllocationStatus => {
  const entry = Object.entries(PENDING_ALLOCATION_ACTION_STATUS_BY_STATUS)
    .find(([, value]) => value === actionStatus);
  return (entry?.[0] as PendingAllocationStatus | undefined) || 'pending';
};

export const getPendingAllocationStatus = (
  pendingStatus?: string | null,
  actionStatus?: string | null,
): PendingAllocationStatus => {
  const normalized = String(pendingStatus || '').trim().toLowerCase().replace(/\s+/g, '_');
  if (PENDING_ALLOCATION_STATUS_OPTIONS.some(option => option.value === normalized)) {
    return normalized as PendingAllocationStatus;
  }
  return getPendingAllocationStatusFromAction(actionStatus);
};

export const getPendingAllocationStatusLabel = (status: PendingAllocationStatus) =>
  PENDING_ALLOCATION_STATUS_OPTIONS.find(option => option.value === status)?.label || 'Pending';
