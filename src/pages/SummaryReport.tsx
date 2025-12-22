import { useState, useMemo } from 'react';
import { BarChart3, TrendingUp, Package, Truck, Calendar } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useInventory } from '@/hooks/useInventory';
import { format } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

const SummaryReport = () => {
  const { releases, items, loading } = useInventory();
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear.toString());

  // Get available years from releases
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    releases.forEach(release => {
      const year = new Date(release.date_released).getFullYear().toString();
      years.add(year);
    });
    // Add current year if not present
    years.add(currentYear.toString());
    return Array.from(years).sort((a, b) => parseInt(b) - parseInt(a));
  }, [releases, currentYear]);

  // Filter releases by selected year
  const filteredReleases = useMemo(() => {
    return releases.filter(release => {
      const releaseYear = new Date(release.date_released).getFullYear().toString();
      return releaseYear === selectedYear;
    });
  }, [releases, selectedYear]);

  // Calculate summary by destination
  const destinationSummary = useMemo(() => {
    const summary: Record<string, { 
      destination: string; 
      totalBoxes: number; 
      totalPieces: number; 
      deliveryCount: number;
      deliveredCount: number;
      receivedBoxes: number;
      receivedPieces: number;
    }> = {};

    filteredReleases.forEach(release => {
      const dest = release.destination || 'Unknown';
      if (!summary[dest]) {
        summary[dest] = {
          destination: dest,
          totalBoxes: 0,
          totalPieces: 0,
          deliveryCount: 0,
          deliveredCount: 0,
          receivedBoxes: 0,
          receivedPieces: 0,
        };
      }
      summary[dest].totalBoxes += release.boxes_released;
      
      // Get pieces per box from the item
      const item = items.find(i => i.id === release.item_id);
      const piecesPerBox = item?.pieces_per_box || 1;
      summary[dest].totalPieces += release.boxes_released * piecesPerBox;
      summary[dest].deliveryCount += 1;
      if (release.delivery_status === 'delivered') {
        summary[dest].deliveredCount += 1;
        summary[dest].receivedBoxes += release.boxes_released;
        summary[dest].receivedPieces += release.boxes_released * piecesPerBox;
      }
    });

    return Object.values(summary).sort((a, b) => b.totalBoxes - a.totalBoxes);
  }, [filteredReleases, items]);

  // Monthly summary for chart
  const monthlySummary = useMemo(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlyData = months.map((month, index) => ({
      month,
      boxes: 0,
      pieces: 0,
    }));

    filteredReleases.forEach(release => {
      const monthIndex = new Date(release.date_released).getMonth();
      monthlyData[monthIndex].boxes += release.boxes_released;
      
      const item = items.find(i => i.id === release.item_id);
      const piecesPerBox = item?.pieces_per_box || 1;
      monthlyData[monthIndex].pieces += release.boxes_released * piecesPerBox;
    });

    return monthlyData;
  }, [filteredReleases, items]);

  // Total statistics
  const totalStats = useMemo(() => {
    const totalBoxes = filteredReleases.reduce((sum, r) => sum + r.boxes_released, 0);
    let totalPieces = 0;
    
    filteredReleases.forEach(release => {
      const item = items.find(i => i.id === release.item_id);
      const piecesPerBox = item?.pieces_per_box || 1;
      totalPieces += release.boxes_released * piecesPerBox;
    });

    const deliveredCount = filteredReleases.filter(r => r.delivery_status === 'delivered').length;
    const uniqueDestinations = new Set(filteredReleases.map(r => r.destination)).size;

    return {
      totalBoxes,
      totalPieces,
      totalDeliveries: filteredReleases.length,
      deliveredCount,
      uniqueDestinations,
    };
  }, [filteredReleases, items]);

  // Pie chart data for top destinations
  const pieChartData = useMemo(() => {
    const topDestinations = destinationSummary.slice(0, 5);
    const otherBoxes = destinationSummary.slice(5).reduce((sum, d) => sum + d.totalBoxes, 0);
    
    const data = topDestinations.map(d => ({
      name: d.destination.length > 15 ? d.destination.substring(0, 15) + '...' : d.destination,
      value: d.totalBoxes,
    }));

    if (otherBoxes > 0) {
      data.push({ name: 'Others', value: otherBoxes });
    }

    return data;
  }, [destinationSummary]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <BarChart3 className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Summary Report</h1>
            <p className="text-muted-foreground">Delivery statistics by destination per year</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Select Year" />
            </SelectTrigger>
            <SelectContent>
              {availableYears.map(year => (
                <SelectItem key={year} value={year}>{year}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="animate-fade-in" style={{ animationDelay: '0.1s' }}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Boxes Released</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalStats.totalBoxes.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {totalStats.totalPieces.toLocaleString()} total pieces
            </p>
          </CardContent>
        </Card>

        <Card className="animate-fade-in" style={{ animationDelay: '0.15s' }}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Deliveries</CardTitle>
            <Truck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalStats.totalDeliveries.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {totalStats.deliveredCount} delivered
            </p>
          </CardContent>
        </Card>

        <Card className="animate-fade-in" style={{ animationDelay: '0.2s' }}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Destinations Served</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalStats.uniqueDestinations}</div>
            <p className="text-xs text-muted-foreground">unique locations</p>
          </CardContent>
        </Card>

        <Card className="animate-fade-in" style={{ animationDelay: '0.25s' }}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Delivery Rate</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalStats.totalDeliveries > 0 
                ? Math.round((totalStats.deliveredCount / totalStats.totalDeliveries) * 100) 
                : 0}%
            </div>
            <p className="text-xs text-muted-foreground">completion rate</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Monthly Bar Chart */}
        <Card className="lg:col-span-2 animate-fade-in" style={{ animationDelay: '0.3s' }}>
          <CardHeader>
            <CardTitle>Monthly Releases ({selectedYear})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlySummary}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                  />
                  <Bar dataKey="boxes" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Boxes" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Pie Chart for Destinations */}
        <Card className="animate-fade-in" style={{ animationDelay: '0.35s' }}>
          <CardHeader>
            <CardTitle>Top Destinations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {pieChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {pieChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  No data available
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Destination Summary Table */}
      <Card className="animate-fade-in" style={{ animationDelay: '0.4s' }}>
        <CardHeader>
          <CardTitle>Deliveries by Destination ({selectedYear})</CardTitle>
        </CardHeader>
        <CardContent>
          {destinationSummary.length > 0 ? (
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Store/Destination</TableHead>
                    <TableHead className="text-right">Sent Boxes</TableHead>
                    <TableHead className="text-right">Sent Pieces</TableHead>
                    <TableHead className="text-right">Received Boxes</TableHead>
                    <TableHead className="text-right">Received Pieces</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {destinationSummary.map((item, index) => (
                    <TableRow key={item.destination}>
                      <TableCell className="font-medium">{index + 1}</TableCell>
                      <TableCell className="font-medium">{item.destination}</TableCell>
                      <TableCell className="text-right">{item.totalBoxes.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{item.totalPieces.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-green-600 dark:text-green-400 font-medium">{item.receivedBoxes.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-green-600 dark:text-green-400 font-medium">{item.receivedPieces.toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                          item.deliveryCount > 0 && (item.deliveredCount / item.deliveryCount) >= 0.8
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : item.deliveryCount > 0 && (item.deliveredCount / item.deliveryCount) >= 0.5
                            ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                            : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                        }`}>
                          {item.deliveryCount > 0 
                            ? Math.round((item.deliveredCount / item.deliveryCount) * 100) 
                            : 0}%
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Package className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium">No deliveries found</h3>
              <p className="text-muted-foreground">No releases recorded for {selectedYear}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SummaryReport;
