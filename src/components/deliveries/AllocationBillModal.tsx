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
  dateDelivered?: string | null;
  allocationBill?: string | null;
}

const AllocationBillModal = ({ open, onOpenChange, releases, destination, courier, dateReleased, dateDelivered, allocationBill }: AllocationBillModalProps) => {
  const printRef = useRef<HTMLDivElement>(null);
  const totalBoxes = releases.reduce((sum, r) => sum + r.boxes_released, 0);
  const totalQty = releases.reduce((sum, r) => sum + (r.total_qty || 0), 0);
  const billNumber = allocationBill || releases[0]?.allocation_bill || releases[0]?.batch_id?.slice(0, 8).toUpperCase() || 'N/A';
  const waybillNo = releases[0]?.waybill_no || '-';
  const category = releases[0]?.category || '-';

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Summary Delivery Out Warehouse - ${billNumber}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: Arial, sans-serif; padding: 20px; color: #000; font-size: 12px; }
            .header { text-align: center; margin-bottom: 20px; }
            .header h1 { font-size: 18px; font-weight: bold; margin-bottom: 15px; text-decoration: underline; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th, td { border: 1px solid #000; padding: 8px 10px; text-align: left; font-size: 11px; }
            th { background: #f0f0f0; font-weight: bold; }
            .text-center { text-align: center; }
            .footer { margin-top: 40px; display: flex; justify-content: space-between; padding: 0 20px; }
            .signature-block { text-align: center; width: 150px; }
            .signature-line { border-top: 1px solid #000; margin-top: 40px; padding-top: 5px; font-size: 10px; }
            .page-info { text-align: right; margin-top: 20px; font-size: 10px; }
            @media print { body { padding: 10px; } }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>SUMMARY DELIVERY OUT WAREHOUSE</h1>
            <div style="text-align: left; margin-top: 15px; margin-bottom: 15px;">
              <strong>To Branch:</strong> ${destination}
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Date Out Warehouse</th>
                <th>Bill No</th>
                <th>Courier</th>
                <th>Waybill No</th>
                <th>Category</th>
                <th class="text-center">Boxes</th>
                <th class="text-center">Qty</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>${format(new Date(dateReleased), 'yyyy-MM-dd')}</td>
                <td>${billNumber}</td>
                <td>${courier || '-'}</td>
                <td>${waybillNo}</td>
                <td>${category}</td>
                <td class="text-center">${totalBoxes}</td>
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
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Summary Delivery Out Warehouse
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
            <h2 className="text-lg font-bold underline">SUMMARY DELIVERY OUT WAREHOUSE</h2>
          </div>

          {/* To Branch */}
          <div className="text-sm">
            <span className="font-semibold">To Branch:</span> {destination}
          </div>

          {/* Table */}
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted">
                  <TableHead className="font-bold border-r">Date Out Warehouse</TableHead>
                  <TableHead className="font-bold border-r">Bill No</TableHead>
                  <TableHead className="font-bold border-r">Courier</TableHead>
                  <TableHead className="font-bold border-r">Waybill No</TableHead>
                  <TableHead className="font-bold border-r">Category</TableHead>
                  <TableHead className="font-bold text-center w-[80px] border-r">Boxes</TableHead>
                  <TableHead className="font-bold text-center w-[80px]">Qty</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="border-r">{format(new Date(dateReleased), 'yyyy-MM-dd')}</TableCell>
                  <TableCell className="border-r font-mono font-semibold">{billNumber}</TableCell>
                  <TableCell className="border-r">{courier || '-'}</TableCell>
                  <TableCell className="border-r">{waybillNo}</TableCell>
                  <TableCell className="border-r">{category}</TableCell>
                  <TableCell className="text-center border-r">{totalBoxes}</TableCell>
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
