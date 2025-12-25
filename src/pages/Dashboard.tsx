import { useInventory } from '@/hooks/useInventory';
import { StatCard } from '@/components/dashboard/StatCard';
import { Truck, CheckCircle, Clock, ClipboardList } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const Dashboard = () => {
  const { releases, loading, getStats } = useInventory();
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

  // Total releases count
  const totalReleases = releases.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground">Overview of your inventory and deliveries</p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Releases"
          value={totalReleases}
          icon={ClipboardList}
          variant="default"
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
                      {release.inventory_item?.item_name || release.category || 'Unknown'}
                      {release.category && release.inventory_item?.item_name && (
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
    </div>
  );
};

export default Dashboard;
