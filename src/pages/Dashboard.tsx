import { Package, BoxesIcon, AlertTriangle, Truck, CheckCircle, Clock } from 'lucide-react';
import { StatCard } from '@/components/dashboard/StatCard';
import { useInventory } from '@/hooks/useInventory';
import { StatusBadge } from '@/components/ui/status-badge';
import { format } from 'date-fns';

const Dashboard = () => {
  const { items, releases, loading, getStats } = useInventory();
  const stats = getStats();

  const lowStockItems = items.filter(item => item.available_stock <= item.low_stock_threshold);
  const recentReleases = releases.slice(0, 5);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <div className="animate-slide-up" style={{ animationDelay: '0ms' }}>
          <StatCard
            title="Total Items"
            value={stats.totalItems > 50000 ? '50,000+' : stats.totalItems.toLocaleString()}
            icon={Package}
          />
        </div>
        <div className="animate-slide-up" style={{ animationDelay: '50ms' }}>
          <StatCard
            title="Total Stock"
            value={stats.totalStock > 1000000 ? '1,000,000+' : stats.totalStock.toLocaleString()}
            icon={BoxesIcon}
          />
        </div>
        <div className="animate-slide-up" style={{ animationDelay: '100ms' }}>
          <StatCard
            title="Low Stock"
            value={stats.lowStockItems}
            icon={AlertTriangle}
            variant="warning"
          />
        </div>
        <div className="animate-slide-up" style={{ animationDelay: '150ms' }}>
          <StatCard
            title="Pending"
            value={stats.pendingDeliveries}
            icon={Clock}
            variant="warning"
          />
        </div>
        <div className="animate-slide-up" style={{ animationDelay: '200ms' }}>
          <StatCard
            title="In Transit"
            value={stats.inTransitDeliveries}
            icon={Truck}
            variant="info"
          />
        </div>
        <div className="animate-slide-up" style={{ animationDelay: '250ms' }}>
          <StatCard
            title="Delivered"
            value={stats.deliveredCount}
            icon={CheckCircle}
            variant="success"
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Low Stock Alerts */}
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-card-foreground">Low Stock Alerts</h2>
            <AlertTriangle className="h-5 w-5 text-status-pending" />
          </div>
          {lowStockItems.length === 0 ? (
            <p className="text-muted-foreground text-sm">No low stock items</p>
          ) : (
            <div className="space-y-3">
              {lowStockItems.slice(0, 5).map((item, index) => (
                <div 
                  key={item.id} 
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50 animate-fade-in stagger-item"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <div>
                    <p className="font-medium text-foreground">{item.item_name}</p>
                    <p className="text-sm text-muted-foreground">{item.item_code}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-destructive">{item.available_stock}</p>
                    <p className="text-xs text-muted-foreground">of {item.total_stock}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Deliveries */}
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-card-foreground">Recent Releases</h2>
            <Truck className="h-5 w-5 text-primary" />
          </div>
          {recentReleases.length === 0 ? (
            <p className="text-muted-foreground text-sm">No recent releases</p>
          ) : (
            <div className="space-y-3">
              {recentReleases.map((release, index) => (
                <div 
                  key={release.id} 
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50 animate-fade-in stagger-item"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <div>
                    <p className="font-medium text-foreground">
                      {release.inventory_item?.item_name || 'Unknown Item'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {release.boxes_released} boxes → {release.destination}
                    </p>
                  </div>
                  <div className="text-right flex flex-col items-end gap-1">
                    <StatusBadge status={release.delivery_status} />
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(release.date_released), 'MMM d, yyyy')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
