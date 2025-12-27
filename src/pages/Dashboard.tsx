import { useMemo } from 'react';
import { useInventory } from '@/hooks/useInventory';
import { StatCard } from '@/components/dashboard/StatCard';
import { Truck, CheckCircle, Clock, ClipboardList, Store, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Badge } from '@/components/ui/badge';

const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

const Dashboard = () => {
  const { releases, loading, getStats } = useInventory();
  const stats = getStats();

  // Top stores by total boxes
  const topStores = useMemo(() => {
    const storeData: Record<string, { store: string; boxes: number; deliveries: number; delivered: number }> = {};
    
    releases.forEach(release => {
      const store = release.destination || 'Unknown';
      if (!storeData[store]) {
        storeData[store] = { store, boxes: 0, deliveries: 0, delivered: 0 };
      }
      storeData[store].boxes += release.boxes_released;
      storeData[store].deliveries += 1;
      if (release.delivery_status === 'delivered') {
        storeData[store].delivered += 1;
      }
    });

    return Object.values(storeData)
      .sort((a, b) => b.boxes - a.boxes)
      .slice(0, 10);
  }, [releases]);

  // Top stores by category for chart
  const topStoresByCategory = useMemo(() => {
    const categoryData: Record<string, Record<string, number>> = {};
    
    releases.forEach(release => {
      const category = release.category?.trim().toUpperCase() || 'UNCATEGORIZED';
      const store = release.destination || 'Unknown';
      
      if (!categoryData[category]) {
        categoryData[category] = {};
      }
      if (!categoryData[category][store]) {
        categoryData[category][store] = 0;
      }
      categoryData[category][store] += release.boxes_released;
    });

    // Get top 5 categories by total boxes
    const categorySummary = Object.entries(categoryData).map(([category, stores]) => ({
      category,
      totalBoxes: Object.values(stores).reduce((sum, boxes) => sum + boxes, 0),
      topStore: Object.entries(stores).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A',
      topStoreBoxes: Object.entries(stores).sort((a, b) => b[1] - a[1])[0]?.[1] || 0,
    })).sort((a, b) => b.totalBoxes - a.totalBoxes).slice(0, 5);

    return categorySummary;
  }, [releases]);

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

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

      {/* Top Stores and Category Chart */}
      <div className="grid gap-6 lg:grid-cols-2">
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
                {topStores.slice(0, 5).map((store, index) => {
                  const percentage = store.deliveries > 0 
                    ? Math.round((store.delivered / store.deliveries) * 100) 
                    : 0;
                  return (
                    <div
                      key={store.store}
                      className="flex items-center justify-between rounded-lg border border-border p-3"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                          {index + 1}
                        </span>
                        <div>
                          <p className="font-medium text-foreground">{store.store}</p>
                          <p className="text-sm text-muted-foreground">
                            {store.deliveries} deliveries • {percentage}% completed
                          </p>
                        </div>
                      </div>
                      <Badge variant="secondary" className="text-sm font-semibold">
                        {store.boxes.toLocaleString()} boxes
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Stores by Category Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Top Stores by Category
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topStoresByCategory.length === 0 ? (
              <p className="text-sm text-muted-foreground">No category data available</p>
            ) : (
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topStoresByCategory} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" className="text-xs" />
                    <YAxis 
                      type="category" 
                      dataKey="category" 
                      className="text-xs" 
                      width={80}
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                      labelStyle={{ color: 'hsl(var(--foreground))' }}
                      formatter={(value: number, name: string, props: any) => [
                        `${value.toLocaleString()} boxes (Top: ${props.payload.topStore})`,
                        'Total'
                      ]}
                    />
                    <Bar dataKey="totalBoxes" radius={[0, 4, 4, 0]}>
                      {topStoresByCategory.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
