import { useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { StockRelease } from '@/types/inventory';
import { format, differenceInDays } from 'date-fns';
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
  setDate?: string | null;
  isViewer?: boolean;
}

const AllocationBillModal = ({ open, onOpenChange, releases, destination, courier, dateReleased, dateDelivered, allocationBill, setDate, isViewer = false }: AllocationBillModalProps) => {
  const printRef = useRef<HTMLDivElement>(null);
  const totalBoxes = releases.reduce((sum, r) => sum + r.boxes_released, 0);
  const totalQty = releases.reduce((sum, r) => sum + (r.total_qty || 0), 0);
  const totalAmount = releases.reduce((sum, r) => {
    const price = r.inventory_item?.price || 0;
    const qty = r.total_qty || 0;
    return sum + (price * qty);
  }, 0);
  const billNumber = allocationBill || releases[0]?.allocation_bill || releases[0]?.batch_id?.slice(0, 8).toUpperCase() || 'N/A';
  const waybillNo = releases[0]?.waybill_no || '-';
  const category = releases[0]?.category || '-';
  const remarks = releases[0]?.notes || '-';
  const dateOutWarehouse = setDate || releases[0]?.set_date;
  const releasedByName = releases[0]?.profile?.full_name || releases[0]?.profile?.email || '-';
  
  // Calculate delivery days
  const deliveryDays = dateOutWarehouse && dateDelivered 
    ? differenceInDays(new Date(dateDelivered), new Date(dateOutWarehouse))
    : null;

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const itemsHtml = releases.map((release, index) => {
      const itemCode = release.inventory_item?.item_code || '-';
      const description = release.inventory_item?.description || release.inventory_item?.item_name || '-';
      const qty = release.total_qty || release.boxes_released;
      const price = release.inventory_item?.price || 0;
      const amount = price * qty;
      
      return `
        <tr>
          <td>${itemCode}</td>
          <td>${description}</td>
          <td class="text-center">${qty}</td>
          <td class="text-right">${price.toFixed(2)}</td>
          <td class="text-right">${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        </tr>
      `;
    }).join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Warehouse Allocation Bill - ${billNumber}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: Arial, sans-serif; padding: 20px; color: #000; font-size: 11px; }
            .header { margin-bottom: 20px; }
            .header-title { text-align: center; font-size: 16px; font-weight: bold; margin-bottom: 15px; border-bottom: 2px solid #000; padding-bottom: 10px; }
            .header-info { display: flex; justify-content: space-between; margin-bottom: 10px; }
            .header-left { text-align: left; }
            .header-right { text-align: right; }
            .bill-number { font-size: 14px; font-weight: bold; color: #000; }
            .info-row { margin-bottom: 3px; }
            .info-label { font-weight: bold; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
            th, td { border: 1px solid #000; padding: 6px 8px; font-size: 10px; }
            th { background: #f0f0f0; font-weight: bold; text-align: left; }
            .text-center { text-align: center; }
            .text-right { text-align: right; }
            .totals-row { font-weight: bold; background: #f5f5f5; }
            .summary-box { margin-top: 15px; padding: 10px; border: 1px solid #000; background: #fafafa; }
            .summary-row { display: flex; justify-content: space-between; margin-bottom: 5px; }
            .footer { margin-top: 40px; display: flex; justify-content: space-between; padding: 0 20px; }
            .signature-block { text-align: center; width: 120px; }
            .signature-line { border-top: 1px solid #000; margin-top: 40px; padding-top: 5px; font-size: 9px; }
            @media print { body { padding: 10px; } }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="header-title">WAREHOUSE ALLOCATION BILL</div>
            <div class="header-info">
              <div class="header-left">
                <div class="info-row"><span class="info-label">WH-Kawit</span></div>
                <div class="info-row"><span class="info-label">To Branch:</span> ${destination}</div>
                <div class="info-row"><span class="info-label">Remarks:</span> ${remarks}</div>
              </div>
              <div class="header-right">
                <div class="bill-number">${billNumber}</div>
                <div class="info-row">${dateOutWarehouse ? format(new Date(dateOutWarehouse), 'yyyy-MM-dd') : '-'}</div>
                <div class="info-row">${releasedByName}</div>
              </div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 25%;">Product Code</th>
                <th style="width: 35%;">Product Description</th>
                <th style="width: 10%;" class="text-center">Qty</th>
                <th style="width: 15%;" class="text-right">Price</th>
                <th style="width: 15%;" class="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
              <tr class="totals-row">
                <td colspan="2" class="text-right">Total Qty:</td>
                <td class="text-center">${totalQty}</td>
                <td></td>
                <td class="text-right">${totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              </tr>
            </tbody>
          </table>

          <div class="summary-box">
            <div class="summary-row"><span class="info-label">Total Boxes:</span> <span>${totalBoxes}</span></div>
            <div class="summary-row"><span class="info-label">Waybill No:</span> <span>${waybillNo}</span></div>
            <div class="summary-row"><span class="info-label">Courier:</span> <span>${courier || '-'}</span></div>
            <div class="summary-row"><span class="info-label">Date Out Warehouse:</span> <span>${dateOutWarehouse ? format(new Date(dateOutWarehouse), 'yyyy-MM-dd') : '-'}</span></div>
            <div class="summary-row"><span class="info-label">Date Received:</span> <span>${dateDelivered ? format(new Date(dateDelivered), 'yyyy-MM-dd') : '-'}</span></div>
            <div class="summary-row"><span class="info-label">Delivery Days:</span> <span>${deliveryDays !== null ? `${deliveryDays} day(s)` : '-'}</span></div>
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Warehouse Allocation Bill
            </DialogTitle>
            {!isViewer && (
              <Button variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="h-4 w-4 mr-1" />
                Save PDF
              </Button>
            )}
          </div>
        </DialogHeader>

        <div ref={printRef} className="space-y-4">
          {/* Header */}
          <div className="text-center pb-4 border-b-2 border-foreground">
            <h2 className="text-lg font-bold">WAREHOUSE ALLOCATION BILL</h2>
          </div>

          {/* Bill Info */}
          <div className="flex justify-between items-start">
            <div className="space-y-1 text-sm">
              <div><span className="font-semibold">WH-Kawit</span></div>
              <div><span className="font-semibold">To Branch:</span> {destination}</div>
              <div><span className="font-semibold">Remarks:</span> {remarks}</div>
            </div>
            <div className="text-right space-y-1 text-sm">
              <div className="text-lg font-bold font-mono">{billNumber}</div>
              <div>{dateOutWarehouse ? format(new Date(dateOutWarehouse), 'yyyy-MM-dd') : '-'}</div>
              <div>{releasedByName}</div>
            </div>
          </div>

          {/* Products Table */}
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted">
                  <TableHead className="font-bold border-r w-[25%]">Product Code</TableHead>
                  <TableHead className="font-bold border-r w-[35%]">Product Description</TableHead>
                  <TableHead className="font-bold border-r text-center w-[10%]">Qty</TableHead>
                  <TableHead className="font-bold border-r text-right w-[15%]">Price</TableHead>
                  <TableHead className="font-bold text-right w-[15%]">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {releases.map((release, index) => {
                  const itemCode = release.inventory_item?.item_code || '-';
                  const description = release.inventory_item?.description || release.inventory_item?.item_name || '-';
                  const qty = release.total_qty || release.boxes_released;
                  const price = release.inventory_item?.price || 0;
                  const amount = price * qty;
                  
                  return (
                    <TableRow key={release.id || index}>
                      <TableCell className="border-r font-mono text-xs">{itemCode}</TableCell>
                      <TableCell className="border-r text-xs">{description}</TableCell>
                      <TableCell className="border-r text-center">{qty}</TableCell>
                      <TableCell className="border-r text-right">{price.toFixed(2)}</TableCell>
                      <TableCell className="text-right">{amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                    </TableRow>
                  );
                })}
                {/* Totals Row */}
                <TableRow className="bg-muted font-semibold">
                  <TableCell colSpan={2} className="border-r text-right">Total Qty:</TableCell>
                  <TableCell className="border-r text-center">{totalQty}</TableCell>
                  <TableCell className="border-r"></TableCell>
                  <TableCell className="text-right">{totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>

          {/* Summary Info Box */}
          <div className="bg-muted/50 rounded-lg border p-4 space-y-2 text-sm">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div><span className="font-semibold">Total Boxes:</span> {totalBoxes}</div>
              <div><span className="font-semibold">Waybill No:</span> {waybillNo}</div>
              <div><span className="font-semibold">Courier:</span> {courier || '-'}</div>
              <div><span className="font-semibold">Date Out Warehouse:</span> {dateOutWarehouse ? format(new Date(dateOutWarehouse), 'yyyy-MM-dd') : '-'}</div>
              <div><span className="font-semibold">Date Received:</span> {dateDelivered ? format(new Date(dateDelivered), 'yyyy-MM-dd') : '-'}</div>
              <div><span className="font-semibold">Delivery Days:</span> {deliveryDays !== null ? `${deliveryDays} day(s)` : '-'}</div>
            </div>
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
