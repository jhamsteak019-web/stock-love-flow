import { useState, useMemo, useRef } from 'react';
import { FileText, Printer, Calendar, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useInventory } from '@/hooks/useInventory';
import { format } from 'date-fns';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

interface GroupedDelivery {
  date_released: string;
  allocation_bill: string | null;
  courier: string | null;
  waybill_no: string | null;
  category: string | null;
  boxes: number;
  qty: number;
}

interface BranchMonthData {
  branch: string;
  months: {
    [monthYear: string]: GroupedDelivery[];
  };
}

const SummaryDeliveryReport = () => {
  const { releases, loading } = useInventory();
  const printRef = useRef<HTMLDivElement>(null);
  const currentYear = new Date().getFullYear();
  
  const [selectedYear, setSelectedYear] = useState(currentYear.toString());
  const [expandedBranches, setExpandedBranches] = useState<Set<string>>(new Set());

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

  // Group releases by branch and month
  const groupedByBranchMonth = useMemo(() => {
    const branchData: Record<string, BranchMonthData> = {};

    releases
      .filter(release => {
        const releaseYear = new Date(release.date_released).getFullYear().toString();
        return releaseYear === selectedYear;
      })
      .forEach(release => {
        const branch = release.destination || 'Unknown';
        const releaseDate = new Date(release.date_released);
        const monthYear = `${MONTHS[releaseDate.getMonth()]} ${releaseDate.getFullYear()}`;

        if (!branchData[branch]) {
          branchData[branch] = {
            branch,
            months: {},
          };
        }

        if (!branchData[branch].months[monthYear]) {
          branchData[branch].months[monthYear] = [];
        }

        branchData[branch].months[monthYear].push({
          date_released: release.date_released,
          allocation_bill: release.allocation_bill,
          courier: release.courier,
          waybill_no: release.waybill_no,
          category: release.category,
          boxes: release.boxes_released,
          qty: release.total_qty || 0,
        });
      });

    // Sort months within each branch
    Object.values(branchData).forEach(branch => {
      Object.keys(branch.months).forEach(monthYear => {
        branch.months[monthYear].sort((a, b) => 
          new Date(a.date_released).getTime() - new Date(b.date_released).getTime()
        );
      });
    });

    return Object.values(branchData).sort((a, b) => a.branch.localeCompare(b.branch));
  }, [releases, selectedYear]);

  const toggleBranch = (branch: string) => {
    setExpandedBranches(prev => {
      const newSet = new Set(prev);
      if (newSet.has(branch)) {
        newSet.delete(branch);
      } else {
        newSet.add(branch);
      }
      return newSet;
    });
  };

  const expandAll = () => {
    setExpandedBranches(new Set(groupedByBranchMonth.map(b => b.branch)));
  };

  const collapseAll = () => {
    setExpandedBranches(new Set());
  };

  const handlePrint = () => {
    // Expand all before printing
    setExpandedBranches(new Set(groupedByBranchMonth.map(b => b.branch)));
    
    setTimeout(() => {
      window.print();
    }, 100);
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
      {/* Header - Hidden when printing */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 print:hidden">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <FileText className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Summary Delivery Out Warehouse</h1>
            <p className="text-muted-foreground">Per branch per month delivery summary</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-28">
              <SelectValue placeholder="Select Year" />
            </SelectTrigger>
            <SelectContent>
              {availableYears.map(year => (
                <SelectItem key={year} value={year}>{year}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={expandAll}>
            Expand All
          </Button>
          <Button variant="outline" size="sm" onClick={collapseAll}>
            Collapse All
          </Button>
          <Button onClick={handlePrint} className="gap-2">
            <Printer className="h-4 w-4" />
            Print / Save PDF
          </Button>
        </div>
      </div>

      {/* Print Header - Only visible when printing */}
      <div className="hidden print:block print:mb-6">
        <h1 className="text-2xl font-bold text-center underline decoration-2 underline-offset-4">
          SUMMARY DELIVERY OUT WAREHOUSE
        </h1>
        <p className="text-center text-muted-foreground mt-2">Year: {selectedYear}</p>
      </div>

      {/* Content */}
      <div ref={printRef} className="space-y-6">
        {groupedByBranchMonth.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <FileText className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">No delivery records for {selectedYear}</p>
          </div>
        ) : (
          groupedByBranchMonth.map((branchData) => {
            const isExpanded = expandedBranches.has(branchData.branch);
            const totalBoxes = Object.values(branchData.months).flat().reduce((sum, d) => sum + d.boxes, 0);
            const totalQty = Object.values(branchData.months).flat().reduce((sum, d) => sum + d.qty, 0);
            const monthCount = Object.keys(branchData.months).length;

            return (
              <Collapsible
                key={branchData.branch}
                open={isExpanded}
                onOpenChange={() => toggleBranch(branchData.branch)}
                className="print:!block"
              >
                <div className="rounded-xl border bg-card shadow-sm overflow-hidden print:break-inside-avoid-page print:mb-8">
                  {/* Branch Header */}
                  <CollapsibleTrigger asChild>
                    <div className="flex items-center justify-between p-4 bg-muted/50 cursor-pointer hover:bg-muted/70 transition-colors print:cursor-default print:hover:bg-muted/50">
                      <div>
                        <h2 className="text-lg font-semibold">To Branch: {branchData.branch}</h2>
                        <p className="text-sm text-muted-foreground print:hidden">
                          {monthCount} month(s) • {totalBoxes} total boxes • {totalQty} total qty
                        </p>
                      </div>
                      <div className="print:hidden">
                        {isExpanded ? (
                          <ChevronUp className="h-5 w-5 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  </CollapsibleTrigger>

                  <CollapsibleContent className="print:!block print:!h-auto">
                    {Object.entries(branchData.months)
                      .sort((a, b) => {
                        const [monthA, yearA] = a[0].split(' ');
                        const [monthB, yearB] = b[0].split(' ');
                        const dateA = new Date(`${monthA} 1, ${yearA}`);
                        const dateB = new Date(`${monthB} 1, ${yearB}`);
                        return dateA.getTime() - dateB.getTime();
                      })
                      .map(([monthYear, deliveries]) => {
                        const monthTotalBoxes = deliveries.reduce((sum, d) => sum + d.boxes, 0);
                        const monthTotalQty = deliveries.reduce((sum, d) => sum + d.qty, 0);

                        return (
                          <div key={monthYear} className="border-t print:break-inside-avoid">
                            <div className="px-4 py-2 bg-primary/5">
                              <h3 className="font-medium text-primary">{monthYear}</h3>
                            </div>
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="w-[140px]">Date Out Warehouse</TableHead>
                                  <TableHead>Bill No</TableHead>
                                  <TableHead>Courier</TableHead>
                                  <TableHead>Waybill No</TableHead>
                                  <TableHead>Category</TableHead>
                                  <TableHead className="text-right">Boxes</TableHead>
                                  <TableHead className="text-right">Qty</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {deliveries.map((delivery, idx) => (
                                  <TableRow key={idx}>
                                    <TableCell>{format(new Date(delivery.date_released), 'yyyy-MM-dd')}</TableCell>
                                    <TableCell className="font-medium">{delivery.allocation_bill || '-'}</TableCell>
                                    <TableCell>{delivery.courier || '-'}</TableCell>
                                    <TableCell>{delivery.waybill_no || '-'}</TableCell>
                                    <TableCell>{delivery.category || '-'}</TableCell>
                                    <TableCell className="text-right">{delivery.boxes}</TableCell>
                                    <TableCell className="text-right">{delivery.qty}</TableCell>
                                  </TableRow>
                                ))}
                                {/* Month Total Row */}
                                <TableRow className="bg-muted/30 font-medium">
                                  <TableCell colSpan={5} className="text-right">
                                    {monthYear} Total:
                                  </TableCell>
                                  <TableCell className="text-right">{monthTotalBoxes}</TableCell>
                                  <TableCell className="text-right">{monthTotalQty}</TableCell>
                                </TableRow>
                              </TableBody>
                            </Table>
                          </div>
                        );
                      })}
                    
                    {/* Branch Grand Total */}
                    <div className="px-4 py-3 bg-primary/10 border-t">
                      <div className="flex justify-end gap-8 font-semibold">
                        <span>Grand Total for {branchData.branch}:</span>
                        <span>{totalBoxes} Boxes</span>
                        <span>{totalQty} Qty</span>
                      </div>
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            );
          })
        )}
      </div>

      {/* Print Styles */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .print\\:block,
          .print\\:block * {
            visibility: visible;
          }
          @page {
            size: A4 landscape;
            margin: 1cm;
          }
          .print\\:hidden {
            display: none !important;
          }
          .print\\:break-inside-avoid-page {
            break-inside: avoid-page;
          }
          .print\\:break-inside-avoid {
            break-inside: avoid;
          }
          .print\\:mb-8 {
            margin-bottom: 2rem;
          }
        }
      `}</style>
    </div>
  );
};

export default SummaryDeliveryReport;
