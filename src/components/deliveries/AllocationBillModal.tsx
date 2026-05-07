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

const toNumber = (value: unknown, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const formatMoney = (value: unknown) => {
  return toNumber(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const toValidDate = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatDate = (value?: string | null) => {
  const date = toValidDate(value);
  return date ? format(date, 'yyyy-MM-dd') : '-';
};

const AllocationBillModal = ({ open, onOpenChange, releases, destination, courier, dateReleased, dateDelivered, allocationBill, setDate, isViewer = false }: AllocationBillModalProps) => {
  const printRef = useRef<HTMLDivElement>(null);
  const totalBoxes = releases.reduce((sum, r) => sum + toNumber(r.boxes_released), 0);
  const totalQty = releases.reduce((sum, r) => sum + toNumber(r.total_qty), 0);
  const totalAmount = releases.reduce((sum, r) => {
    if (r.amount != null) return sum + toNumber(r.amount);
    const price = toNumber(r.unit_price ?? r.inventory_item?.price);
    const qty = toNumber(r.total_qty);
    return sum + (price * qty);
  }, 0);
  const billNumber = allocationBill || releases[0]?.allocation_bill || releases[0]?.batch_id?.slice(0, 8).toUpperCase() || 'N/A';
  const waybillNo = releases[0]?.waybill_no || '-';
  const category = releases[0]?.category || '-';
  const remarks = Array.from(
    new Set(
      releases
        .map(release => release.notes?.trim())
        .filter((note): note is string => Boolean(note))
    )
  ).join(' | ') || '-';
  const dateOutWarehouse = setDate || releases[0]?.set_date;
  const releasedByName = releases[0]?.profile?.full_name || releases[0]?.profile?.email || '-';
  const dateOutWarehouseDate = toValidDate(dateOutWarehouse);
  const dateDeliveredDate = toValidDate(dateDelivered);
  
  // Calculate delivery days
  const deliveryDays = dateOutWarehouseDate && dateDeliveredDate
    ? differenceInDays(dateDeliveredDate, dateOutWarehouseDate)
    : null;

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const itemsHtml = releases.map((release, index) => {
      const itemCode = release.product_code || release.inventory_item?.item_code || '-';
      const description = release.product_description || release.inventory_item?.description || release.inventory_item?.item_name || '-';
      const qty = toNumber(release.total_qty) || toNumber(release.boxes_released);
      const price = toNumber(release.unit_price ?? release.inventory_item?.price);
      const amount = release.amount != null ? toNumber(release.amount) : price * qty;
      
      return `
        <tr>
          <td>${itemCode}</td>
          <td>${description}</td>
          <td class="text-center">${qty}</td>
          <td class="text-right">${price.toFixed(2)}</td>
          <td class="text-right">${formatMoney(amount)}</td>
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
            th, td { border: 1px solid #000; padding: 3px 6px; font-size: 9px; line-height: 1.2; }
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
                <div class="info-row">${formatDate(dateOutWarehouse)}</div>
                <div class="info-row">${releasedByName}</div>
              </div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 24%;">Product Code</th>
                <th style="width: 34%;">Product Description</th>
                <th style="width: 8%;" class="text-center">Qty</th>
                <th style="width: 14%;" class="text-right">Price</th>
                <th style="width: 14%;" class="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
              <tr class="totals-row">
                <td colspan="2" class="text-right">Total Qty:</td>
                <td class="text-center">${totalQty}</td>
                <td></td>
                <td class="text-right">${formatMoney(totalAmount)}</td>
              </tr>
            </tbody>
          </table>

          <div class="summary-box">
            <div class="summary-row"><span class="info-label">Total Boxes:</span> <span>${totalBoxes}</span></div>
            <div class="summary-row"><span class="info-label">Waybill No:</span> <span>${waybillNo}</span></div>
            <div class="summary-row"><span class="info-label">Courier:</span> <span>${courier || '-'}</span></div>
            <div class="summary-row"><span class="info-label">Date Out Warehouse:</span> <span>${formatDate(dateOutWarehouse)}</span></div>
            <div class="summary-row"><span class="info-label">Date Received:</span> <span>${formatDate(dateDelivered)}</span></div>
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
              <div>{formatDate(dateOutWarehouse)}</div>
              <div>{releasedByName}</div>
            </div>
          </div>

          {/* Products Table */}
          <div className="rounded-md border overflow-hidden">
            <Table className="text-xs">
              <TableHeader>
                <TableRow className="bg-muted h-8">
                  <TableHead className="h-8 px-2 py-1 font-bold border-r w-[24%] whitespace-nowrap">Product Code</TableHead>
                  <TableHead className="h-8 px-2 py-1 font-bold border-r w-[34%] whitespace-nowrap">Product Description</TableHead>
                  <TableHead className="h-8 px-2 py-1 font-bold border-r text-center w-[8%] whitespace-nowrap">Qty</TableHead>
                  <TableHead className="h-8 px-2 py-1 font-bold border-r text-right w-[14%] whitespace-nowrap">Price</TableHead>
                  <TableHead className="h-8 px-2 py-1 font-bold text-right w-[14%] whitespace-nowrap">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {releases.map((release, index) => {
                  const itemCode = release.product_code || release.inventory_item?.item_code || '-';
                  const description = release.product_description || release.inventory_item?.description || release.inventory_item?.item_name || '-';
                  const qty = toNumber(release.total_qty) || toNumber(release.boxes_released);
                  const price = toNumber(release.unit_price ?? release.inventory_item?.price);
                  const amount = release.amount != null ? toNumber(release.amount) : price * qty;
                  
                  return (
                    <TableRow key={release.id || index} className="h-8">
                      <TableCell className="border-r font-mono text-xs px-2 py-1 whitespace-nowrap">{itemCode}</TableCell>
                      <TableCell className="border-r text-xs px-2 py-1 whitespace-nowrap">{description}</TableCell>
                      <TableCell className="border-r text-center text-xs px-2 py-1 whitespace-nowrap">{qty}</TableCell>
                      <TableCell className="border-r text-right text-xs px-2 py-1 whitespace-nowrap">{price.toFixed(2)}</TableCell>
                      <TableCell className="text-right text-xs px-2 py-1 whitespace-nowrap">{formatMoney(amount)}</TableCell>
                    </TableRow>
                  );
                })}
                {/* Totals Row */}
                <TableRow className="bg-muted font-semibold h-8">
                  <TableCell colSpan={2} className="border-r text-right text-xs px-2 py-1">Total Qty:</TableCell>
                  <TableCell className="border-r text-center text-xs px-2 py-1">{totalQty}</TableCell>
                  <TableCell className="border-r px-2 py-1"></TableCell>
                  <TableCell className="text-right text-xs px-2 py-1">{formatMoney(totalAmount)}</TableCell>
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
              <div><span className="font-semibold">Date Out Warehouse:</span> {formatDate(dateOutWarehouse)}</div>
              <div><span className="font-semibold">Date Received:</span> {formatDate(dateDelivered)}</div>
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
