import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, TrendingUp, Package, Truck, Calendar, Store, ShoppingBag, Printer, CheckCircle, Search, FileDown, FileSpreadsheet, DollarSign, Users, ClipboardList } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useInventory } from '@/hooks/useInventory';
import { useStockReleasesForPeriod } from '@/hooks/useStockReleasesForPeriod';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { format, differenceInDays, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { exportToExcel } from '@/lib/excelExport';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import AllocationBillModal from '@/components/deliveries/AllocationBillModal';
import type { StockRelease } from '@/types/inventory';

const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

interface DeliveredSummaryItem {
  batch_id: string;
  allocation_bill: string | null;
  set_date: string | null;
  date_delivered: string | null;
  courier: string | null;
  category: string | null;
  categories: string[];
  boxes: number;
  qty: number;
  amount: number;
  delivery_status: string;
  remarks: string | null;
  releases: StockRelease[];
}

const SummaryReport = () => {
  const { loading: inventoryLoading } = useInventory();
  const { userRole } = useAuth();
  const { selectedBranch } = useBranch();
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();
  
  const [selectedYear, setSelectedYear] = useState(currentYear.toString());
  const [selectedMonth, setSelectedMonth] = useState(currentMonth.toString());
  const [showAllYear, setShowAllYear] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [activeTab, setActiveTab] = useState('branch-report');
  const [branchSearch, setBranchSearch] = useState('');
  const [branchCategoryFilters, setBranchCategoryFilters] = useState<Record<string, string>>({});
  const [remarksFilter, setRemarksFilter] = useState<'all' | 'ro' | 'new'>('all');
  const [selectedSummaryItem, setSelectedSummaryItem] = useState<DeliveredSummaryItem | null>(null);

  // Use paginated hook to fetch ALL releases for selected period (bypasses 1000 row limit)
  const { releases: periodReleases, loading: periodLoading } = useStockReleasesForPeriod({
    month: parseInt(selectedMonth),
    year: parseInt(selectedYear),
    branchId: selectedBranch?.id ?? null,
    allYear: showAllYear,
  });

  const CATEGORY_OPTIONS = ['MHB', 'MLP', 'MSH', 'MUM', 'CE', 'CL', 'LX', 'CX', 'XD', 'XP'];
  
  const isViewer = userRole === 'viewer';
  const canExport = userRole !== 'uploader';
  const loading = inventoryLoading || periodLoading;

  // Fetch attendance records
  const { data: attendanceRecords = [] } = useQuery({
    queryKey: ['attendance-summary', selectedYear, selectedMonth],
    queryFn: async () => {
      const monthNum = parseInt(selectedMonth) + 1;
      const startDate = `${selectedYear}-${String(monthNum).padStart(2, '0')}-01`;
      const endDate = format(endOfMonth(new Date(parseInt(selectedYear), parseInt(selectedMonth))), 'yyyy-MM-dd');
      
      const { data, error } = await supabase
        .from('attendance_records')
        .select('*, employees(full_name, branch, category, photo_url)')
        .gte('attendance_date', startDate)
        .lte('attendance_date', endDate);
      
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch employees for resume to work stats
  const { data: employees = [] } = useQuery({
    queryKey: ['employees-summary'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .eq('is_active', true);
      
      if (error) throw error;
      return data || [];
    },
  });

  // Attendance summary data
  const attendanceSummary = useMemo(() => {
    const statusCounts: Record<string, number> = {};
    const branchCounts: Record<string, { total: number; statuses: Record<string, number> }> = {};
    
    attendanceRecords.forEach((record: any) => {
      const status = record.status || 'unknown';
      const branch = record.employees?.branch || 'Unknown';
      
      // Count by status
      statusCounts[status] = (statusCounts[status] || 0) + 1;
      
      // Count by branch
      if (!branchCounts[branch]) {
        branchCounts[branch] = { total: 0, statuses: {} };
      }
      branchCounts[branch].total += 1;
      branchCounts[branch].statuses[status] = (branchCounts[branch].statuses[status] || 0) + 1;
    });
    
    const statusData = Object.entries(statusCounts)
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);
    
    const branchData = Object.entries(branchCounts)
      .map(([branch, data]) => ({ branch, ...data }))
      .sort((a, b) => b.total - a.total);
    
    // Resume to work stats (records with date_of_resume)
    const resumeRecords = attendanceRecords.filter((r: any) => r.date_of_resume);
    
    return {
      totalRecords: attendanceRecords.length,
      statusData,
      branchData,
      resumeCount: resumeRecords.length,
      totalEmployees: employees.length,
    };
  }, [attendanceRecords, employees]);

  // Export to PDF function
  const handleExportPDF = () => {
    const doc = new jsPDF();
    
    doc.setFontSize(16);
    doc.text('Summary Report', 14, 15);
    doc.setFontSize(10);
    doc.text(`${MONTHS[parseInt(selectedMonth)]} ${selectedYear}`, 14, 22);
    doc.text(`Category: ${selectedCategory === 'all' ? 'All Categories' : selectedCategory}`, 14, 28);
    doc.text(`Generated: ${format(new Date(), 'MMM dd, yyyy HH:mm')}`, 14, 34);

    // Stats summary
    doc.setFontSize(12);
    doc.text('Overview', 14, 44);
    doc.setFontSize(9);
    doc.text(`Total Boxes: ${totalStats.totalBoxes.toLocaleString()}`, 14, 51);
    doc.text(`Total Qty: ${totalStats.totalQty.toLocaleString()}`, 60, 51);
    doc.text(`Delivered: ${totalStats.deliveredCount}`, 110, 51);
    doc.text(`Pending: ${totalStats.pendingCount}`, 150, 51);

    // Branch Report Table
    const branchColumns = ['Branch', 'Total', 'Delivered', 'Pending', 'Boxes', 'Qty'];
    const branchRows = branchReport.map(b => [
      b.branch,
      b.totalDeliveries.toString(),
      b.deliveredCount.toString(),
      (b.pendingCount + b.inTransitCount + b.outForDeliveryCount).toString(),
      b.totalBoxes.toString(),
      b.totalQty.toString()
    ]);

    (doc as any).autoTable({
      head: [branchColumns],
      body: branchRows,
      startY: 58,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [59, 130, 246] },
    });

    doc.save(`summary-report-${MONTHS[parseInt(selectedMonth)]}-${selectedYear}.pdf`);
    toast.success('PDF exported successfully!');
  };

  // Export to Excel function
  const handleExportExcel = async () => {
    try {
      const excelData = branchReport.map(b => ({
        branch: b.branch,
        totalDeliveries: b.totalDeliveries,
        delivered: b.deliveredCount,
        pending: b.pendingCount + b.inTransitCount + b.outForDeliveryCount,
        totalBoxes: b.totalBoxes,
        totalQty: b.totalQty,
      }));

      await exportToExcel({
        title: 'Summary Report',
        subtitle: `${MONTHS[parseInt(selectedMonth)]} ${selectedYear} - ${selectedCategory === 'all' ? 'All Categories' : selectedCategory}`,
        filename: `summary-report-${MONTHS[parseInt(selectedMonth)]}-${selectedYear}`,
        columns: [
          { header: 'Branch', key: 'branch', width: 25 },
          { header: 'Total Deliveries', key: 'totalDeliveries', width: 18 },
          { header: 'Delivered', key: 'delivered', width: 14 },
          { header: 'Pending', key: 'pending', width: 14 },
          { header: 'Total Boxes', key: 'totalBoxes', width: 14 },
          { header: 'Total Qty', key: 'totalQty', width: 14 },
        ],
        data: excelData,
        showTotals: true,
        totalColumns: ['totalDeliveries', 'delivered', 'pending', 'totalBoxes', 'totalQty'],
      });
      toast.success('Excel exported successfully!');
    } catch (error) {
      console.error('Excel export error:', error);
      toast.error('Failed to export Excel');
    }
  };

  // Get available years from releases
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    periodReleases.forEach(release => {
      const year = new Date(release.date_released).getFullYear().toString();
      years.add(year);
    });
    years.add(currentYear.toString());
    // Add common years
    for (let y = currentYear; y >= currentYear - 5; y--) {
      years.add(y.toString());
    }
    return Array.from(years).sort((a, b) => parseInt(b) - parseInt(a));
  }, [periodReleases, currentYear]);

  // Filter releases by category only (month/year/branch already filtered by the hook)
  const filteredReleases = useMemo(() => {
    return periodReleases.filter(release => {
      // Category filter
      const matchesCategory = selectedCategory === 'all' || 
        (release.category?.trim().toUpperCase() === selectedCategory.toUpperCase());
      
      return matchesCategory;
    });
  }, [periodReleases, selectedCategory]);

  // Group filtered releases by batch_id to avoid counting same delivery multiple times
  const groupedByBatch = useMemo(() => {
    const batches: Record<string, {
      batch_id: string;
      destination: string;
      category: string | null;
      delivery_status: string;
      boxes_released: number;
      total_qty: number;
      set_date: string | null;
      date_released: string;
    }> = {};

    filteredReleases.forEach(release => {
      const normalizedAllocation = release.allocation_bill?.trim().toLowerCase();
      const batchKey = normalizedAllocation ? `allocation:${normalizedAllocation}` : release.batch_id || release.id;
      // Normalize category: trim whitespace and convert to uppercase
      const normalizedCategory = release.category?.trim().toUpperCase() || null;
      if (!batches[batchKey]) {
        batches[batchKey] = {
          batch_id: batchKey,
          destination: release.destination,
          category: normalizedCategory,
          delivery_status: release.delivery_status,
          boxes_released: 0,
          total_qty: 0,
          set_date: release.set_date,
          date_released: release.date_released,
        };
      }
      batches[batchKey].boxes_released += release.boxes_released;
      batches[batchKey].total_qty += release.total_qty || 0;
    });

    return Object.values(batches);
  }, [filteredReleases]);

  // Filter releases by year only (for yearly stats) - use periodReleases
  const yearlyReleases = useMemo(() => {
    return periodReleases.filter(release => {
      // Use set_date (Date Out Warehouse) for filtering, fallback to date_released
      const dateToUse = release.set_date || release.date_released;
      const releaseYear = new Date(dateToUse).getFullYear().toString();
      return releaseYear === selectedYear;
    });
  }, [periodReleases, selectedYear]);

  // Branch/Store Report - Pending vs Delivered per branch
  const branchReport = useMemo(() => {
    const branches: Record<string, {
      branch: string;
      totalDeliveries: number;
      pendingCount: number;
      inTransitCount: number;
      outForDeliveryCount: number;
      deliveredCount: number;
      totalBoxes: number;
      totalQty: number;
      totalAmount: number;
      deliveredBoxes: number;
      deliveredQty: number;
    }> = {};

    filteredReleases.forEach(release => {
      const branch = release.destination || 'Unknown';
      
      if (!branches[branch]) {
        branches[branch] = {
          branch,
          totalDeliveries: 0,
          pendingCount: 0,
          inTransitCount: 0,
          outForDeliveryCount: 0,
          deliveredCount: 0,
          totalBoxes: 0,
          totalQty: 0,
          totalAmount: 0,
          deliveredBoxes: 0,
          deliveredQty: 0,
        };
      }
      
      branches[branch].totalDeliveries += 1;
      branches[branch].totalBoxes += release.boxes_released;
      branches[branch].totalQty += release.total_qty || 0;
      branches[branch].totalAmount += release.amount || 0;
      
      switch (release.delivery_status) {
        case 'pending':
          branches[branch].pendingCount += 1;
          break;
        case 'in_transit':
          branches[branch].inTransitCount += 1;
          break;
        case 'out_for_delivery':
          branches[branch].outForDeliveryCount += 1;
          break;
        case 'delivered':
          branches[branch].deliveredCount += 1;
          branches[branch].deliveredBoxes += release.boxes_released;
          branches[branch].deliveredQty += release.total_qty || 0;
          break;
      }
    });

    return Object.values(branches).sort((a, b) => b.totalDeliveries - a.totalDeliveries);
  }, [filteredReleases]);

  // Items grouped by branch for printing (includes all statuses)
  const deliveredByBranch = useMemo(() => {
    const branches: Record<string, {
      branch: string;
      items: DeliveredSummaryItem[];
      allocationMap: Record<string, DeliveredSummaryItem>;
      totalBoxes: number;
      totalQty: number;
      totalAmount: number;
    }> = {};

    filteredReleases
      .forEach(release => {
        const branch = release.destination || 'Unknown';
        
        if (!branches[branch]) {
          branches[branch] = {
            branch,
            items: [],
            allocationMap: {},
            totalBoxes: 0,
            totalQty: 0,
            totalAmount: 0,
          };
        }

        const normalizedAllocation = release.allocation_bill?.trim().toLowerCase();
        const batchKey = normalizedAllocation ? `allocation:${normalizedAllocation}` : release.batch_id || release.id;
        const existingItem = branches[branch].allocationMap[batchKey];
        
        if (existingItem) {
          existingItem.releases.push(release);
          existingItem.boxes += release.boxes_released;
          existingItem.qty += release.total_qty || 0;
          existingItem.amount += release.amount || 0;
          existingItem.set_date = existingItem.set_date || release.set_date;
          existingItem.date_delivered = existingItem.date_delivered || release.date_delivered;
          existingItem.courier = existingItem.courier || release.courier;
          existingItem.remarks = [existingItem.remarks, release.notes].filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i).join(' | ') || null;
          if (release.category && !existingItem.categories.includes(release.category)) {
            existingItem.categories.push(release.category);
            existingItem.category = existingItem.categories.join(', ');
          }
          if (release.delivery_status !== 'delivered') {
            existingItem.delivery_status = release.delivery_status;
          }
        } else {
          const item: DeliveredSummaryItem = {
            batch_id: batchKey,
            allocation_bill: release.allocation_bill,
            set_date: release.set_date,
            date_delivered: release.date_delivered,
            courier: release.courier,
            category: release.category,
            categories: release.category ? [release.category] : [],
            boxes: release.boxes_released,
            qty: release.total_qty || 0,
            amount: release.amount || 0,
            delivery_status: release.delivery_status,
            remarks: release.notes,
            releases: [release],
          };
          branches[branch].allocationMap[batchKey] = item;
          branches[branch].items.push(item);
        }

        branches[branch].totalBoxes += release.boxes_released;
        branches[branch].totalQty += release.total_qty || 0;
        branches[branch].totalAmount += release.amount || 0;
      });

    // Sort branches by name and items by set_date ascending (earliest first)
    return Object.values(branches)
      .map(branch => ({
        branch: branch.branch,
        totalBoxes: branch.totalBoxes,
        totalQty: branch.totalQty,
        totalAmount: branch.totalAmount,
        items: branch.items.sort((a, b) => {
          const dateA = a.set_date ? new Date(a.set_date).getTime() : 0;
          const dateB = b.set_date ? new Date(b.set_date).getTime() : 0;
          return dateA - dateB;
        })
      }))
      .sort((a, b) => a.branch.localeCompare(b.branch));
  }, [filteredReleases]);

  // Filter delivered branches by search (branch name or allocation bill)
  const filteredDeliveredByBranch = useMemo(() => {
    const searchLower = branchSearch.trim().toLowerCase();
    const matchesRemarks = (remarks: string | null | undefined) => {
      if (remarksFilter === 'all') return true;
      const r = (remarks || '').toLowerCase();
      if (remarksFilter === 'ro') return r.includes('r.o') || /\bro\b/.test(r) || r.includes('repeat');
      if (remarksFilter === 'new') return r.includes('new');
      return true;
    };

    return deliveredByBranch
      .map(branch => {
        const branchMatches = !searchLower || branch.branch.toLowerCase().includes(searchLower);
        const filteredItems = branch.items.filter(item => {
          const matchesSearch =
            !searchLower ||
            branchMatches ||
            item.allocation_bill?.toLowerCase().includes(searchLower);
          return matchesSearch && matchesRemarks(item.remarks);
        });
        if (filteredItems.length === 0) return null;
        return {
          ...branch,
          items: filteredItems,
          totalBoxes: filteredItems.reduce((sum, item) => sum + item.boxes, 0),
          totalQty: filteredItems.reduce((sum, item) => sum + item.qty, 0),
          totalAmount: filteredItems.reduce((sum, item) => sum + item.amount, 0),
        };
      })
      .filter((branch): branch is NonNullable<typeof branch> => branch !== null);
  }, [deliveredByBranch, branchSearch, remarksFilter]);

  // Category breakdown per store (only delivered items = items received)
  const categoryByStore = useMemo(() => {
    const stores: Record<string, {
      store: string;
      categories: Record<string, { boxes: number; qty: number; amount: number }>;
      totalBoxes: number;
      totalQty: number;
      totalAmount: number;
    }> = {};

    // Only include delivered releases (items that were actually received)
    filteredReleases
      .filter(release => release.delivery_status === 'delivered')
      .forEach(release => {
        const store = release.destination || 'Unknown';
        const category = release.category || 'Uncategorized';
        
        if (!stores[store]) {
          stores[store] = {
            store,
            categories: {},
            totalBoxes: 0,
            totalQty: 0,
            totalAmount: 0,
          };
        }
        
        if (!stores[store].categories[category]) {
          stores[store].categories[category] = { boxes: 0, qty: 0, amount: 0 };
        }
        
        stores[store].categories[category].boxes += release.boxes_released;
        stores[store].categories[category].qty += release.total_qty || 0;
        stores[store].categories[category].amount += release.amount || 0;
        stores[store].totalBoxes += release.boxes_released;
        stores[store].totalQty += release.total_qty || 0;
        stores[store].totalAmount += release.amount || 0;
      });

    return Object.values(stores).sort((a, b) => b.totalBoxes - a.totalBoxes);
  }, [filteredReleases]);

  // Get all unique categories (only from delivered releases to match categoryByStore)
  const allCategories = useMemo(() => {
    const cats = new Set<string>();
    filteredReleases
      .filter(release => release.delivery_status === 'delivered')
      .forEach(release => {
        if (release.category) cats.add(release.category);
      });
    return Array.from(cats).sort();
  }, [filteredReleases]);

  // Get categories per branch
  const categoriesPerBranch = useMemo(() => {
    const branchCategories: Record<string, string[]> = {};
    filteredReleases.forEach(release => {
      const branch = release.destination || 'Unknown';
      if (!branchCategories[branch]) {
        branchCategories[branch] = [];
      }
      if (release.category && !branchCategories[branch].includes(release.category)) {
        branchCategories[branch].push(release.category);
      }
    });
    // Sort categories in each branch
    Object.keys(branchCategories).forEach(branch => {
      branchCategories[branch].sort();
    });
    return branchCategories;
  }, [filteredReleases]);

  // Total statistics - use groupedByBatch to avoid duplicate counting
  const totalStats = useMemo(() => {
    const totalBoxes = groupedByBatch.reduce((sum, r) => sum + r.boxes_released, 0);
    const totalQty = groupedByBatch.reduce((sum, r) => sum + r.total_qty, 0);
    const totalAmount = filteredReleases.reduce((sum, r) => sum + (r.amount || 0), 0);
    const deliveredCount = groupedByBatch.filter(r => r.delivery_status === 'delivered').length;
    const pendingCount = groupedByBatch.filter(r => r.delivery_status !== 'delivered').length;
    const uniqueDestinations = new Set(groupedByBatch.map(r => r.destination)).size;
    const deliveryPercentage = groupedByBatch.length > 0 
      ? Math.round((deliveredCount / groupedByBatch.length) * 100) 
      : 0;

    return {
      totalBoxes,
      totalQty,
      totalAmount,
      totalDeliveries: groupedByBatch.length,
      deliveredCount,
      pendingCount,
      uniqueDestinations,
      deliveryPercentage,
    };
  }, [groupedByBatch, filteredReleases]);

  // Monthly summary for chart - group by batch first
  const monthlySummary = useMemo(() => {
    const monthlyData = MONTHS.map((month, index) => ({
      month: month.substring(0, 3),
      delivered: 0,
      pending: 0,
    }));

    // Group yearly releases by batch first
    const yearlyBatches: Record<string, {
      boxes_released: number;
      delivery_status: string;
      set_date: string | null;
      date_released: string;
    }> = {};

    yearlyReleases.forEach(release => {
      const normalizedAllocation = release.allocation_bill?.trim().toLowerCase();
      const batchKey = normalizedAllocation ? `allocation:${normalizedAllocation}` : release.batch_id || release.id;
      if (!yearlyBatches[batchKey]) {
        yearlyBatches[batchKey] = {
          boxes_released: 0,
          delivery_status: release.delivery_status,
          set_date: release.set_date,
          date_released: release.date_released,
        };
      }
      yearlyBatches[batchKey].boxes_released += release.boxes_released;
    });

    Object.values(yearlyBatches).forEach(batch => {
      const dateToUse = batch.set_date || batch.date_released;
      const monthIndex = new Date(dateToUse).getMonth();
      if (batch.delivery_status === 'delivered') {
        monthlyData[monthIndex].delivered += batch.boxes_released;
      } else {
        monthlyData[monthIndex].pending += batch.boxes_released;
      }
    });

    return monthlyData;
  }, [yearlyReleases]);

  // Top stores per category - use groupedByBatch to avoid duplicates
  const topStoresPerCategory = useMemo(() => {
    const categoryStores: Record<string, Record<string, { boxes: number; qty: number; delivered: number; total: number }>> = {};

    groupedByBatch.forEach(batch => {
      const category = batch.category || 'Uncategorized';
      const store = batch.destination || 'Unknown';

      if (!categoryStores[category]) {
        categoryStores[category] = {};
      }
      if (!categoryStores[category][store]) {
        categoryStores[category][store] = { boxes: 0, qty: 0, delivered: 0, total: 0 };
      }

      categoryStores[category][store].boxes += batch.boxes_released;
      categoryStores[category][store].qty += batch.total_qty;
      categoryStores[category][store].total += 1;
      if (batch.delivery_status === 'delivered') {
        categoryStores[category][store].delivered += 1;
      }
    });

    // Convert to array and get top 5 stores per category
    return Object.entries(categoryStores).map(([category, stores]) => ({
      category,
      stores: Object.entries(stores)
        .map(([store, data]) => ({
          store,
          ...data,
          percentage: data.total > 0 ? Math.round((data.delivered / data.total) * 100) : 0,
        }))
        .sort((a, b) => b.boxes - a.boxes)
        .slice(0, 5),
    })).sort((a, b) => {
      const totalA = a.stores.reduce((sum, s) => sum + s.boxes, 0);
      const totalB = b.stores.reduce((sum, s) => sum + s.boxes, 0);
      return totalB - totalA;
    });
  }, [groupedByBatch]);

  // Store delivery percentages - use groupedByBatch
  const storeDeliveryPercentages = useMemo(() => {
    const stores: Record<string, { delivered: number; total: number; boxes: number }> = {};

    groupedByBatch.forEach(batch => {
      const store = batch.destination || 'Unknown';
      if (!stores[store]) {
        stores[store] = { delivered: 0, total: 0, boxes: 0 };
      }
      stores[store].total += 1;
      stores[store].boxes += batch.boxes_released;
      if (batch.delivery_status === 'delivered') {
        stores[store].delivered += 1;
      }
    });

    return Object.entries(stores)
      .map(([store, data]) => ({
        store,
        ...data,
        percentage: data.total > 0 ? Math.round((data.delivered / data.total) * 100) : 0,
      }))
      .sort((a, b) => b.boxes - a.boxes);
  }, [groupedByBatch]);

  // Category distribution for pie chart - use groupedByBatch
  const categoryDistribution = useMemo(() => {
    const categories: Record<string, number> = {};

    groupedByBatch.forEach(batch => {
      const category = batch.category || 'Uncategorized';
      categories[category] = (categories[category] || 0) + batch.boxes_released;
    });

    return Object.entries(categories)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [groupedByBatch]);

  // Print delivered summary by branch
  const handlePrintDeliveredSummary = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const branchesHtml = deliveredByBranch.map(branch => `
      <div class="branch-section">
        <h2 class="branch-title">${branch.branch}</h2>
        <table>
          <thead>
            <tr>
              <th>Bill No</th>
              <th>Date Out</th>
              <th>Date Received</th>
              <th>Delivery Days</th>
              <th>Courier</th>
              <th>Category</th>
              <th>Status</th>
              <th>Remarks</th>
              <th class="text-center">Boxes</th>
              <th class="text-center">Qty</th>
              <th class="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${branch.items.map(item => {
              const deliveryDays = item.set_date && item.date_delivered 
                ? differenceInDays(new Date(item.date_delivered), new Date(item.set_date))
                : null;
              return `
              <tr>
                <td>${item.allocation_bill || '-'}</td>
                <td>${item.set_date ? format(new Date(item.set_date), 'yyyy-MM-dd') : '-'}</td>
                <td>${item.date_delivered ? format(new Date(item.date_delivered), 'yyyy-MM-dd') : '-'}</td>
                <td style="color: ${deliveryDays !== null ? (deliveryDays <= 3 ? '#16a34a' : deliveryDays <= 7 ? '#d97706' : '#dc2626') : '#666'}; font-weight: ${deliveryDays !== null ? 'bold' : 'normal'};">${deliveryDays !== null ? `${deliveryDays} day(s)` : '-'}</td>
                <td>${item.courier || '-'}</td>
                <td>${item.category || '-'}</td>
                <td style="color: ${item.delivery_status === 'delivered' ? '#16a34a' : '#d97706'}; font-weight: bold;">${item.delivery_status === 'delivered' ? 'Delivered' : 'Pending'}</td>
                <td>${item.remarks || '-'}</td>
                <td class="text-center">${item.boxes}</td>
                <td class="text-center">${item.qty}</td>
                <td class="text-right">${item.amount > 0 ? '₱' + item.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}</td>
              </tr>
            `}).join('')}
            <tr class="subtotal">
              <td colspan="8"><strong>Subtotal</strong></td>
              <td class="text-center"><strong>${branch.totalBoxes}</strong></td>
              <td class="text-center"><strong>${branch.totalQty}</strong></td>
              <td class="text-right"><strong>${branch.totalAmount > 0 ? '₱' + branch.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>
    `).join('');

    const grandTotalBoxes = deliveredByBranch.reduce((sum, b) => sum + b.totalBoxes, 0);
    const grandTotalQty = deliveredByBranch.reduce((sum, b) => sum + b.totalQty, 0);

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Delivered Summary - ${MONTHS[parseInt(selectedMonth)]} ${selectedYear}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: Arial, sans-serif; padding: 20px; color: #000; font-size: 11px; }
            .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #000; padding-bottom: 10px; }
            .header h1 { font-size: 18px; font-weight: bold; margin-bottom: 5px; }
            .header p { font-size: 12px; color: #666; }
            .branch-section { margin-bottom: 25px; page-break-inside: avoid; }
            .branch-title { font-size: 14px; font-weight: bold; margin-bottom: 8px; padding: 5px; background: #f0f0f0; border-left: 4px solid #333; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
            th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; font-size: 10px; }
            th { background: #e5e5e5; font-weight: bold; }
            .text-center { text-align: center; }
            .subtotal { background: #f9f9f9; }
            .grand-total { margin-top: 20px; padding: 15px; background: #333; color: #fff; }
            .grand-total h3 { font-size: 14px; margin-bottom: 5px; }
            .grand-total p { font-size: 12px; }
            @media print { 
              body { padding: 10px; }
              .branch-section { page-break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>DELIVERED SUMMARY BY BRANCH</h1>
            <p>${MONTHS[parseInt(selectedMonth)]} ${selectedYear}</p>
          </div>

          ${branchesHtml}

          <div class="grand-total">
            <h3>GRAND TOTAL</h3>
            <p>Total Branches: ${deliveredByBranch.length} | Total Boxes: ${grandTotalBoxes.toLocaleString()} | Total Qty: ${grandTotalQty.toLocaleString()}</p>
          </div>
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 250);
  };

  // Print single branch delivered summary
  const handlePrintBranchSummary = (branch: typeof deliveredByBranch[0]) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Delivered Summary - ${branch.branch} - ${MONTHS[parseInt(selectedMonth)]} ${selectedYear}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: Arial, sans-serif; padding: 20px; color: #000; font-size: 11px; }
            .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #000; padding-bottom: 10px; }
            .header h1 { font-size: 18px; font-weight: bold; margin-bottom: 5px; }
            .header p { font-size: 12px; color: #666; }
            .branch-section { margin-bottom: 25px; }
            .branch-title { font-size: 14px; font-weight: bold; margin-bottom: 8px; padding: 5px; background: #f0f0f0; border-left: 4px solid #333; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
            th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; font-size: 10px; }
            th { background: #e5e5e5; font-weight: bold; }
            .text-center { text-align: center; }
            .subtotal { background: #f9f9f9; }
            .total-section { margin-top: 20px; padding: 15px; background: #f0f0f0; border: 1px solid #333; }
            .total-section h3 { font-size: 14px; margin-bottom: 5px; }
            .total-section p { font-size: 12px; }
            .footer { margin-top: 40px; display: flex; justify-content: space-between; padding: 0 20px; }
            .signature-block { text-align: center; width: 150px; }
            .signature-line { border-top: 1px solid #000; margin-top: 40px; padding-top: 5px; font-size: 10px; }
            @media print { 
              body { padding: 10px; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>DELIVERED SUMMARY - ${branch.branch}</h1>
            <p>${MONTHS[parseInt(selectedMonth)]} ${selectedYear}</p>
          </div>

          <div class="branch-section">
            <table>
              <thead>
                <tr>
                  <th>Bill No</th>
                  <th>Date Out</th>
                  <th>Date Received</th>
                  <th>Delivery Days</th>
                  <th>Courier</th>
                  <th>Category</th>
                  <th>Status</th>
                  <th>Remarks</th>
                  <th class="text-center">Boxes</th>
                  <th class="text-center">Qty</th>
                  <th class="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${branch.items.map(item => {
                  const deliveryDays = item.set_date && item.date_delivered 
                    ? differenceInDays(new Date(item.date_delivered), new Date(item.set_date))
                    : null;
                  return `
                  <tr>
                    <td>${item.allocation_bill || '-'}</td>
                    <td>${item.set_date ? format(new Date(item.set_date), 'yyyy-MM-dd') : '-'}</td>
                    <td>${item.date_delivered ? format(new Date(item.date_delivered), 'yyyy-MM-dd') : '-'}</td>
                    <td style="color: ${deliveryDays !== null ? (deliveryDays <= 3 ? '#16a34a' : deliveryDays <= 7 ? '#d97706' : '#dc2626') : '#666'}; font-weight: ${deliveryDays !== null ? 'bold' : 'normal'};">${deliveryDays !== null ? `${deliveryDays} day(s)` : '-'}</td>
                    <td>${item.courier || '-'}</td>
                    <td>${item.category || '-'}</td>
                    <td style="color: ${item.delivery_status === 'delivered' ? '#16a34a' : '#d97706'}; font-weight: bold;">${item.delivery_status === 'delivered' ? 'Delivered' : 'Pending'}</td>
                    <td>${item.remarks || '-'}</td>
                    <td class="text-center">${item.boxes}</td>
                    <td class="text-center">${item.qty}</td>
                    <td class="text-right">${item.amount > 0 ? '₱' + item.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}</td>
                  </tr>
                `}).join('')}
                <tr class="subtotal">
                  <td colspan="8"><strong>Total</strong></td>
                  <td class="text-center"><strong>${branch.totalBoxes}</strong></td>
                  <td class="text-center"><strong>${branch.totalQty}</strong></td>
                  <td class="text-right"><strong>${branch.totalAmount > 0 ? '₱' + branch.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="footer">
            <div class="signature-block">
              <div class="signature-line">Checked By</div>
            </div>
            <div class="signature-block">
              <div class="signature-line">Delivered By</div>
            </div>
            <div class="signature-block">
              <div class="signature-line">Received By</div>
            </div>
          </div>
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 250);
  };

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
            <p className="text-muted-foreground">Delivery statistics by branch and category</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canExport && (
            <Button variant="outline" size="sm" onClick={handleExportExcel}>
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Save Excel
            </Button>
          )}
          {canExport && (
            <Button variant="outline" size="sm" onClick={handleExportPDF}>
              <FileDown className="h-4 w-4 mr-2" />
              Save PDF
            </Button>
          )}
          <div className="flex items-center gap-2 bg-card border rounded-lg p-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <Select value={selectedMonth} onValueChange={(val) => { setSelectedMonth(val); setShowAllYear(false); }}>
              <SelectTrigger className="w-[130px] border-0 shadow-none focus:ring-0 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover z-50">
                {MONTHS.map((month, index) => (
                  <SelectItem key={index} value={index.toString()}>{month}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="w-[90px] border-0 shadow-none focus:ring-0 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover z-50">
                {availableYears.map(year => (
                  <SelectItem key={year} value={year}>{year}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-[120px] border-0 shadow-none focus:ring-0 h-8">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent className="bg-popover z-50">
                <SelectItem value="all">All Categories</SelectItem>
                {CATEGORY_OPTIONS.map(cat => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button 
            variant={showAllYear ? "default" : "outline"} 
            size="sm"
            onClick={() => setShowAllYear(!showAllYear)}
          >
            {showAllYear ? 'Showing All Year' : 'All Year'}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card className="animate-fade-in" style={{ animationDelay: '0.1s' }}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Boxes</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalStats.totalBoxes.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {totalStats.totalQty.toLocaleString()} qty/items
            </p>
          </CardContent>
        </Card>

        <Card className="animate-fade-in" style={{ animationDelay: '0.12s' }}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Amount</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₱{totalStats.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            <p className="text-xs text-muted-foreground">total value</p>
          </CardContent>
        </Card>

        <Card className="animate-fade-in" style={{ animationDelay: '0.15s' }}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Delivered</CardTitle>
            <Truck className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{totalStats.deliveredCount}</div>
            <p className="text-xs text-muted-foreground">
              completed deliveries
            </p>
          </CardContent>
        </Card>

        <Card className="animate-fade-in" style={{ animationDelay: '0.2s' }}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <TrendingUp className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{totalStats.pendingCount}</div>
            <p className="text-xs text-muted-foreground">
              awaiting delivery
            </p>
          </CardContent>
        </Card>

        <Card className="animate-fade-in" style={{ animationDelay: '0.25s' }}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Branches Served</CardTitle>
            <Store className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalStats.uniqueDestinations}</div>
            <p className="text-xs text-muted-foreground">unique locations</p>
          </CardContent>
        </Card>

        <Card className="animate-fade-in" style={{ animationDelay: '0.3s' }}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completion Rate</CardTitle>
            <CheckCircle className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{totalStats.deliveryPercentage}%</div>
            <p className="text-xs text-muted-foreground">delivery success</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts for Amount and Qty */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Total Amount by Branch Chart */}
        <Card className="animate-fade-in">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Total Amount by Branch
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={branchReport.slice(0, 10).map(b => ({
                    name: b.branch.length > 15 ? b.branch.substring(0, 15) + '...' : b.branch,
                    amount: b.totalAmount,
                  }))}
                  margin={{ top: 10, right: 10, left: 10, bottom: 60 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="name" 
                    tick={{ fontSize: 10 }}
                    angle={-45}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis 
                    tick={{ fontSize: 10 }}
                    tickFormatter={(value) => '₱' + (value / 1000).toFixed(0) + 'k'}
                  />
                  <Tooltip 
                    formatter={(value: number) => ['₱' + value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), 'Amount']}
                    labelFormatter={(label) => `Branch: ${label}`}
                  />
                  <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Total Qty by Branch Chart */}
        <Card className="animate-fade-in">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Total Qty/Items by Branch
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={branchReport.slice(0, 10).map(b => ({
                    name: b.branch.length > 15 ? b.branch.substring(0, 15) + '...' : b.branch,
                    qty: b.totalQty,
                  }))}
                  margin={{ top: 10, right: 10, left: 10, bottom: 60 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="name" 
                    tick={{ fontSize: 10 }}
                    angle={-45}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis 
                    tick={{ fontSize: 10 }}
                    tickFormatter={(value) => value.toLocaleString()}
                  />
                  <Tooltip 
                    formatter={(value: number) => [value.toLocaleString(), 'Qty/Items']}
                    labelFormatter={(label) => `Branch: ${label}`}
                  />
                  <Bar dataKey="qty" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full max-w-2xl grid-cols-4">
          <TabsTrigger value="branch-report" className="flex items-center gap-2">
            <Store className="h-4 w-4" />
            Branch Report
          </TabsTrigger>
          <TabsTrigger value="category-report" className="flex items-center gap-2">
            <ShoppingBag className="h-4 w-4" />
            Category per Store
          </TabsTrigger>
          <TabsTrigger value="delivered-summary" className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4" />
            Delivered Summary
          </TabsTrigger>
          <TabsTrigger value="attendance-summary" className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            Attendance Summary
          </TabsTrigger>
        </TabsList>

        {/* Branch Report Tab */}
        <TabsContent value="branch-report" className="space-y-6">
          {/* Monthly Chart */}
          <Card className="animate-fade-in">
            <CardHeader>
              <CardTitle>Monthly Delivery Status ({selectedYear})</CardTitle>
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
                    <Legend />
                    <Bar dataKey="delivered" fill="hsl(142, 76%, 36%)" radius={[4, 4, 0, 0]} name="Delivered" />
                    <Bar dataKey="pending" fill="hsl(45, 93%, 47%)" radius={[4, 4, 0, 0]} name="Pending" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Category Distribution & Delivery Percentage */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Category Distribution Pie Chart */}
            <Card className="animate-fade-in">
              <CardHeader>
                <CardTitle>Category Distribution - {MONTHS[parseInt(selectedMonth)]}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  {categoryDistribution.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={categoryDistribution}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                          outerRadius={100}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {categoryDistribution.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--card))', 
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px',
                          }}
                          formatter={(value: number) => [`${value} boxes`, 'Boxes']}
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

            {/* Store Delivery Percentage */}
            <Card className="animate-fade-in">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Delivery Completion Rate</span>
                  <Badge variant="outline" className="text-lg px-3 py-1">
                    {totalStats.deliveryPercentage}% Overall
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-[280px] overflow-y-auto">
                  {storeDeliveryPercentages.slice(0, 10).map((store) => (
                    <div key={store.store} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium truncate max-w-[200px]">{store.store}</span>
                        <span className="text-muted-foreground">
                          {store.delivered}/{store.total} ({store.percentage}%)
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-green-500 transition-all duration-500"
                          style={{ width: `${store.percentage}%` }}
                        />
                      </div>
                    </div>
                  ))}
                  {storeDeliveryPercentages.length === 0 && (
                    <div className="text-center text-muted-foreground py-8">
                      No data available
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Top Stores per Category */}
          <Card className="animate-fade-in">
            <CardHeader>
              <CardTitle>Top Stores by Category - {MONTHS[parseInt(selectedMonth)]}</CardTitle>
            </CardHeader>
            <CardContent>
              {topStoresPerCategory.length > 0 ? (
                <div className="space-y-6">
                  {topStoresPerCategory.slice(0, 5).map((categoryData) => (
                    <div key={categoryData.category} className="space-y-3">
                      <div className="flex items-center gap-2">
                        <ShoppingBag className="h-4 w-4 text-primary" />
                        <h4 className="font-semibold">{categoryData.category}</h4>
                        <Badge variant="secondary">
                          {categoryData.stores.reduce((sum, s) => sum + s.boxes, 0)} boxes
                        </Badge>
                        <Badge variant="outline">
                          {categoryData.stores.reduce((sum, s) => sum + s.qty, 0).toLocaleString()} qty items
                        </Badge>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                        {categoryData.stores.map((store, idx) => (
                          <div 
                            key={store.store} 
                            className="p-3 rounded-lg border bg-muted/30 space-y-1"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-muted-foreground">#{idx + 1}</span>
                              <span className="font-medium text-sm truncate" title={store.store}>
                                {store.store}
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {store.boxes} boxes • {store.qty.toLocaleString()} qty • {store.percentage}% delivered
                            </div>
                            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-primary transition-all duration-500"
                                style={{ width: `${store.percentage}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  No data available for this period
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="animate-fade-in">
            <CardHeader>
              <CardTitle>Branch Delivery Status - {MONTHS[parseInt(selectedMonth)]} {selectedYear}</CardTitle>
            </CardHeader>
            <CardContent>
              {branchReport.length > 0 ? (
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[60px] text-center">No.</TableHead>
                        <TableHead>Branch/Store</TableHead>
                        <TableHead className="text-center">Pending</TableHead>
                        <TableHead className="text-center">In Transit</TableHead>
                        <TableHead className="text-center">Out for Delivery</TableHead>
                        <TableHead className="text-center">Delivered</TableHead>
                        <TableHead className="text-center">Total Boxes</TableHead>
                        <TableHead className="text-center">Total Qty/Items</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-center">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {branchReport.map((item, index) => {
                        const allDelivered = item.pendingCount === 0 && item.inTransitCount === 0 && item.outForDeliveryCount === 0;
                        return (
                          <TableRow key={item.branch}>
                            <TableCell className="text-center font-medium text-muted-foreground">{index + 1}</TableCell>
                            <TableCell className="font-medium">{item.branch}</TableCell>
                            <TableCell className="text-center">
                              {item.pendingCount > 0 ? (
                                <Badge variant="outline" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
                                  {item.pendingCount}
                                </Badge>
                              ) : '-'}
                            </TableCell>
                            <TableCell className="text-center">
                              {item.inTransitCount > 0 ? (
                                <Badge variant="outline" className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                                  {item.inTransitCount}
                                </Badge>
                              ) : '-'}
                            </TableCell>
                            <TableCell className="text-center">
                              {item.outForDeliveryCount > 0 ? (
                                <Badge variant="outline" className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">
                                  {item.outForDeliveryCount}
                                </Badge>
                              ) : '-'}
                            </TableCell>
                            <TableCell className="text-center">
                              {item.deliveredCount > 0 ? (
                                <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                                  {item.deliveredCount}
                                </Badge>
                              ) : '-'}
                            </TableCell>
                            <TableCell className="text-center font-medium">{item.totalBoxes.toLocaleString()}</TableCell>
                            <TableCell className="text-center font-medium">{item.totalQty.toLocaleString()}</TableCell>
                            <TableCell className="text-right font-medium">
                              {item.totalAmount > 0 ? '₱' + item.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}
                            </TableCell>
                            <TableCell className="text-center">
                              {allDelivered ? (
                                <Badge className="bg-green-600 hover:bg-green-700">All Delivered</Badge>
                              ) : (
                                <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
                                  Has Pending
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Store className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <h3 className="text-lg font-medium">No deliveries found</h3>
                  <p className="text-muted-foreground">No releases recorded for {MONTHS[parseInt(selectedMonth)]} {selectedYear}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Category per Store Tab */}
        <TabsContent value="category-report" className="space-y-6">
          <Card className="animate-fade-in">
            <CardHeader>
              <CardTitle>Items Received per Store - {MONTHS[parseInt(selectedMonth)]} {selectedYear}</CardTitle>
            </CardHeader>
            <CardContent>
              {categoryByStore.length > 0 ? (
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[50px] text-center">#</TableHead>
                        <TableHead>Store</TableHead>
                        {allCategories.map(cat => (
                          <TableHead key={cat} className="text-center min-w-[120px]">
                            {cat}
                            <div className="text-xs text-muted-foreground font-normal">(Boxes / Qty)</div>
                          </TableHead>
                        ))}
                        <TableHead className="text-right">Total Boxes</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Total Qty</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {categoryByStore.map((store, index) => (
                        <TableRow key={store.store}>
                          <TableCell className="text-center text-muted-foreground">{index + 1}</TableCell>
                          <TableCell className="font-medium">{store.store}</TableCell>
                          {allCategories.map(cat => {
                            const catData = store.categories[cat];
                            return (
                              <TableCell key={cat} className="text-center">
                                {catData ? (
                                  <div className="flex flex-col">
                                    <span className="font-medium">{catData.boxes}</span>
                                    <span className="text-xs text-muted-foreground">/ {catData.qty}</span>
                                  </div>
                                ) : '-'}
                              </TableCell>
                            );
                          })}
                          <TableCell className="text-right font-bold">{store.totalBoxes.toLocaleString()}</TableCell>
                          <TableCell className="text-right font-bold text-primary">₱{store.totalAmount.toLocaleString()}</TableCell>
                          <TableCell className="text-right font-bold">{store.totalQty.toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                      {/* Totals Row */}
                      <TableRow className="bg-muted/50 font-bold">
                        <TableCell></TableCell>
                        <TableCell>TOTAL</TableCell>
                        {allCategories.map(cat => {
                          const totalBoxes = categoryByStore.reduce((sum, store) => sum + (store.categories[cat]?.boxes || 0), 0);
                          const totalQty = categoryByStore.reduce((sum, store) => sum + (store.categories[cat]?.qty || 0), 0);
                          return (
                            <TableCell key={cat} className="text-center">
                              <div className="flex flex-col">
                                <span>{totalBoxes}</span>
                                <span className="text-xs text-muted-foreground">/ {totalQty}</span>
                              </div>
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-right">
                          {categoryByStore.reduce((sum, s) => sum + s.totalBoxes, 0).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right text-primary font-bold">
                          ₱{categoryByStore.reduce((sum, s) => sum + s.totalAmount, 0).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          {categoryByStore.reduce((sum, s) => sum + s.totalQty, 0).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <ShoppingBag className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <h3 className="text-lg font-medium">No category data found</h3>
                  <p className="text-muted-foreground">No releases with categories recorded for {MONTHS[parseInt(selectedMonth)]} {selectedYear}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Category Summary Cards */}
          {allCategories.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              {allCategories.map((cat, index) => {
                const totalBoxes = categoryByStore.reduce((sum, store) => sum + (store.categories[cat]?.boxes || 0), 0);
                const totalQty = categoryByStore.reduce((sum, store) => sum + (store.categories[cat]?.qty || 0), 0);
                return (
                  <Card key={cat} className="animate-fade-in" style={{ animationDelay: `${0.1 * index}s` }}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium truncate">{cat}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{totalBoxes}</div>
                      <p className="text-xs text-muted-foreground">{totalQty} qty/items</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Delivered Summary Tab */}
        <TabsContent value="delivered-summary" className="space-y-6">
          <Card className="animate-fade-in">
            <CardHeader>
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <CardTitle>Delivered Items by Branch - {MONTHS[parseInt(selectedMonth)]} {selectedYear}</CardTitle>
                  {!isViewer && (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={handlePrintDeliveredSummary}
                      disabled={deliveredByBranch.length === 0}
                    >
                      <Printer className="h-4 w-4 mr-1" />
                      Print / Save PDF
                    </Button>
                  )}
                </div>
                <div className="relative max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search branch or allocation bill..."
                    value={branchSearch}
                    onChange={(e) => setBranchSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Filter:</span>
                  <Button
                    variant={remarksFilter === 'all' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setRemarksFilter('all')}
                  >
                    All
                  </Button>
                  <Button
                    variant={remarksFilter === 'ro' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setRemarksFilter('ro')}
                  >
                    R.O
                  </Button>
                  <Button
                    variant={remarksFilter === 'new' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setRemarksFilter('new')}
                  >
                    NEW
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {filteredDeliveredByBranch.length > 0 ? (
                <div className="space-y-6">
                  {filteredDeliveredByBranch.map(branch => {
                    // Get category filter for this branch
                    const selectedCategory = branchCategoryFilters[branch.branch] || 'all';
                    
                    // Filter items by category if a category is selected
                    const filteredItems = selectedCategory === 'all' 
                      ? branch.items 
                      : branch.items.filter(item => item.categories.includes(selectedCategory));
                    
                    const filteredTotalBoxes = filteredItems.reduce((sum, item) => sum + item.boxes, 0);
                    const filteredTotalQty = filteredItems.reduce((sum, item) => sum + item.qty, 0);
                    const filteredTotalAmount = filteredItems.reduce((sum, item) => sum + item.amount, 0);
                    
                    // Count unique allocation bills
                    const uniqueAllocationBills = new Set(
                      filteredItems
                        .map(item => item.allocation_bill)
                        .filter(Boolean)
                    ).size;
                    
                    // Get categories for this branch
                    const branchCategories = categoriesPerBranch[branch.branch] || [];
                    
                    return (
                    <div key={branch.branch} className="rounded-lg border overflow-hidden">
                      <div className="bg-muted px-4 py-2 border-b flex items-center justify-between">
                        <h3 className="font-semibold flex items-center gap-2">
                          <Store className="h-4 w-4" />
                          {branch.branch}
                          <Badge variant="secondary">
                            {uniqueAllocationBills} allocation bill{uniqueAllocationBills !== 1 ? 's' : ''}
                          </Badge>
                        </h3>
                        <div className="flex items-center gap-2">
                          {branchCategories.length > 0 && (
                            <Select
                              value={selectedCategory}
                              onValueChange={(value) => 
                                setBranchCategoryFilters(prev => ({ ...prev, [branch.branch]: value }))
                              }
                            >
                              <SelectTrigger className="w-[140px] h-8 text-xs">
                                <SelectValue placeholder="All Categories" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All Categories</SelectItem>
                                {branchCategories.map(cat => (
                                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                          {!isViewer && (
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => handlePrintBranchSummary({
                                ...branch,
                                items: filteredItems,
                                totalBoxes: filteredTotalBoxes,
                                totalQty: filteredTotalQty,
                                totalAmount: filteredTotalAmount
                              })}
                            >
                              <Printer className="h-4 w-4 mr-1" />
                              Print
                            </Button>
                          )}
                        </div>
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="whitespace-nowrap">Bill No</TableHead>
                            <TableHead className="whitespace-nowrap">Date Out</TableHead>
                            <TableHead className="whitespace-nowrap">Date Received</TableHead>
                            <TableHead className="whitespace-nowrap">Delivery Days</TableHead>
                            <TableHead className="whitespace-nowrap">Courier</TableHead>
                            <TableHead className="whitespace-nowrap">Category</TableHead>
                            <TableHead className="whitespace-nowrap">Status</TableHead>
                            <TableHead className="whitespace-nowrap">Remarks</TableHead>
                            <TableHead className="text-center whitespace-nowrap w-16">Boxes</TableHead>
                            <TableHead className="text-center whitespace-nowrap w-16">Qty</TableHead>
                            <TableHead className="text-right whitespace-nowrap">Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredItems.map((item) => (
                            <TableRow
                              key={item.batch_id}
                              className="cursor-pointer"
                              onClick={() => setSelectedSummaryItem(item)}
                            >
                              <TableCell className="font-mono whitespace-nowrap">{item.allocation_bill || '-'}</TableCell>
                              <TableCell className="whitespace-nowrap">{item.set_date ? format(new Date(item.set_date), 'MMM d, yyyy') : '-'}</TableCell>
                              <TableCell className="whitespace-nowrap">{item.date_delivered ? format(new Date(item.date_delivered), 'MMM d, yyyy') : '-'}</TableCell>
                              <TableCell className="whitespace-nowrap">
                                {item.set_date && item.date_delivered ? (
                                  <span className="font-medium text-green-600">
                                    {differenceInDays(new Date(item.date_delivered), new Date(item.set_date))} day(s)
                                  </span>
                                ) : '-'}
                              </TableCell>
                              <TableCell className="whitespace-nowrap">{item.courier || '-'}</TableCell>
                              <TableCell className="whitespace-nowrap">{item.category || '-'}</TableCell>
                              <TableCell className="whitespace-nowrap">
                                <Badge variant={item.delivery_status === 'delivered' ? 'default' : 'secondary'}>
                                  {item.delivery_status === 'delivered' ? 'Delivered' : 'Pending'}
                                </Badge>
                              </TableCell>
                              <TableCell>{item.remarks || '-'}</TableCell>
                              <TableCell className="text-center">{item.boxes}</TableCell>
                              <TableCell className="text-center">{item.qty}</TableCell>
                              <TableCell className="text-right">
                                {item.amount > 0 ? '₱' + item.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}
                              </TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="bg-muted/50 font-semibold">
                            <TableCell colSpan={8}>Subtotal</TableCell>
                            <TableCell className="text-center">{filteredTotalBoxes}</TableCell>
                            <TableCell className="text-center">{filteredTotalQty}</TableCell>
                            <TableCell className="text-right">{filteredTotalAmount > 0 ? '₱' + filteredTotalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                    );
                  })}

                  {/* Grand Total */}
                  <div className="rounded-lg bg-primary/10 p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-5 w-5 text-primary" />
                        <span className="font-semibold">{branchSearch ? 'Filtered Total' : 'Grand Total'}</span>
                      </div>
                      <div className="flex gap-6 text-sm">
                        <span><strong>{filteredDeliveredByBranch.length}</strong> Branches</span>
                        <span><strong>{filteredDeliveredByBranch.reduce((sum, b) => sum + b.totalBoxes, 0).toLocaleString()}</strong> Boxes</span>
                        <span><strong>{filteredDeliveredByBranch.reduce((sum, b) => sum + b.totalQty, 0).toLocaleString()}</strong> Qty</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <CheckCircle className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <h3 className="text-lg font-medium">{branchSearch ? 'No matching branches' : 'No delivered items found'}</h3>
                  <p className="text-muted-foreground">
                    {branchSearch 
                      ? `No branches matching "${branchSearch}"` 
                      : `No deliveries marked as delivered for ${MONTHS[parseInt(selectedMonth)]} ${selectedYear}`}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Attendance Summary Tab */}
        <TabsContent value="attendance-summary" className="space-y-6">
          {/* Overview Cards */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Records</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{attendanceSummary.totalRecords}</div>
                <p className="text-xs text-muted-foreground">Attendance records this month</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Active Employees</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{attendanceSummary.totalEmployees}</div>
                <p className="text-xs text-muted-foreground">In manpower database</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Resume to Work</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{attendanceSummary.resumeCount}</div>
                <p className="text-xs text-muted-foreground">Returned from absence</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Unique Statuses</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{attendanceSummary.statusData.length}</div>
                <p className="text-xs text-muted-foreground">Different status types</p>
              </CardContent>
            </Card>
          </div>

          {/* Status Distribution */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Attendance Status Distribution - {MONTHS[parseInt(selectedMonth)]} {selectedYear}</CardTitle>
              </CardHeader>
              <CardContent>
                {attendanceSummary.statusData.length > 0 ? (
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={attendanceSummary.statusData.slice(0, 8)}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                          outerRadius={100}
                          fill="#8884d8"
                          dataKey="count"
                          nameKey="status"
                        >
                          {attendanceSummary.statusData.slice(0, 8).map((_, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <ClipboardList className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <p className="text-muted-foreground">No attendance records for this period</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Status Count Summary</CardTitle>
              </CardHeader>
              <CardContent>
                {attendanceSummary.statusData.length > 0 ? (
                  <div className="space-y-3 max-h-[300px] overflow-y-auto">
                    {attendanceSummary.statusData.map((item, index) => (
                      <div key={item.status} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: COLORS[index % COLORS.length] }}
                          />
                          <span className="font-medium capitalize">{item.status.replace(/_/g, ' ')}</span>
                        </div>
                        <Badge variant="secondary">{item.count}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <p className="text-muted-foreground">No data available</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Branch Breakdown Table */}
          <Card>
            <CardHeader>
              <CardTitle>Attendance by Branch - {MONTHS[parseInt(selectedMonth)]} {selectedYear}</CardTitle>
            </CardHeader>
            <CardContent>
              {attendanceSummary.branchData.length > 0 ? (
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[50px] text-center">#</TableHead>
                        <TableHead>Branch</TableHead>
                        <TableHead className="text-center">Total Records</TableHead>
                        <TableHead className="text-center">Present</TableHead>
                        <TableHead className="text-center">Absent</TableHead>
                        <TableHead className="text-center">Late</TableHead>
                        <TableHead className="text-center">Day Off</TableHead>
                        <TableHead className="text-center">Others</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {attendanceSummary.branchData.map((branch, index) => {
                        const present = branch.statuses['present'] || 0;
                        const absent = branch.statuses['absent'] || 0;
                        const late = branch.statuses['late'] || 0;
                        const dayOff = branch.statuses['day_off'] || 0;
                        const others = branch.total - present - absent - late - dayOff;
                        
                        return (
                          <TableRow key={branch.branch}>
                            <TableCell className="text-center text-muted-foreground">{index + 1}</TableCell>
                            <TableCell className="font-medium">{branch.branch}</TableCell>
                            <TableCell className="text-center font-bold">{branch.total}</TableCell>
                            <TableCell className="text-center">
                              {present > 0 ? (
                                <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                                  {present}
                                </Badge>
                              ) : '-'}
                            </TableCell>
                            <TableCell className="text-center">
                              {absent > 0 ? (
                                <Badge variant="outline" className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                                  {absent}
                                </Badge>
                              ) : '-'}
                            </TableCell>
                            <TableCell className="text-center">
                              {late > 0 ? (
                                <Badge variant="outline" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
                                  {late}
                                </Badge>
                              ) : '-'}
                            </TableCell>
                            <TableCell className="text-center">
                              {dayOff > 0 ? (
                                <Badge variant="outline" className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                                  {dayOff}
                                </Badge>
                              ) : '-'}
                            </TableCell>
                            <TableCell className="text-center">
                              {others > 0 ? (
                                <Badge variant="secondary">{others}</Badge>
                              ) : '-'}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {/* Totals Row */}
                      <TableRow className="bg-muted/50 font-bold">
                        <TableCell></TableCell>
                        <TableCell>TOTAL</TableCell>
                        <TableCell className="text-center">{attendanceSummary.totalRecords}</TableCell>
                        <TableCell className="text-center">
                          {attendanceSummary.branchData.reduce((sum, b) => sum + (b.statuses['present'] || 0), 0)}
                        </TableCell>
                        <TableCell className="text-center">
                          {attendanceSummary.branchData.reduce((sum, b) => sum + (b.statuses['absent'] || 0), 0)}
                        </TableCell>
                        <TableCell className="text-center">
                          {attendanceSummary.branchData.reduce((sum, b) => sum + (b.statuses['late'] || 0), 0)}
                        </TableCell>
                        <TableCell className="text-center">
                          {attendanceSummary.branchData.reduce((sum, b) => sum + (b.statuses['day_off'] || 0), 0)}
                        </TableCell>
                        <TableCell className="text-center">
                          {attendanceSummary.branchData.reduce((sum, b) => {
                            const present = b.statuses['present'] || 0;
                            const absent = b.statuses['absent'] || 0;
                            const late = b.statuses['late'] || 0;
                            const dayOff = b.statuses['day_off'] || 0;
                            return sum + (b.total - present - absent - late - dayOff);
                          }, 0)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Users className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <h3 className="text-lg font-medium">No attendance records found</h3>
                  <p className="text-muted-foreground">No attendance data for {MONTHS[parseInt(selectedMonth)]} {selectedYear}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      {selectedSummaryItem && (
        <AllocationBillModal
          open={!!selectedSummaryItem}
          onOpenChange={(open) => {
            if (!open) setSelectedSummaryItem(null);
          }}
          releases={selectedSummaryItem.releases}
          destination={selectedSummaryItem.releases[0]?.destination || ''}
          courier={selectedSummaryItem.courier}
          dateReleased={selectedSummaryItem.releases[0]?.date_released || ''}
          dateDelivered={selectedSummaryItem.date_delivered}
          allocationBill={selectedSummaryItem.allocation_bill}
          setDate={selectedSummaryItem.set_date}
          isViewer={isViewer}
        />
      )}
    </div>
  );
};

export default SummaryReport;
