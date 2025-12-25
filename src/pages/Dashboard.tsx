import { useInventory } from '@/hooks/useInventory';
import { StatCard } from '@/components/dashboard/StatCard';
import { Package, Truck, AlertTriangle, CheckCircle, Clock, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const Dashboard = () => {
  const { items, releases, loading, getStats } = useInventory();
  const stats = getStats();

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  // Recent releases (last 5)
  const recentReleases = releases.slice(0, 5);

  // Low stock items
  const lowStockItems = items.filter(item => item.available_stock <= item.low_stock_threshold);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground">Overview of your inventory and deliveries</p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          title="Total Items"
          value={stats.totalItems}
          icon={Package}
          variant="default"
        />
        <StatCard
          title="Total Stock"
          value={stats.totalStock}
          icon={TrendingUp}
          variant="info"
        />
        <StatCard
          title="Low Stock"
          value={stats.lowStockItems}
          icon={AlertTriangle}
          variant="warning"
        />
        <StatCard
          title="Pending"
          value={stats.pendingDeliveries}
          icon={Clock}
          variant="warning"
        />
        <StatCard
          title="In Transit"
          value={stats.inTransitDeliveries}
          icon={Truck}
          variant="info"
        />
        <StatCard
          title="Delivered"
          value={stats.deliveredCount}
          icon={CheckCircle}
          variant="success"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Releases */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent Releases</CardTitle>
          </CardHeader>
          <CardContent>
            {recentReleases.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recent releases</p>
            ) : (
              <div className="space-y-3">
                {recentReleases.map((release) => (
                  <div
                    key={release.id}
                    className="flex items-center justify-between rounded-lg border border-border p-3"
                  >
                    <div>
                      <p className="font-medium text-foreground">
                        {release.inventory_item?.item_name || 'Unknown Item'}
                        {release.category && (
                          <span className="ml-2 text-xs font-normal text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                            {release.category}
                          </span>
                        )}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {release.destination} • {release.boxes_released} boxes
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-medium ${
                        release.delivery_status === 'delivered'
                          ? 'bg-status-delivered-bg text-status-delivered'
                          : release.delivery_status === 'out_for_delivery'
                          ? 'bg-status-transit-bg text-status-transit'
                          : 'bg-status-pending-bg text-status-pending'
                      }`}
                    >
                      {release.delivery_status === 'out_for_delivery'
                        ? 'In Transit'
                        : release.delivery_status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Low Stock Alert */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Low Stock Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            {lowStockItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">All items are well stocked</p>
            ) : (
              <div className="space-y-3">
                {lowStockItems.slice(0, 5).map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-lg border border-status-pending/30 bg-status-pending-bg/20 p-3"
                  >
                    <div>
                      <p className="font-medium text-foreground">{item.item_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {item.item_code}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-status-pending">{item.available_stock}</p>
                      <p className="text-xs text-muted-foreground">
                        Threshold: {item.low_stock_threshold}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
