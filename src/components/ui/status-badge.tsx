import { cn } from '@/lib/utils';
import { DeliveryStatus } from '@/types/inventory';

interface StatusBadgeProps {
  status: DeliveryStatus;
  className?: string;
}

const statusConfig: Record<DeliveryStatus, { label: string; className: string }> = {
  pending: {
    label: 'Pending',
    className: 'status-pending',
  },
  out_for_delivery: {
    label: 'Out for Delivery',
    className: 'status-transit',
  },
  delivered: {
    label: 'Delivered',
    className: 'status-delivered',
  },
};

export const StatusBadge = ({ status, className }: StatusBadgeProps) => {
  const config = statusConfig[status];
  
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        config.className,
        className
      )}
    >
      {config.label}
    </span>
  );
};
