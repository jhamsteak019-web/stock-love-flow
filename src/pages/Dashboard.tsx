import { useMemo } from 'react';
import { useInventory } from '@/hooks/useInventory';
import { StatCard } from '@/components/dashboard/StatCard';
import { Package, CheckCircle, Clock, MapPin, TrendingUp, Store } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#6366F1'];

const Dashboard = () => {
  const { releases, loading, getStats } = useInventory();
  const stats = getStats();

  // Calculate total boxes and qty
  const totals = useMemo(() => {
    let totalBoxes = 0;
    let totalQty = 0;
    let deliveredBoxes = 0;
    let deliveredQty = 0;

    releases.forEach(release => {
      totalBoxes += release.boxes_released || 0;
      totalQty += release.total_qty || 0;
      if (release.delivery_status === 'delivered') {
        deliveredBoxes += release.boxes_released || 0;
        deliveredQty += release.total_qty || 0;
      }
    });

    return { totalBoxes, totalQty, deliveredBoxes, deliveredQty };
  }, [releases]);

  // Unique branches/destinations
  const uniqueBranches = useMemo(() => {
    const branches = new Set(releases.map(r => r.destination));
    return branches.size;
  }, [releases]);

  // Completion rate
  const completionRate = useMemo(() => {
    if (releases.length === 0) return 0;
    return Math.round((stats.deliveredCount / releases.length) * 100);
  }, [releases.length, stats.deliveredCount]);

  // Category distribution for pie chart
  const categoryDistribution = useMemo(() => {
    const categories: Record<string, number> = {};
    
    releases.forEach(release => {
      const category = release.category?.trim().toUpperCase() || 'UNCATEGORIZED';
      categories[category] = (categories[category] || 0) + release.boxes_released;
    });

    const total = Object.values(categories).reduce((sum, val) => sum + val, 0);
    
    return Object.entries(categories)
      .map(([name, value]) => ({
        name,
        value,
        percentage: total > 0 ? Math.round((value / total) * 100) : 0
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [releases]);

  // Delivery completion rate by branch
  const branchCompletionRates = useMemo(() => {
    const branchData: Record<string, { total: number; delivered: number }> = {};
    
    releases.forEach(release => {
      const branch = release.destination || 'Unknown';
      if (!branchData[branch]) {
        branchData[branch] = { total: 0, delivered: 0 };
      }
      branchData[branch].total += 1;
      if (release.delivery_status === 'delivered') {
        branchData[branch].delivered += 1;
      }
    });

    return Object.entries(branchData)
      .map(([branch, data]) => ({
        branch,
        total: data.total,
        delivered: data.delivered,
        percentage: data.total > 0 ? Math.round((data.delivered / data.total) * 100) : 0
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 7);
  }, [releases]);

  // Top stores by total boxes with qty and delivered
  const topStores = useMemo(() => {
    const storeData: Record<string, { store: string; boxes: number; qty: number; deliveries: number; delivered: number }> = {};
    
    releases.forEach(release => {
      const store = release.destination || 'Unknown';
      if (!storeData[store]) {
        storeData[store] = { store, boxes: 0, qty: 0, deliveries: 0, delivered: 0 };
      }
      storeData[store].boxes += release.boxes_released || 0;
      storeData[store].qty += release.total_qty || 0;
      storeData[store].deliveries += 1;
      if (release.delivery_status === 'delivered') {
        storeData[store].delivered += 1;
      }
    });

    return Object.values(storeData)
      .sort((a, b) => b.boxes - a.boxes)
      .slice(0, 5);
  }, [releases]);

  // Branch delivery status breakdown
  const branchDeliveryStatus = useMemo(() => {
    const branchData: Record<string, { 
      branch: string; 
      pending: number; 
      inTransit: number; 
      outForDelivery: number;
      delivered: number;
      total: number;
    }> = {};
    
    releases.forEach(release => {
      const branch = release.destination || 'Unknown';
      if (!branchData[branch]) {
        branchData[branch] = { branch, pending: 0, inTransit: 0, outForDelivery: 0, delivered: 0, total: 0 };
      }
      branchData[branch].total += 1;
      
      switch (release.delivery_status) {
        case 'pending':
          branchData[branch].pending += 1;
          break;
        case 'in_transit':
          branchData[branch].inTransit += 1;
          break;
        case 'out_for_delivery':
          branchData[branch].outForDelivery += 1;
          break;
        case 'delivered':
          branchData[branch].delivered += 1;
          break;
      }
    });

    return Object.values(branchData)
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [releases]);

  // Get current month name
  const currentMonth = new Date().toLocaleString('default', { month: 'long' });

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground">Overview of your inventory and deliveries</p>
      </div>

      {/* Stats Grid - 5 cards like the reference */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          title="Total Boxes"
          value={totals.totalBoxes.toLocaleString()}
          subtitle={`${totals.totalQty.toLocaleString()} total qty/items`}
          icon={Package}
          variant="default"
        />
        <StatCard
          title="Delivered"
          value={stats.deliveredCount}
          subtitle="completed deliveries"
          icon={CheckCircle}
          variant="success"
        />
        <StatCard
          title="Pending"
          value={stats.pendingDeliveries}
          subtitle="awaiting delivery"
          icon={Clock}
          variant="warning"
        />
        <StatCard
          title="Branches Served"
          value={uniqueBranches}
          subtitle="unique locations"
          icon={MapPin}
          variant="info"
        />
        <StatCard
          title="Completion Rate"
          value={`${completionRate}%`}
          subtitle="delivery success"
          icon={TrendingUp}
          variant={completionRate >= 50 ? "success" : "warning"}
        />
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Category Distribution Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Category Distribution - {currentMonth}</CardTitle>
          </CardHeader>
          <CardContent>
            {categoryDistribution.length === 0 ? (
              <p className="text-sm text-muted-foreground">No category data available</p>
            ) : (
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ name, percentage }) => `${name} (${percentage}%)`}
                      labelLine={false}
                    >
                      {categoryDistribution.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value: number) => [`${value.toLocaleString()} boxes`, 'Total']}
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                    />
                    <Legend 
                      layout="horizontal" 
                      align="center" 
                      verticalAlign="bottom"
                      formatter={(value) => <span className="text-xs text-foreground">{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Delivery Completion Rate by Branch */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Delivery Completion Rate</CardTitle>
            <Badge variant="secondary" className="text-sm">
              {completionRate}% Overall
            </Badge>
          </CardHeader>
          <CardContent>
            {branchCompletionRates.length === 0 ? (
              <p className="text-sm text-muted-foreground">No branch data available</p>
            ) : (
              <div className="space-y-4">
                {branchCompletionRates.map((branch) => (
                  <div key={branch.branch} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-foreground truncate max-w-[200px]" title={branch.branch}>
                        {branch.branch}
                      </span>
                      <span className="text-muted-foreground whitespace-nowrap">
                        {branch.delivered}/{branch.total} ({branch.percentage}%)
                      </span>
                    </div>
                    <Progress value={branch.percentage} className="h-2" />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Stores */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Store className="h-5 w-5 text-primary" />
            Top Stores
          </CardTitle>
        </CardHeader>
        <CardContent>
          {topStores.length === 0 ? (
            <p className="text-sm text-muted-foreground">No store data available</p>
          ) : (
            <div className="space-y-3">
              {topStores.map((store, index) => {
                const percentage = store.deliveries > 0 
                  ? Math.round((store.delivered / store.deliveries) * 100) 
                  : 0;
                return (
                  <div
                    key={store.store}
                    className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-4"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                        {index + 1}
                      </span>
                      <div>
                        <p className="font-medium text-foreground">{store.store}</p>
                        <p className="text-sm text-muted-foreground">
                          {store.deliveries} deliveries • {percentage}% completed
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-sm font-semibold text-foreground">{store.boxes.toLocaleString()} boxes</p>
                        <p className="text-xs text-muted-foreground">{store.qty.toLocaleString()} qty</p>
                      </div>
                      <Badge 
                        variant={store.delivered > 0 ? "default" : "secondary"} 
                        className="min-w-[70px] justify-center"
                      >
                        {store.delivered} delivered
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Branch Delivery Status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            Branch Delivery Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          {branchDeliveryStatus.length === 0 ? (
            <p className="text-sm text-muted-foreground">No branch data available</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Branch</th>
                    <th className="text-center py-3 px-2 text-sm font-medium text-muted-foreground">Pending</th>
                    <th className="text-center py-3 px-2 text-sm font-medium text-muted-foreground">In Transit</th>
                    <th className="text-center py-3 px-2 text-sm font-medium text-muted-foreground">Out for Delivery</th>
                    <th className="text-center py-3 px-2 text-sm font-medium text-muted-foreground">Delivered</th>
                    <th className="text-center py-3 px-2 text-sm font-medium text-muted-foreground">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {branchDeliveryStatus.map((branch) => (
                    <tr key={branch.branch} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="py-3 px-2">
                        <span className="text-sm font-medium text-foreground truncate max-w-[200px] block" title={branch.branch}>
                          {branch.branch}
                        </span>
                      </td>
                      <td className="text-center py-3 px-2">
                        <Badge variant="outline" className="bg-status-pending-bg text-status-pending border-status-pending/30 min-w-[40px] justify-center">
                          {branch.pending}
                        </Badge>
                      </td>
                      <td className="text-center py-3 px-2">
                        <Badge variant="outline" className="bg-status-transit-bg text-status-transit border-status-transit/30 min-w-[40px] justify-center">
                          {branch.inTransit}
                        </Badge>
                      </td>
                      <td className="text-center py-3 px-2">
                        <Badge variant="outline" className="bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-900/30 dark:text-purple-400 min-w-[40px] justify-center">
                          {branch.outForDelivery}
                        </Badge>
                      </td>
                      <td className="text-center py-3 px-2">
                        <Badge variant="outline" className="bg-status-delivered-bg text-status-delivered border-status-delivered/30 min-w-[40px] justify-center">
                          {branch.delivered}
                        </Badge>
                      </td>
                      <td className="text-center py-3 px-2">
                        <span className="text-sm font-semibold text-foreground">{branch.total}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
