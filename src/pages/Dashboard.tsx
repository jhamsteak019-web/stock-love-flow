import { useMemo, useRef, useState, useEffect } from "react";
import { useInventory } from '@/hooks/useInventory';
import { useAuth } from '@/contexts/AuthContext';
import { StatCard } from '@/components/dashboard/StatCard';
import { Package, CheckCircle, Clock, MapPin, TrendingUp, Store, BarChart3, Calendar, FileDown, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, 
  BarChart, Bar, XAxis, YAxis, CartesianGrid 
} from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { toast } from 'sonner';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#6366F1', '#14B8A6', '#F97316'];

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const STORAGE_KEY = 'dashboard_filter';

const Dashboard = () => {
  const { releases, loading, getStats } = useInventory();
  const { userRole } = useAuth();
  const dashboardRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  
  // Get saved filter from localStorage or use current date
  const getSavedFilter = () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          month: typeof parsed.month === 'number' ? parsed.month : new Date().getMonth(),
          year: typeof parsed.year === 'number' ? parsed.year : new Date().getFullYear()
        };
      }
    } catch {}
    return { month: new Date().getMonth(), year: new Date().getFullYear() };
  };

  const savedFilter = getSavedFilter();
  const [selectedMonth, setSelectedMonth] = useState<number>(savedFilter.month);
  const [selectedYear, setSelectedYear] = useState<number>(savedFilter.year);
  
  // Persist filter to localStorage when it changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ month: selectedMonth, year: selectedYear }));
  }, [selectedMonth, selectedYear]);
  
  const canExportPDF = userRole === 'admin' || userRole === 'staff';

  // Filter releases by selected month and year - use set_date (Date Out) if available for proper month categorization
  const filteredReleases = useMemo(() => {
    return releases.filter(release => {
      // Use set_date (Date Out) as primary filter since that's when the item was actually sent out
      const dateToUse = release.set_date || release.date_released;
      const releaseDate = new Date(dateToUse);
      return releaseDate.getMonth() === selectedMonth && releaseDate.getFullYear() === selectedYear;
    });
  }, [releases, selectedMonth, selectedYear]);

  // Use filtered releases for stats
  const stats = useMemo(() => {
    const deliveredCount = filteredReleases.filter(r => r.delivery_status === 'delivered').length;
    const pendingDeliveries = filteredReleases.filter(r => r.delivery_status === 'pending').length;
    return { deliveredCount, pendingDeliveries };
  }, [filteredReleases]);

  const handleExportPDF = async () => {
    if (!dashboardRef.current) return;
    
    setIsExporting(true);
    toast.info('Generating PDF...');
    
    try {
      const canvas = await html2canvas(dashboardRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });
      
      const imgWidth = 210;
      const pageHeight = 297;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;
      
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      
      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }
      
      const today = new Date().toISOString().split('T')[0];
      pdf.save(`dashboard-report-${today}.pdf`);
      toast.success('PDF exported successfully!');
    } catch (error) {
      console.error('PDF export error:', error);
      toast.error('Failed to export PDF');
    } finally {
      setIsExporting(false);
    }
  };

  const totals = useMemo(() => {
    let totalBoxes = 0;
    let totalQty = 0;
    let deliveredBoxes = 0;
    let deliveredQty = 0;

    filteredReleases.forEach(release => {
      totalBoxes += release.boxes_released || 0;
      totalQty += release.total_qty || 0;
      if (release.delivery_status === 'delivered') {
        deliveredBoxes += release.boxes_released || 0;
        deliveredQty += release.total_qty || 0;
      }
    });

    return { totalBoxes, totalQty, deliveredBoxes, deliveredQty };
  }, [filteredReleases]);

  const uniqueBranches = useMemo(() => {
    const branches = new Set(filteredReleases.map(r => r.destination));
    return branches.size;
  }, [filteredReleases]);

  const completionRate = useMemo(() => {
    if (filteredReleases.length === 0) return 0;
    return Math.round((stats.deliveredCount / filteredReleases.length) * 100);
  }, [filteredReleases.length, stats.deliveredCount]);

  const topStoresDelivery = useMemo(() => {
    const storeData: Record<string, { store: string; boxes: number; qty: number; deliveries: number; delivered: number }> = {};
    
    filteredReleases.forEach(release => {
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
      .sort((a, b) => b.boxes - a.boxes);
  }, [filteredReleases]);

  const storeCompletionRates = useMemo(() => {
    const storeData: Record<string, { 
      totalBoxes: number; 
      deliveredBoxes: number;
      totalQty: number;
      deliveredQty: number;
      total: number;
      delivered: number;
    }> = {};
    
    filteredReleases.forEach(release => {
      const store = release.destination || 'Unknown';
      if (!storeData[store]) {
        storeData[store] = { totalBoxes: 0, deliveredBoxes: 0, totalQty: 0, deliveredQty: 0, total: 0, delivered: 0 };
      }
      storeData[store].totalBoxes += release.boxes_released || 0;
      storeData[store].totalQty += release.total_qty || 0;
      storeData[store].total += 1;
      if (release.delivery_status === 'delivered') {
        storeData[store].deliveredBoxes += release.boxes_released || 0;
        storeData[store].deliveredQty += release.total_qty || 0;
        storeData[store].delivered += 1;
      }
    });

    return Object.entries(storeData)
      .map(([store, data]) => ({
        store,
        ...data,
        percentage: data.total > 0 ? Math.round((data.delivered / data.total) * 100) : 0
      }))
      .sort((a, b) => b.totalBoxes - a.totalBoxes);
  }, [filteredReleases]);

  const branchDeliveryStatus = useMemo(() => {
    const branchData: Record<string, { 
      branch: string; 
      pending: number; 
      inTransit: number; 
      outForDelivery: number;
      delivered: number;
      total: number;
      totalBoxes: number;
      totalQty: number;
      deliveredBoxes: number;
      deliveredQty: number;
    }> = {};
    
    filteredReleases.forEach(release => {
      const branch = release.destination || 'Unknown';
      if (!branchData[branch]) {
        branchData[branch] = { 
          branch, pending: 0, inTransit: 0, outForDelivery: 0, delivered: 0, total: 0,
          totalBoxes: 0, totalQty: 0, deliveredBoxes: 0, deliveredQty: 0
        };
      }
      branchData[branch].total += 1;
      branchData[branch].totalBoxes += release.boxes_released || 0;
      branchData[branch].totalQty += release.total_qty || 0;
      
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
          branchData[branch].deliveredBoxes += release.boxes_released || 0;
          branchData[branch].deliveredQty += release.total_qty || 0;
          break;
      }
    });

    return Object.values(branchData)
      .sort((a, b) => b.totalBoxes - a.totalBoxes);
  }, [filteredReleases]);

  const topStoresByCategory = useMemo(() => {
    const categoryData: Record<string, Record<string, { boxes: number; qty: number }>> = {};
    
    filteredReleases.forEach(release => {
      const category = release.category?.trim().toUpperCase() || 'UNCATEGORIZED';
      const store = release.destination || 'Unknown';
      
      if (!categoryData[category]) {
        categoryData[category] = {};
      }
      if (!categoryData[category][store]) {
        categoryData[category][store] = { boxes: 0, qty: 0 };
      }
      categoryData[category][store].boxes += release.boxes_released || 0;
      categoryData[category][store].qty += release.total_qty || 0;
    });

    return Object.entries(categoryData)
      .map(([category, stores]) => ({
        category,
        stores: Object.entries(stores)
          .map(([store, data]) => ({ store, ...data }))
          .sort((a, b) => b.boxes - a.boxes)
      }))
      .filter(cat => cat.stores.length > 0)
      .sort((a, b) => {
        const totalA = a.stores.reduce((sum, s) => sum + s.boxes, 0);
        const totalB = b.stores.reduce((sum, s) => sum + s.boxes, 0);
        return totalB - totalA;
      });
  }, [filteredReleases]);

  const monthlyDeliveryStatus = useMemo(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlyData = months.map((month) => ({
      month,
      pending: 0,
      inTransit: 0,
      outForDelivery: 0,
      delivered: 0,
      totalBoxes: 0,
      totalQty: 0
    }));

    releases.forEach(release => {
      const releaseDate = new Date(release.date_released);
      if (releaseDate.getFullYear() === 2025) {
        const monthIndex = releaseDate.getMonth();
        monthlyData[monthIndex].totalBoxes += release.boxes_released || 0;
        monthlyData[monthIndex].totalQty += release.total_qty || 0;
        
        switch (release.delivery_status) {
          case 'pending':
            monthlyData[monthIndex].pending += 1;
            break;
          case 'in_transit':
            monthlyData[monthIndex].inTransit += 1;
            break;
          case 'out_for_delivery':
            monthlyData[monthIndex].outForDelivery += 1;
            break;
          case 'delivered':
            monthlyData[monthIndex].delivered += 1;
            break;
        }
      }
    });

    return monthlyData;
  }, [releases]);

  // Data for pie chart - store distribution by boxes
  const storePieData = useMemo(() => {
    return topStoresDelivery.map((store, index) => ({
      name: store.store,
      value: store.boxes,
      qty: store.qty,
      color: COLORS[index % COLORS.length]
    }));
  }, [topStoresDelivery]);

  // Category totals for pie chart
  const categoryPieData = useMemo(() => {
    const categoryTotals: Record<string, number> = {};
    
    filteredReleases.forEach(release => {
      const category = release.category?.trim().toUpperCase() || 'UNCATEGORIZED';
      if (!categoryTotals[category]) {
        categoryTotals[category] = 0;
      }
      categoryTotals[category] += release.boxes_released || 0;
    });

    return Object.entries(categoryTotals)
      .map(([name, value], index) => ({
        name,
        value,
        color: COLORS[index % COLORS.length]
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8); // Limit to 8 categories for readability
  }, [filteredReleases]);

  // Monthly delivery by category (stacked bar chart)
  const monthlyByCategory = useMemo(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const categories = new Set<string>();
    
    // Get all unique categories
    releases.forEach(release => {
      const category = release.category?.trim().toUpperCase() || 'UNCATEGORIZED';
      categories.add(category);
    });

    const categoryList = Array.from(categories).slice(0, 6); // Limit to 6 categories for readability
    
    const monthlyData = months.map((month) => {
      const data: Record<string, number | string> = { month };
      categoryList.forEach(cat => {
        data[cat] = 0;
      });
      return data;
    });

    releases.forEach(release => {
      const releaseDate = new Date(release.date_released);
      if (releaseDate.getFullYear() === 2025) {
        const monthIndex = releaseDate.getMonth();
        const category = release.category?.trim().toUpperCase() || 'UNCATEGORIZED';
        if (categoryList.includes(category)) {
          (monthlyData[monthIndex][category] as number) += release.boxes_released || 0;
        }
      }
    });

    return { data: monthlyData, categories: categoryList };
  }, [releases]);

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground">Overview of your inventory and deliveries</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Month/Year Filter */}
          <div className="flex items-center gap-2 bg-muted/50 border border-border rounded-lg px-3 py-1.5">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <Select value={selectedMonth.toString()} onValueChange={(val) => setSelectedMonth(parseInt(val))}>
              <SelectTrigger className="w-[110px] h-8 border-0 bg-transparent focus:ring-0">
                <SelectValue placeholder="Month" />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((month, index) => (
                  <SelectItem key={index} value={index.toString()}>{month}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedYear.toString()} onValueChange={(val) => setSelectedYear(parseInt(val))}>
              <SelectTrigger className="w-[80px] h-8 border-0 bg-transparent focus:ring-0">
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                {[2024, 2025, 2026].map((year) => (
                  <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {canExportPDF && (
            <Button onClick={handleExportPDF} disabled={isExporting} className="gap-2">
              {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
              Save to PDF
            </Button>
          )}
        </div>
      </div>

      <div ref={dashboardRef} className="space-y-6 bg-background">
        {/* Stats Grid */}
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
            subtitle={`${totals.deliveredBoxes.toLocaleString()} boxes`}
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

        {/* Two charts side by side */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Top Store Delivery - Bar Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                Top Store Delivery (Boxes) - All Stores
              </CardTitle>
            </CardHeader>
            <CardContent>
              {topStoresDelivery.length === 0 ? (
                <p className="text-sm text-muted-foreground">No store data available</p>
              ) : (
                <div className="h-[350px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topStoresDelivery} margin={{ top: 20, right: 30, left: 20, bottom: 80 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis 
                        dataKey="store" 
                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} 
                        angle={-45}
                        textAnchor="end"
                        interval={0}
                        height={80}
                      />
                      <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))', 
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                        formatter={(value: number, name: string) => [
                          `${value.toLocaleString()}`,
                          name === 'boxes' ? 'Boxes' : 'Qty'
                        ]}
                      />
                      <Bar dataKey="boxes" name="Boxes" radius={[4, 4, 0, 0]}>
                        {topStoresDelivery.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Delivery by Category - Pie Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Store className="h-5 w-5 text-primary" />
                Delivery by Category (Boxes)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {categoryPieData.length === 0 ? (
                <p className="text-sm text-muted-foreground">No category data available</p>
              ) : (
                <div className="h-[350px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryPieData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        outerRadius={120}
                        fill="#8884d8"
                        dataKey="value"
                        label={({ name, percent }) => `${name.length > 10 ? name.substring(0, 10) + '...' : name} ${(percent * 100).toFixed(0)}%`}
                      >
                        {categoryPieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))', 
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                        formatter={(value: number) => [`${value.toLocaleString()} boxes`, 'Total']}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Delivery Completion Rate - All Stores */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Delivery Completion Rate - All Stores</CardTitle>
            <Badge variant="secondary" className="text-sm">
              {completionRate}% Overall
            </Badge>
          </CardHeader>
          <CardContent>
            {storeCompletionRates.length === 0 ? (
              <p className="text-sm text-muted-foreground">No store data available</p>
            ) : (
              <div className="space-y-4 max-h-[400px] overflow-y-auto">
                {storeCompletionRates.map((store) => (
                  <div key={store.store} className="space-y-1.5 border-b border-border/50 pb-3 last:border-0">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-foreground font-medium truncate max-w-[200px]" title={store.store}>
                        {store.store}
                      </span>
                      <div className="flex items-center gap-4 text-muted-foreground text-xs">
                        <span>Boxes: {store.deliveredBoxes.toLocaleString()}/{store.totalBoxes.toLocaleString()}</span>
                        <span>Qty: {store.deliveredQty.toLocaleString()}/{store.totalQty.toLocaleString()}</span>
                        <Badge variant={store.percentage >= 80 ? "default" : store.percentage >= 50 ? "secondary" : "destructive"}>
                          {store.percentage}%
                        </Badge>
                      </div>
                    </div>
                    <Progress value={store.percentage} className="h-2" />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Branch Delivery Status - All Stores with Box and Qty */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              Branch Delivery Status - All Stores (Boxes & Qty)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {branchDeliveryStatus.length === 0 ? (
              <p className="text-sm text-muted-foreground">No branch data available</p>
            ) : (
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                <table className="w-full">
                  <thead className="sticky top-0 bg-card z-10">
                    <tr className="border-b border-border">
                      <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Branch</th>
                      <th className="text-center py-3 px-2 text-sm font-medium text-muted-foreground">Boxes</th>
                      <th className="text-center py-3 px-2 text-sm font-medium text-muted-foreground">Qty</th>
                      <th className="text-center py-3 px-2 text-sm font-medium text-muted-foreground">Pending</th>
                      <th className="text-center py-3 px-2 text-sm font-medium text-muted-foreground">In Transit</th>
                      <th className="text-center py-3 px-2 text-sm font-medium text-muted-foreground">Out for Delivery</th>
                      <th className="text-center py-3 px-2 text-sm font-medium text-muted-foreground">Delivered</th>
                      <th className="text-center py-3 px-2 text-sm font-medium text-muted-foreground">Delivered Boxes</th>
                      <th className="text-center py-3 px-2 text-sm font-medium text-muted-foreground">Delivered Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {branchDeliveryStatus.map((branch) => (
                      <tr key={branch.branch} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                        <td className="py-3 px-2">
                          <span className="text-sm font-medium text-foreground truncate max-w-[180px] block" title={branch.branch}>
                            {branch.branch}
                          </span>
                        </td>
                        <td className="text-center py-3 px-2">
                          <span className="text-sm font-semibold text-primary">{branch.totalBoxes.toLocaleString()}</span>
                        </td>
                        <td className="text-center py-3 px-2">
                          <span className="text-sm text-muted-foreground">{branch.totalQty.toLocaleString()}</span>
                        </td>
                        <td className="text-center py-3 px-2">
                          <Badge variant="outline" className="bg-yellow-100 text-yellow-700 border-yellow-300 min-w-[40px] justify-center">
                            {branch.pending}
                          </Badge>
                        </td>
                        <td className="text-center py-3 px-2">
                          <Badge variant="outline" className="bg-blue-100 text-blue-700 border-blue-300 min-w-[40px] justify-center">
                            {branch.inTransit}
                          </Badge>
                        </td>
                        <td className="text-center py-3 px-2">
                          <Badge variant="outline" className="bg-purple-100 text-purple-700 border-purple-300 min-w-[40px] justify-center">
                            {branch.outForDelivery}
                          </Badge>
                        </td>
                        <td className="text-center py-3 px-2">
                          <Badge variant="outline" className="bg-green-100 text-green-700 border-green-300 min-w-[40px] justify-center">
                            {branch.delivered}
                          </Badge>
                        </td>
                        <td className="text-center py-3 px-2">
                          <span className="text-sm font-semibold text-green-600">{branch.deliveredBoxes.toLocaleString()}</span>
                        </td>
                        <td className="text-center py-3 px-2">
                          <span className="text-sm text-green-600">{branch.deliveredQty.toLocaleString()}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Stores by Category */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Store className="h-5 w-5 text-primary" />
              Top Stores by Category - All Stores
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topStoresByCategory.length === 0 ? (
              <p className="text-sm text-muted-foreground">No category data available</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 max-h-[600px] overflow-y-auto">
                {topStoresByCategory.map((cat, catIndex) => (
                  <div key={cat.category} className="rounded-lg border border-border bg-muted/20 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: COLORS[catIndex % COLORS.length] }}
                      />
                      <h4 className="font-semibold text-foreground">{cat.category}</h4>
                      <Badge variant="secondary" className="text-xs ml-auto">
                        {cat.stores.reduce((sum, s) => sum + s.boxes, 0).toLocaleString()} boxes
                      </Badge>
                    </div>
                    <div className="space-y-2 max-h-[200px] overflow-y-auto">
                      {cat.stores.map((store, index) => (
                        <div key={store.store} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-primary w-5">{index + 1}.</span>
                            <span className="text-foreground truncate max-w-[120px]" title={store.store}>
                              {store.store}
                            </span>
                          </div>
                          <div className="text-right text-xs text-muted-foreground">
                            <span className="font-semibold text-foreground">{store.boxes.toLocaleString()}</span> boxes
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Monthly Delivery Status 2025 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              Monthly Delivery Status (2025)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyDeliveryStatus} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                  <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Legend />
                  <Bar dataKey="pending" stackId="a" fill="#F59E0B" name="Pending" />
                  <Bar dataKey="inTransit" stackId="a" fill="#3B82F6" name="In Transit" />
                  <Bar dataKey="outForDelivery" stackId="a" fill="#8B5CF6" name="Out for Delivery" />
                  <Bar dataKey="delivered" stackId="a" fill="#10B981" name="Delivered" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {/* Monthly Summary Table */}
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">Month</th>
                    <th className="text-center py-2 px-2 font-medium text-muted-foreground">Boxes</th>
                    <th className="text-center py-2 px-2 font-medium text-muted-foreground">Qty</th>
                    <th className="text-center py-2 px-2 font-medium text-muted-foreground">Pending</th>
                    <th className="text-center py-2 px-2 font-medium text-muted-foreground">In Transit</th>
                    <th className="text-center py-2 px-2 font-medium text-muted-foreground">Out for Delivery</th>
                    <th className="text-center py-2 px-2 font-medium text-muted-foreground">Delivered</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyDeliveryStatus.filter(m => m.pending + m.inTransit + m.outForDelivery + m.delivered > 0).map((month) => (
                    <tr key={month.month} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="py-2 px-2 font-medium text-foreground">{month.month}</td>
                      <td className="text-center py-2 px-2 text-primary font-semibold">{month.totalBoxes.toLocaleString()}</td>
                      <td className="text-center py-2 px-2 text-muted-foreground">{month.totalQty.toLocaleString()}</td>
                      <td className="text-center py-2 px-2">
                        <Badge variant="outline" className="bg-yellow-100 text-yellow-700 border-yellow-300">
                          {month.pending}
                        </Badge>
                      </td>
                      <td className="text-center py-2 px-2">
                        <Badge variant="outline" className="bg-blue-100 text-blue-700 border-blue-300">
                          {month.inTransit}
                        </Badge>
                      </td>
                      <td className="text-center py-2 px-2">
                        <Badge variant="outline" className="bg-purple-100 text-purple-700 border-purple-300">
                          {month.outForDelivery}
                        </Badge>
                      </td>
                      <td className="text-center py-2 px-2">
                        <Badge variant="outline" className="bg-green-100 text-green-700 border-green-300">
                          {month.delivered}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
