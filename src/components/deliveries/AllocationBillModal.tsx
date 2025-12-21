import { useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { StockRelease } from '@/types/inventory';
import { format } from 'date-fns';
import { FileText, Printer } from 'lucide-react';

interface AllocationBillModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  releases: StockRelease[];
  destination: string;
  courier: string | null;
  dateReleased: string;
  allocationBill?: string | null;
}

const AllocationBillModal = ({ open, onOpenChange, releases, destination, courier, dateReleased, allocationBill }: AllocationBillModalProps) => {
  const printRef = useRef<HTMLDivElement>(null);
  const totalQty = releases.reduce((sum, r) => sum + r.boxes_released, 0);
  const billNumber = allocationBill || releases[0]?.allocation_bill || releases[0]?.batch_id?.slice(0, 8).toUpperCase() || 'N/A';

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Warehouse Allocation Bill - ${billNumber}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: Arial, sans-serif; padding: 20px; color: #000; font-size: 12px; }
            .header { text-align: center; margin-bottom: 20px; }
            .header h1 { font-size: 18px; font-weight: bold; margin-bottom: 15px; text-decoration: underline; }
            .header-info { display: flex; justify-content: space-between; margin-bottom: 10px; }
            .header-left { text-align: left; }
            .header-right { text-align: right; }
            .header-row { margin-bottom: 4px; }
            .bill-box { border: 1px solid #000; padding: 5px 10px; display: inline-block; margin-bottom: 5px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th, td { border: 1px solid #000; padding: 6px 8px; text-align: left; font-size: 11px; }
            th { background: #f0f0f0; font-weight: bold; }
            .text-right { text-align: right; }
            .text-center { text-align: center; }
            .total-row { font-weight: bold; }
            .footer { margin-top: 40px; display: flex; justify-content: space-between; padding: 0 20px; }
            .signature-block { text-align: center; width: 150px; }
            .signature-line { border-top: 1px solid #000; margin-top: 40px; padding-top: 5px; font-size: 10px; }
            .page-info { text-align: right; margin-top: 20px; font-size: 10px; }
            @media print { body { padding: 10px; } }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>WAREHOUSE ALLOCATION BILL</h1>
            <div class="header-info">
              <div class="header-left">
                <div class="header-row"><strong>To Branch:</strong> ${destination}</div>
                <div class="header-row"><strong>Remarks:</strong> ${releases[0]?.notes || '-'}</div>
              </div>
              <div class="header-right">
                <div class="bill-box"><strong>${billNumber}</strong></div>
                <div class="header-row">${format(new Date(dateReleased), 'yyyy-MM-dd')}</div>
                <div class="header-row">${courier || '-'}</div>
              </div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Product Code</th>
                <th>Product Description</th>
                <th class="text-center">Qty</th>
              </tr>
            </thead>
            <tbody>
              ${releases.map((release) => `
                <tr>
                  <td>${release.inventory_item?.item_code || 'N/A'}</td>
                  <td>${release.inventory_item?.item_name || 'N/A'}</td>
                  <td class="text-center">${release.boxes_released}</td>
                </tr>
              `).join('')}
              <tr class="total-row">
                <td colspan="2" class="text-right">Total Qty:</td>
                <td class="text-center">${totalQty}</td>
              </tr>
            </tbody>
          </table>

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

          <div class="page-info">Page 1 of 1</div>
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
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Warehouse Allocation Bill
            </DialogTitle>
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-1" />
              Print / Save PDF
            </Button>
          </div>
        </DialogHeader>

        <div ref={printRef} className="space-y-4">
          {/* Header */}
          <div className="text-center pb-4 border-b-2 border-foreground">
            <h2 className="text-lg font-bold underline">WAREHOUSE ALLOCATION BILL</h2>
          </div>

          {/* Info Section */}
          <div className="flex justify-between text-sm">
            <div className="space-y-1">
              <p><span className="font-semibold">To Branch:</span> {destination}</p>
              <p><span className="font-semibold">Remarks:</span> {releases[0]?.notes || '-'}</p>
            </div>
            <div className="text-right space-y-1">
              <p className="border border-foreground px-3 py-1 inline-block font-bold">{billNumber}</p>
              <p>{format(new Date(dateReleased), 'yyyy-MM-dd')}</p>
              <p>{courier || '-'}</p>
            </div>
          </div>

          {/* Table */}
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted">
                  <TableHead className="font-bold border-r">Product Code</TableHead>
                  <TableHead className="font-bold border-r">Product Description</TableHead>
                  <TableHead className="font-bold text-center w-[80px]">Qty</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {releases.map((release) => (
                  <TableRow key={release.id}>
                    <TableCell className="border-r font-mono text-sm">{release.inventory_item?.item_code}</TableCell>
                    <TableCell className="border-r">{release.inventory_item?.item_name}</TableCell>
                    <TableCell className="text-center">{release.boxes_released}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/50 font-bold">
                  <TableCell colSpan={2} className="text-right border-r">Total Qty:</TableCell>
                  <TableCell className="text-center">{totalQty}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>

          {/* Signature Section */}
          <div className="flex justify-between pt-8 mt-8">
            <div className="text-center">
              <div className="w-32 border-t border-foreground pt-2 text-xs text-muted-foreground">Checked By</div>
            </div>
            <div className="text-center">
              <div className="w-32 border-t border-foreground pt-2 text-xs text-muted-foreground">Delivered By</div>
            </div>
            <div className="text-center">
              <div className="w-32 border-t border-foreground pt-2 text-xs text-muted-foreground">Received By</div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AllocationBillModal;
