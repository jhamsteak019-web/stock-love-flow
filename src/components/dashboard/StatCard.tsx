import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  title: string;
  value: number | string;
  subtitle?: string;
  icon: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  variant?: 'default' | 'warning' | 'success' | 'info';
  className?: string;
}

const variantStyles = {
  default: 'border-border',
  warning: 'border-status-pending/30 bg-status-pending-bg/30',
  success: 'border-status-delivered/30 bg-status-delivered-bg/30',
  info: 'border-status-transit/30 bg-status-transit-bg/30',
};

const iconVariantStyles = {
  default: 'bg-primary/10 text-primary',
  warning: 'bg-status-pending/20 text-status-pending',
  success: 'bg-status-delivered/20 text-status-delivered',
  info: 'bg-status-transit/20 text-status-transit',
};

export const StatCard = ({ 
  title, 
  value, 
  subtitle,
  icon: Icon, 
  trend, 
  variant = 'default',
  className 
}: StatCardProps) => {
  return (
    <div 
      className={cn(
        "stat-card animate-fade-in",
        variantStyles[variant],
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <div className={cn(
              "flex h-6 w-6 items-center justify-center rounded-lg",
              iconVariantStyles[variant]
            )}>
              <Icon className="h-3.5 w-3.5" />
            </div>
          </div>
          <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
          {subtitle && (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
          {trend && (
            <p className={cn(
              "mt-1 text-sm font-medium",
              trend.isPositive ? "text-status-delivered" : "text-destructive"
            )}>
              {trend.isPositive ? '+' : ''}{trend.value}% from last month
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
