import { useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { StockRelease } from '@/types/inventory';
import { format } from 'date-fns';
import { Package, MapPin, Calendar, FileText, Printer, Truck } from 'lucide-react';

interface AllocationBillModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  releases: StockRelease[];
  destination: string;
  courier: string | null;
  dateReleased: string;
}

const AllocationBillModal = ({ open, onOpenChange, releases, destination, courier, dateReleased }: AllocationBillModalProps) => {
  const printRef = useRef<HTMLDivElement>(null);
  const totalBoxes = releases.reduce((sum, r) => sum + r.boxes_released, 0);

  const handlePrint = () => {
    const billNumber = releases[0]?.batch_id?.slice(0, 8).toUpperCase() || 'N/A';
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Allocation Bill - ${billNumber}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; color: #1a1a1a; }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #1a1a1a; padding-bottom: 20px; }
            .header h1 { font-size: 24px; font-weight: 700; margin-bottom: 8px; }
            .header p { color: #666; font-size: 14px; }
            .bill-number { font-size: 12px; color: #888; margin-top: 8px; }
            .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; padding: 16px; background: #f5f5f5; border-radius: 8px; }
            .info-item { display: flex; align-items: center; gap: 8px; }
            .info-label { font-size: 12px; color: #666; }
            .info-value { font-weight: 600; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
            th { background: #1a1a1a; color: white; padding: 12px 16px; text-align: left; font-weight: 600; font-size: 13px; }
            td { padding: 12px 16px; border-bottom: 1px solid #e0e0e0; font-size: 14px; }
            tr:nth-child(even) { background: #fafafa; }
            .text-right { text-align: right; }
            .total-row { background: #f0f0f0 !important; font-weight: 700; }
            .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e0e0e0; display: flex; justify-content: space-between; }
            .signature-line { width: 200px; border-top: 1px solid #1a1a1a; padding-top: 8px; text-align: center; font-size: 12px; color: #666; }
            .notes { margin-top: 20px; padding: 12px; background: #fff9e6; border-radius: 6px; font-size: 13px; }
            .notes-label { font-weight: 600; margin-bottom: 4px; }
            @media print { body { padding: 20px; } }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>ALLOCATION BILL</h1>
            <p>Stock Release Document</p>
            <div class="bill-number">Bill #: ${billNumber}</div>
          </div>
          
          <div class="info-grid">
            <div class="info-item">
              <span class="info-label">Destination:</span>
              <span class="info-value">${destination}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Courier:</span>
              <span class="info-value">${courier || 'N/A'}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Date Released:</span>
              <span class="info-value">${format(new Date(dateReleased), 'MMMM d, yyyy')}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Total Items:</span>
              <span class="info-value">${releases.length}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Total Boxes:</span>
              <span class="info-value">${totalBoxes}</span>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Item Name</th>
                <th>Item Code</th>
                <th class="text-right">Boxes</th>
              </tr>
            </thead>
            <tbody>
              ${releases.map((release, index) => `
                <tr>
                  <td>${index + 1}</td>
                  <td>${release.inventory_item?.item_name || 'N/A'}</td>
                  <td>${release.inventory_item?.item_code || 'N/A'}</td>
                  <td class="text-right">${release.boxes_released}</td>
                </tr>
              `).join('')}
              <tr class="total-row">
                <td colspan="3">Total</td>
                <td class="text-right">${totalBoxes}</td>
              </tr>
            </tbody>
          </table>

          ${releases[0]?.notes ? `
            <div class="notes">
              <div class="notes-label">Notes:</div>
              <div>${releases[0].notes}</div>
            </div>
          ` : ''}

          <div class="footer">
            <div class="signature-line">Prepared By</div>
            <div class="signature-line">Received By</div>
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Allocation Bill Details
            </DialogTitle>
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-1" />
              Print / Save PDF
            </Button>
          </div>
        </DialogHeader>

        <div ref={printRef} className="space-y-4">
          <div className="text-center pb-4 border-b">
            <h2 className="text-xl font-bold">ALLOCATION BILL</h2>
            <p className="text-sm text-muted-foreground">Stock Release Document</p>
            <p className="text-xs text-muted-foreground mt-1">
              Bill #: {releases[0]?.batch_id?.slice(0, 8).toUpperCase() || 'N/A'}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-muted/50">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Destination:</span>
              <span className="font-medium">{destination}</span>
            </div>
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Courier:</span>
              <span className="font-medium">{courier || 'N/A'}</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Released:</span>
              <span className="font-medium">{format(new Date(dateReleased), 'MMM d, yyyy')}</span>
            </div>
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Total Items:</span>
              <span className="font-medium">{releases.length}</span>
            </div>
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Total Boxes:</span>
              <span className="font-medium">{totalBoxes}</span>
            </div>
          </div>

          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">#</TableHead>
                  <TableHead>Item Name</TableHead>
                  <TableHead>Item Code</TableHead>
                  <TableHead className="text-right">Boxes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {releases.map((release, index) => (
                  <TableRow key={release.id}>
                    <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                    <TableCell className="font-medium">{release.inventory_item?.item_name}</TableCell>
                    <TableCell className="text-muted-foreground">{release.inventory_item?.item_code}</TableCell>
                    <TableCell className="text-right">{release.boxes_released}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/50 font-semibold">
                  <TableCell colSpan={3}>Total</TableCell>
                  <TableCell className="text-right">{totalBoxes}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>

          {releases[0]?.notes && (
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-sm font-medium">Notes:</p>
              <p className="text-sm mt-1 text-muted-foreground">{releases[0].notes}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AllocationBillModal;
