import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Package, Truck, Store, CheckCircle, Printer, Search, FileDown } from 'lucide-react';
import { useInventory } from '@/hooks/useInventory';
import { format } from 'date-fns';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

interface SummaryDeliveryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isViewer?: boolean;
}

const SummaryDeliveryModal = ({ open, onOpenChange, isViewer = false }: SummaryDeliveryModalProps) => {
  const { releases } = useInventory();
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();

  const [selectedYear, setSelectedYear] = useState(currentYear.toString());
  const [selectedMonth, setSelectedMonth] = useState(currentMonth.toString());
  const [activeTab, setActiveTab] = useState('branch-report');
  const [branchSearch, setBranchSearch] = useState('');

  // Get available years from releases
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    releases.forEach(release => {
      const year = new Date(release.date_released).getFullYear().toString();
      years.add(year);
    });
    years.add(currentYear.toString());
    return Array.from(years).sort((a, b) => parseInt(b) - parseInt(a));
  }, [releases, currentYear]);

  // Filter releases by selected year and month
  const filteredReleases = useMemo(() => {
    return releases.filter(release => {
      const dateToUse = release.set_date || release.date_released;
      const releaseDate = new Date(dateToUse);
      const releaseYear = releaseDate.getFullYear().toString();
      const releaseMonth = releaseDate.getMonth().toString();
      return releaseYear === selectedYear && releaseMonth === selectedMonth;
    });
  }, [releases, selectedYear, selectedMonth]);

  // Branch/Store Report
  const branchReport = useMemo(() => {
    const branches: Record<string, {
      branch: string;
      totalDeliveries: number;
      pendingCount: number;
      deliveredCount: number;
      totalBoxes: number;
      totalQty: number;
    }> = {};

    filteredReleases.forEach(release => {
      const branch = release.destination || 'Unknown';

      if (!branches[branch]) {
        branches[branch] = {
          branch,
          totalDeliveries: 0,
          pendingCount: 0,
          deliveredCount: 0,
          totalBoxes: 0,
          totalQty: 0,
        };
      }

      branches[branch].totalDeliveries += 1;
      branches[branch].totalBoxes += release.boxes_released;
      branches[branch].totalQty += release.total_qty || 0;

      if (release.delivery_status === 'delivered') {
        branches[branch].deliveredCount += 1;
      } else {
        branches[branch].pendingCount += 1;
      }
    });

    return Object.values(branches).sort((a, b) => b.totalDeliveries - a.totalDeliveries);
  }, [filteredReleases]);

  // Items grouped by branch
  const deliveredByBranch = useMemo(() => {
    const branches: Record<string, {
      branch: string;
      items: {
        allocation_bill: string | null;
        set_date: string | null;
        date_delivered: string | null;
        courier: string | null;
        waybill_no: string | null;
        category: string | null;
        boxes: number;
        qty: number;
        delivery_status: string;
        remarks: string | null;
      }[];
      totalBoxes: number;
      totalQty: number;
    }> = {};

    filteredReleases.forEach(release => {
      const branch = release.destination || 'Unknown';

      if (!branches[branch]) {
        branches[branch] = {
          branch,
          items: [],
          totalBoxes: 0,
          totalQty: 0,
        };
      }

      branches[branch].items.push({
        allocation_bill: release.allocation_bill,
        set_date: release.set_date,
        date_delivered: release.date_delivered,
        courier: release.courier,
        waybill_no: release.waybill_no,
        category: release.category,
        boxes: release.boxes_released,
        qty: release.total_qty || 0,
        delivery_status: release.delivery_status,
        remarks: release.notes,
      });
      branches[branch].totalBoxes += release.boxes_released;
      branches[branch].totalQty += release.total_qty || 0;
    });

    return Object.values(branches)
      .map(branch => ({
        ...branch,
        items: branch.items.sort((a, b) => {
          const dateA = a.set_date ? new Date(a.set_date).getTime() : 0;
          const dateB = b.set_date ? new Date(b.set_date).getTime() : 0;
          return dateA - dateB;
        })
      }))
      .sort((a, b) => a.branch.localeCompare(b.branch));
  }, [filteredReleases]);

  // Filter delivered branches by search
  const filteredDeliveredByBranch = useMemo(() => {
    if (!branchSearch.trim()) return deliveredByBranch;
    const searchLower = branchSearch.toLowerCase();

    return deliveredByBranch
      .map(branch => {
        const branchMatches = branch.branch.toLowerCase().includes(searchLower);
        const filteredItems = branch.items.filter(item =>
          item.allocation_bill?.toLowerCase().includes(searchLower)
        );

        if (branchMatches) {
          return branch;
        } else if (filteredItems.length > 0) {
          return {
            ...branch,
            items: filteredItems,
            totalBoxes: filteredItems.reduce((sum, item) => sum + item.boxes, 0),
            totalQty: filteredItems.reduce((sum, item) => sum + item.qty, 0),
          };
        }
        return null;
      })
      .filter((branch): branch is NonNullable<typeof branch> => branch !== null);
  }, [deliveredByBranch, branchSearch]);

  // Category by store (delivered only)
  const categoryByStore = useMemo(() => {
    const stores: Record<string, {
      store: string;
      categories: Record<string, { boxes: number; qty: number }>;
      totalBoxes: number;
      totalQty: number;
    }> = {};

    filteredReleases
      .filter(release => release.delivery_status === 'delivered')
      .forEach(release => {
        const store = release.destination || 'Unknown';
        const category = release.category || 'Uncategorized';

        if (!stores[store]) {
          stores[store] = { store, categories: {}, totalBoxes: 0, totalQty: 0 };
        }

        if (!stores[store].categories[category]) {
          stores[store].categories[category] = { boxes: 0, qty: 0 };
        }

        stores[store].categories[category].boxes += release.boxes_released;
        stores[store].categories[category].qty += release.total_qty || 0;
        stores[store].totalBoxes += release.boxes_released;
        stores[store].totalQty += release.total_qty || 0;
      });

    return Object.values(stores).sort((a, b) => b.totalBoxes - a.totalBoxes);
  }, [filteredReleases]);

  // Get all unique categories
  const allCategories = useMemo(() => {
    const cats = new Set<string>();
    filteredReleases
      .filter(release => release.delivery_status === 'delivered')
      .forEach(release => {
        if (release.category) cats.add(release.category);
      });
    return Array.from(cats).sort();
  }, [filteredReleases]);

  // Total statistics
  const totalStats = useMemo(() => {
    const totalBoxes = filteredReleases.reduce((sum, r) => sum + r.boxes_released, 0);
    const totalQty = filteredReleases.reduce((sum, r) => sum + (r.total_qty || 0), 0);
    const deliveredCount = filteredReleases.filter(r => r.delivery_status === 'delivered').length;
    const pendingCount = filteredReleases.filter(r => r.delivery_status !== 'delivered').length;
    const uniqueDestinations = new Set(filteredReleases.map(r => r.destination)).size;

    return { totalBoxes, totalQty, deliveredCount, pendingCount, uniqueDestinations };
  }, [filteredReleases]);

  // Print / Save PDF function
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
              <th>Courier</th>
              <th>Waybill No</th>
              <th>Category</th>
              <th>Status</th>
              <th>Remarks</th>
              <th class="text-center">Boxes</th>
              <th class="text-center">Qty</th>
            </tr>
          </thead>
          <tbody>
            ${branch.items.map(item => `
              <tr>
                <td>${item.allocation_bill || '-'}</td>
                <td>${item.set_date ? format(new Date(item.set_date), 'yyyy-MM-dd') : '-'}</td>
                <td>${item.date_delivered ? format(new Date(item.date_delivered), 'yyyy-MM-dd') : '-'}</td>
                <td>${item.courier || '-'}</td>
                <td>${item.waybill_no || '-'}</td>
                <td>${item.category || '-'}</td>
                <td style="color: ${item.delivery_status === 'delivered' ? '#16a34a' : '#d97706'}; font-weight: bold;">${item.delivery_status === 'delivered' ? 'Delivered' : 'Pending'}</td>
                <td>${item.remarks || '-'}</td>
                <td class="text-center">${item.boxes}</td>
                <td class="text-center">${item.qty}</td>
              </tr>
            `).join('')}
            <tr class="subtotal">
              <td colspan="8"><strong>Subtotal</strong></td>
              <td class="text-center"><strong>${branch.totalBoxes}</strong></td>
              <td class="text-center"><strong>${branch.totalQty}</strong></td>
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
          <title>Summary Delivery - ${MONTHS[parseInt(selectedMonth)]} ${selectedYear}</title>
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
            <h1>SUMMARY DELIVERY BY BRANCH</h1>
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

  // Print single branch summary
  const handlePrintBranchSummary = (branch: typeof deliveredByBranch[0]) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Summary Delivery - ${branch.branch} - ${MONTHS[parseInt(selectedMonth)]} ${selectedYear}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: Arial, sans-serif; padding: 20px; color: #000; font-size: 11px; }
            .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #000; padding-bottom: 10px; }
            .header h1 { font-size: 18px; font-weight: bold; margin-bottom: 5px; }
            .header p { font-size: 12px; color: #666; }
            .branch-title { font-size: 14px; font-weight: bold; margin-bottom: 8px; padding: 5px; background: #f0f0f0; border-left: 4px solid #333; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
            th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; font-size: 10px; }
            th { background: #e5e5e5; font-weight: bold; }
            .text-center { text-align: center; }
            .subtotal { background: #f9f9f9; }
            @media print { body { padding: 10px; } }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>SUMMARY DELIVERY</h1>
            <p>${branch.branch} - ${MONTHS[parseInt(selectedMonth)]} ${selectedYear}</p>
          </div>
          <h2 class="branch-title">${branch.branch}</h2>
          <table>
            <thead>
              <tr>
                <th>Bill No</th>
                <th>Date Out</th>
                <th>Date Received</th>
                <th>Courier</th>
                <th>Waybill No</th>
                <th>Category</th>
                <th>Status</th>
                <th>Remarks</th>
                <th class="text-center">Boxes</th>
                <th class="text-center">Qty</th>
              </tr>
            </thead>
            <tbody>
              ${branch.items.map(item => `
                <tr>
                  <td>${item.allocation_bill || '-'}</td>
                  <td>${item.set_date ? format(new Date(item.set_date), 'yyyy-MM-dd') : '-'}</td>
                  <td>${item.date_delivered ? format(new Date(item.date_delivered), 'yyyy-MM-dd') : '-'}</td>
                  <td>${item.courier || '-'}</td>
                  <td>${item.waybill_no || '-'}</td>
                  <td>${item.category || '-'}</td>
                  <td style="color: ${item.delivery_status === 'delivered' ? '#16a34a' : '#d97706'}; font-weight: bold;">${item.delivery_status === 'delivered' ? 'Delivered' : 'Pending'}</td>
                  <td>${item.remarks || '-'}</td>
                  <td class="text-center">${item.boxes}</td>
                  <td class="text-center">${item.qty}</td>
                </tr>
              `).join('')}
              <tr class="subtotal">
                <td colspan="8"><strong>Total</strong></td>
                <td class="text-center"><strong>${branch.totalBoxes}</strong></td>
                <td class="text-center"><strong>${branch.totalQty}</strong></td>
              </tr>
            </tbody>
          </table>
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 250);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-full max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <FileDown className="h-5 w-5" />
            Summary Delivery Report
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 py-2">
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((month, index) => (
                <SelectItem key={index} value={index.toString()}>{month}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableYears.map(year => (
                <SelectItem key={year} value={year}>{year}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 py-2">
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-primary" />
              <div>
                <p className="text-xs text-muted-foreground">Total Boxes</p>
                <p className="text-lg font-bold">{totalStats.totalBoxes.toLocaleString()}</p>
              </div>
            </div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <div>
                <p className="text-xs text-muted-foreground">Delivered</p>
                <p className="text-lg font-bold">{totalStats.deliveredCount}</p>
              </div>
            </div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-yellow-500" />
              <div>
                <p className="text-xs text-muted-foreground">Pending</p>
                <p className="text-lg font-bold">{totalStats.pendingCount}</p>
              </div>
            </div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <Store className="h-4 w-4 text-blue-500" />
              <div>
                <p className="text-xs text-muted-foreground">Branches</p>
                <p className="text-lg font-bold">{totalStats.uniqueDestinations}</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="flex-shrink-0">
            <TabsTrigger value="branch-report">Branch Report</TabsTrigger>
            <TabsTrigger value="category-store">Category per Store</TabsTrigger>
            <TabsTrigger value="delivered-summary">Delivered Summary</TabsTrigger>
          </TabsList>

          {/* Branch Report Tab */}
          <TabsContent value="branch-report" className="flex-1 overflow-auto">
            <div className="rounded-md border overflow-auto max-h-[40vh]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Branch</TableHead>
                    <TableHead className="text-center">Deliveries</TableHead>
                    <TableHead className="text-center">Delivered</TableHead>
                    <TableHead className="text-center">Pending</TableHead>
                    <TableHead className="text-center">Total Boxes</TableHead>
                    <TableHead className="text-center">Total Qty</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {branchReport.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No data for this period
                      </TableCell>
                    </TableRow>
                  ) : (
                    branchReport.map(branch => (
                      <TableRow key={branch.branch}>
                        <TableCell className="font-medium">{branch.branch}</TableCell>
                        <TableCell className="text-center">{branch.totalDeliveries}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="default" className="bg-green-500">{branch.deliveredCount}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary">{branch.pendingCount}</Badge>
                        </TableCell>
                        <TableCell className="text-center">{branch.totalBoxes}</TableCell>
                        <TableCell className="text-center">{branch.totalQty}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* Category per Store Tab */}
          <TabsContent value="category-store" className="flex-1 overflow-auto">
            <div className="rounded-md border overflow-auto max-h-[40vh]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Store</TableHead>
                    {allCategories.map(cat => (
                      <TableHead key={cat} className="text-center">{cat}</TableHead>
                    ))}
                    <TableHead className="text-center">Total Boxes</TableHead>
                    <TableHead className="text-center">Total Qty</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categoryByStore.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={allCategories.length + 3} className="text-center py-8 text-muted-foreground">
                        No delivered items for this period
                      </TableCell>
                    </TableRow>
                  ) : (
                    categoryByStore.map(store => (
                      <TableRow key={store.store}>
                        <TableCell className="font-medium">{store.store}</TableCell>
                        {allCategories.map(cat => (
                          <TableCell key={cat} className="text-center">
                            {store.categories[cat]?.boxes || '-'}
                          </TableCell>
                        ))}
                        <TableCell className="text-center font-bold">{store.totalBoxes}</TableCell>
                        <TableCell className="text-center font-bold">{store.totalQty}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* Delivered Summary Tab */}
          <TabsContent value="delivered-summary" className="flex-1 overflow-auto flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search branch or allocation bill..."
                  value={branchSearch}
                  onChange={(e) => setBranchSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              {!isViewer && (
                <Button onClick={handlePrintDeliveredSummary} size="sm">
                  <Printer className="h-4 w-4 mr-2" />
                  Print / Save PDF
                </Button>
              )}
            </div>

            <div className="space-y-4 overflow-auto max-h-[35vh]">
              {filteredDeliveredByBranch.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No items for this period
                </div>
              ) : (
                filteredDeliveredByBranch.map(branch => (
                  <Card key={branch.branch}>
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold flex items-center gap-2">
                          <Store className="h-4 w-4" />
                          {branch.branch}
                        </h3>
                        {!isViewer && (
                          <Button variant="outline" size="sm" onClick={() => handlePrintBranchSummary(branch)}>
                            <Printer className="h-3 w-3 mr-1" />
                            Print
                          </Button>
                        )}
                      </div>
                      <div className="rounded-md border overflow-auto">
                        <Table className="text-xs">
                          <TableHeader>
                            <TableRow>
                              <TableHead>Bill No</TableHead>
                              <TableHead>Date Out</TableHead>
                              <TableHead>Date Received</TableHead>
                              <TableHead>Courier</TableHead>
                              <TableHead>Waybill No</TableHead>
                              <TableHead>Category</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Remarks</TableHead>
                              <TableHead className="text-center">Boxes</TableHead>
                              <TableHead className="text-center">Qty</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {branch.items.map((item, idx) => (
                              <TableRow key={idx}>
                                <TableCell>{item.allocation_bill || '-'}</TableCell>
                                <TableCell>{item.set_date ? format(new Date(item.set_date), 'MMM d, yyyy') : '-'}</TableCell>
                                <TableCell>{item.date_delivered ? format(new Date(item.date_delivered), 'MMM d, yyyy') : '-'}</TableCell>
                                <TableCell>{item.courier || '-'}</TableCell>
                                <TableCell>{item.waybill_no || '-'}</TableCell>
                                <TableCell>{item.category || '-'}</TableCell>
                                <TableCell>
                                  <Badge variant={item.delivery_status === 'delivered' ? 'default' : 'secondary'} className={item.delivery_status === 'delivered' ? 'bg-green-500' : ''}>
                                    {item.delivery_status === 'delivered' ? 'Delivered' : 'Pending'}
                                  </Badge>
                                </TableCell>
                                <TableCell>{item.remarks || '-'}</TableCell>
                                <TableCell className="text-center">{item.boxes}</TableCell>
                                <TableCell className="text-center">{item.qty}</TableCell>
                              </TableRow>
                            ))}
                            <TableRow className="bg-muted/50">
                              <TableCell colSpan={8} className="font-semibold">Subtotal</TableCell>
                              <TableCell className="text-center font-semibold">{branch.totalBoxes}</TableCell>
                              <TableCell className="text-center font-semibold">{branch.totalQty}</TableCell>
                            </TableRow>
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default SummaryDeliveryModal;
