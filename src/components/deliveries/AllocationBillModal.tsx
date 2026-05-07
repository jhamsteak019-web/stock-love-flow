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

const hasUsefulProductText = (value?: string | null) => {
  const cleaned = value?.trim();
  if (!cleaned) return false;
  const normalized = cleaned.toLowerCase();
  return normalized !== '-' && normalized !== 'n/a' && normalized !== 'na' && normalized !== 'null';
};

const firstUsefulProductText = (...values: (string | null | undefined)[]) => {
  return values.find(hasUsefulProductText) || '-';
};

const getProductCode = (release: StockRelease) => {
  return firstUsefulProductText(release.product_code, release.inventory_item?.item_code);
};

const getProductDescription = (release: StockRelease) => {
  return firstUsefulProductText(
    release.product_description,
    release.inventory_item?.description,
    release.inventory_item?.item_name
  );
};

const hasProductDetails = (release: StockRelease) => {
  return [
    release.product_code,
    release.product_description,
    release.inventory_item?.item_code,
    release.inventory_item?.item_name,
    release.inventory_item?.description,
  ].some(hasUsefulProductText);
};

const getSortParts = (release: StockRelease) => {
  const code = getProductCode(release).trim();
  const description = getProductDescription(release).trim();
  const codeSizeMatch = code.match(/^(.*?)[\s_]+(\d{1,3})$/);
  const descriptionSizeMatch = description.match(/(?:^|[\s_])(\d{1,3})$/);

  if (codeSizeMatch) {
    return {
      groupKey: codeSizeMatch[1].trim(),
      size: Number(codeSizeMatch[2]),
    };
  }

  if (descriptionSizeMatch) {
    return {
      groupKey: code,
      size: Number(descriptionSizeMatch[1]),
    };
  }

  return {
    groupKey: code,
    size: Number.MAX_SAFE_INTEGER,
  };
};

const getDisplayReleases = (releaseItems: StockRelease[]) => {
  const detailedItems = releaseItems.filter(hasProductDetails);
  const displayItems = detailedItems.length > 0 ? detailedItems : releaseItems;
  const groupOrder = new Map<string, number>();

  displayItems.forEach((release) => {
    const { groupKey } = getSortParts(release);
    if (!groupOrder.has(groupKey)) {
      groupOrder.set(groupKey, groupOrder.size);
    }
  });

  return displayItems
    .map((release, index) => ({ release, index, parts: getSortParts(release) }))
    .sort((a, b) => {
      const groupDiff = (groupOrder.get(a.parts.groupKey) ?? a.index) - (groupOrder.get(b.parts.groupKey) ?? b.index);
      if (groupDiff !== 0) return groupDiff;
      if (a.parts.size !== b.parts.size) return a.parts.size - b.parts.size;
      return a.index - b.index;
    })
    .map(({ release }) => release);
};

const getReleaseQty = (release: StockRelease) => {
  return toNumber(release.total_qty) || toNumber(release.boxes_released);
};

const getReleasePrice = (release: StockRelease) => {
  return toNumber(release.unit_price ?? release.inventory_item?.price);
};

const getReleaseAmount = (release: StockRelease) => {
  const qty = getReleaseQty(release);
  const price = getReleasePrice(release);
  return qty * price;
};

const AllocationBillModal = ({ open, onOpenChange, releases, destination, courier, dateReleased, dateDelivered, allocationBill, setDate, isViewer = false }: AllocationBillModalProps) => {
  const printRef = useRef<HTMLDivElement>(null);
  const displayReleases = getDisplayReleases(releases);
  const totalBoxes = displayReleases.reduce((sum, r) => sum + toNumber(r.boxes_released), 0);
  const totalQty = displayReleases.reduce((sum, r) => sum + toNumber(r.total_qty), 0);
  const totalAmount = displayReleases.reduce((sum, r) => sum + getReleaseAmount(r), 0);
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

    const itemsHtml = displayReleases.map((release, index) => {
      const itemCode = getProductCode(release);
      const description = getProductDescription(release);
      const qty = getReleaseQty(release);
      const price = getReleasePrice(release);
      const amount = getReleaseAmount(release);
      
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
            body { font-family: Arial, sans-serif; padding: 30px 42px; color: #000; font-size: 12px; }
            .header { margin-bottom: 26px; }
            .header-title { text-align: center; font-size: 20px; font-weight: 800; text-decoration: underline; margin-bottom: 26px; }
            .divider { border-top: 2px solid #000; margin-bottom: 16px; }
            .header-info { display: flex; justify-content: space-between; gap: 24px; margin-bottom: 34px; }
            .header-left { text-align: left; line-height: 1.55; }
            .header-right { text-align: right; line-height: 1.65; min-width: 220px; }
            .bill-number { font-size: 19px; font-weight: 800; letter-spacing: 0.5px; color: #000; }
            .info-row { margin-bottom: 2px; }
            .info-label { font-weight: bold; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 18px; border-top: 2px solid #000; border-bottom: 2px solid #000; }
            th, td { border-bottom: 1px solid #000; padding: 3px 8px; font-size: 11px; line-height: 1.25; }
            th { font-size: 13px; font-weight: 700; text-align: left; border-bottom: 2px solid #000; }
            .text-center { text-align: center; }
            .text-right { text-align: right; }
            .totals-row { font-weight: bold; border-top: 2px solid #000; }
            .totals-row td { border-bottom: 0; padding-top: 6px; padding-bottom: 6px; }
            .summary-box { margin-top: 18px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 9px 24px; font-size: 12px; }
            .summary-row { display: flex; gap: 5px; }
            .footer { margin-top: 58px; display: flex; justify-content: space-between; padding: 0 4px; }
            .signature-block { text-align: center; width: 150px; }
            .signature-line { border-top: 1px solid #000; padding-top: 7px; font-size: 11px; color: #333; }
            @media print { body { padding: 10px; } }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="header-title">WAREHOUSE ALLOCATION BILL</div>
            <div class="divider"></div>
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
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto bg-white p-5 text-black sm:p-6">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-base font-semibold text-black">
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

        <div ref={printRef} className="space-y-5 bg-white px-1 pb-2 text-black">
          {/* Header */}
          <div className="border-b-2 border-black pb-4 text-center">
            <h2 className="text-xl font-extrabold underline underline-offset-4">WAREHOUSE ALLOCATION BILL</h2>
          </div>

          {/* Bill Info */}
          <div className="flex items-start justify-between gap-6">
            <div className="space-y-1 text-sm leading-relaxed">
              <div><span className="font-semibold">WH-Kawit</span></div>
              <div><span className="font-semibold">To Branch:</span> {destination}</div>
              <div><span className="font-semibold">Remarks:</span> {remarks}</div>
            </div>
            <div className="min-w-[220px] space-y-1 text-right text-sm leading-relaxed">
              <div className="font-mono text-xl font-extrabold tracking-wide">{billNumber}</div>
              <div>{formatDate(dateOutWarehouse)}</div>
              <div>{releasedByName}</div>
            </div>
          </div>

          {/* Products Table */}
          <div className="overflow-hidden">
            <Table className="border-y-2 border-black text-[12px]">
              <TableHeader>
                <TableRow className="h-7 border-b-2 border-black hover:bg-transparent">
                  <TableHead className="h-7 w-[25%] whitespace-nowrap px-2 py-1 text-sm font-bold text-black">Product Code</TableHead>
                  <TableHead className="h-7 w-[36%] whitespace-nowrap px-2 py-1 text-sm font-bold text-black">Product Description</TableHead>
                  <TableHead className="h-7 w-[8%] whitespace-nowrap px-2 py-1 text-center text-sm font-bold text-black">Qty</TableHead>
                  <TableHead className="h-7 w-[14%] whitespace-nowrap px-2 py-1 text-right text-sm font-bold text-black">Price</TableHead>
                  <TableHead className="h-7 w-[17%] whitespace-nowrap px-2 py-1 text-right text-sm font-bold text-black">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayReleases.map((release, index) => {
                  const itemCode = getProductCode(release);
                  const description = getProductDescription(release);
                  const qty = getReleaseQty(release);
                  const price = getReleasePrice(release);
                  const amount = getReleaseAmount(release);
                  
                  return (
                    <TableRow key={release.id || index} className="h-6 border-b border-black/70 hover:bg-transparent">
                      <TableCell className="whitespace-nowrap px-2 py-[3px] font-mono text-[11px] text-black">{itemCode}</TableCell>
                      <TableCell className="whitespace-nowrap px-2 py-[3px] text-[11px] text-black">{description}</TableCell>
                      <TableCell className="whitespace-nowrap px-2 py-[3px] text-center text-[11px] text-black">{qty}</TableCell>
                      <TableCell className="whitespace-nowrap px-2 py-[3px] text-right text-[11px] text-black">{price.toFixed(2)}</TableCell>
                      <TableCell className="whitespace-nowrap px-2 py-[3px] text-right text-[11px] text-black">{formatMoney(amount)}</TableCell>
                    </TableRow>
                  );
                })}
                {/* Totals Row */}
                <TableRow className="h-7 border-t-2 border-black font-bold hover:bg-transparent">
                  <TableCell colSpan={2} className="px-2 py-1 text-right text-[12px] text-black">Total Qty:</TableCell>
                  <TableCell className="px-2 py-1 text-center text-[12px] text-black">{totalQty}</TableCell>
                  <TableCell className="px-2 py-1"></TableCell>
                  <TableCell className="px-2 py-1 text-right text-[12px] text-black">{formatMoney(totalAmount)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>

          {/* Summary Info Box */}
          <div className="border-t border-black pt-4 text-sm">
            <div className="grid grid-cols-2 gap-x-8 gap-y-2 md:grid-cols-3">
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
              <div className="w-36 border-t border-black pt-2 text-xs text-black/70">Checked By</div>
            </div>
            <div className="text-center">
              <div className="w-36 border-t border-black pt-2 text-xs text-black/70">Delivered By</div>
            </div>
            <div className="text-center">
              <div className="w-36 border-t border-black pt-2 text-xs text-black/70">Received By</div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AllocationBillModal;
