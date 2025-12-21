import { useState, useRef } from 'react';
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useInventory } from '@/hooks/useInventory';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import * as XLSX from 'xlsx';

interface ParsedItem {
  id: string;
  sheetNo: string;
  itemCode: string;
  itemName: string;
  deliverTo: string;
  supplier: string;
  qty: number;
  price: number;
  amount: number;
  remarks: string;
  category: string;
  dateReceived: string;
}

const ImportExcel = () => {
  const { addItem, addCategory, categories, fetchAll } = useInventory();
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<{ success: number; failed: number; errors: string[]; items: ParsedItem[] } | null>(null);

  // Helper to find column value with multiple possible names
  const findColumnValue = (row: Record<string, unknown>, ...possibleNames: string[]): string => {
    const keys = Object.keys(row);
    
    for (const name of possibleNames) {
      if (row[name] !== undefined && row[name] !== null && String(row[name]).trim() !== '') {
        return String(row[name]).trim();
      }
      
      const exactKey = keys.find(k => k.toLowerCase().trim() === name.toLowerCase().trim());
      if (exactKey && row[exactKey] !== undefined && row[exactKey] !== null && String(row[exactKey]).trim() !== '') {
        return String(row[exactKey]).trim();
      }
    }
    
    for (const name of possibleNames) {
      const partialKey = keys.find(k => 
        k.toLowerCase().includes(name.toLowerCase()) || 
        name.toLowerCase().includes(k.toLowerCase())
      );
      if (partialKey && row[partialKey] !== undefined && row[partialKey] !== null && String(row[partialKey]).trim() !== '') {
        return String(row[partialKey]).trim();
      }
    }
    
    return '';
  };

  const findNumericValue = (row: Record<string, unknown>, ...possibleNames: string[]): number => {
    const val = findColumnValue(row, ...possibleNames);
    const cleanVal = val.replace(/[₱$,]/g, '').trim();
    return Number(cleanVal) || 0;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setResults(null);
    setImporting(true);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      
      let rows = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, unknown>[];
      
      if (rows.length === 0) {
        rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown as Record<string, unknown>[];
        if (Array.isArray(rows) && rows.length > 1) {
          const headers = rows[0] as unknown as string[];
          rows = (rows.slice(1) as unknown as unknown[][]).map(row => {
            const obj: Record<string, unknown> = {};
            headers.forEach((header, i) => {
              if (header) obj[String(header)] = row[i];
            });
            return obj;
          });
        }
      }

      const items: ParsedItem[] = rows.map((row, index) => {
        const qty = findNumericValue(row, 'Qty', 'QTY', 'Quantity', 'Total Stock', 'total_stock', 'Stock', 'Boxes', 'Units', 'Pcs', 'pcs');
        const price = findNumericValue(row, 'Price', 'PRICE', 'Unit Price', 'Cost', 'Unit Cost');
        const amount = findNumericValue(row, 'Amount', 'AMOUNT', 'Total', 'Total Amount', 'Subtotal');
        
        return {
          id: `item-${index}-${Date.now()}`,
          sheetNo: findColumnValue(row, 'Sheet No.', 'Sheet No', 'SHEET NO', 'Sheet', 'No.', 'No', 'NO'),
          itemCode: findColumnValue(row, 'Item Code', 'ITEM CODE', 'SKU', 'Product Code', 'PRODUCT CODE', 'Code', 'CODE', 'Barcode', 'ID'),
          itemName: findColumnValue(row, 'Item Name', 'ITEM NAME', 'Product Description', 'PRODUCT DESCRIPTION', 'Description', 'DESCRIPTION', 'Name', 'NAME', 'Product', 'PRODUCT', 'Item', 'ITEM'),
          deliverTo: findColumnValue(row, 'Deliver To', 'DELIVER TO', 'Destination', 'DESTINATION', 'Location', 'LOCATION', 'Ship To'),
          supplier: findColumnValue(row, 'Supplier', 'SUPPLIER', 'Vendor', 'VENDOR'),
          qty,
          price,
          amount: amount > 0 ? amount : qty * price,
          remarks: findColumnValue(row, 'Remarks', 'REMARKS', 'Notes', 'NOTES', 'Note', 'Comment', 'Comments'),
          category: findColumnValue(row, 'Category', 'CATEGORY', 'Type', 'TYPE', 'Group', 'GROUP'),
          dateReceived: findColumnValue(row, 'Date Received', 'DATE RECEIVED', 'Date', 'DATE', 'Received Date', 'Received'),
        };
      });

      const validItems = items.filter(item => item.itemName || item.itemCode || item.qty > 0);

      if (validItems.length === 0) {
        toast({ title: 'No Items Found', description: 'Check if your Excel has correct column headers.', variant: 'destructive' });
        setImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      // Auto-save all items directly
      let success = 0;
      let failed = 0;
      const errors: string[] = [];
      const savedItems: ParsedItem[] = [];

      for (const item of validItems) {
        try {
          if (!item.itemName && !item.itemCode) {
            errors.push(`Row missing item name or code`);
            failed++;
            continue;
          }

          let categoryId: string | undefined;
          if (item.category) {
            const existing = categories.find(c => c.name.toLowerCase() === item.category.toLowerCase());
            if (existing) {
              categoryId = existing.id;
            } else {
              const newCat = await addCategory(item.category);
              categoryId = newCat.id;
            }
          }

          await addItem({
            item_name: item.itemName || item.itemCode,
            item_code: item.itemCode || item.itemName,
            category_id: categoryId,
            total_stock: item.qty,
            price: item.price,
            amount: item.amount,
            supplier: item.supplier || undefined,
            date_received: item.dateReceived || undefined,
            created_by: user?.id,
          });

          savedItems.push(item);
          success++;
        } catch (err) {
          failed++;
          errors.push(`Failed: ${item.itemCode || item.itemName} - ${String(err)}`);
        }
      }

      setResults({ success, failed, errors, items: savedItems });
      await fetchAll();
      toast({ title: 'Import Complete', description: `${success} items imported successfully` });
    } catch (error) {
      console.error('Excel parse error:', error);
      toast({ title: 'Error', description: 'Failed to read file. Make sure it is a valid Excel file.', variant: 'destructive' });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handlePrint = () => {
    if (!results || results.items.length === 0) return;
    
    const items = results.items;
    const totalQty = items.reduce((sum, item) => sum + item.qty, 0);
    const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Imported Inventory Items</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: Arial, sans-serif; padding: 20px; color: #000; font-size: 12px; }
            .header { text-align: center; margin-bottom: 20px; }
            .header h1 { font-size: 18px; font-weight: bold; margin-bottom: 15px; text-decoration: underline; }
            .header-info { text-align: left; margin-bottom: 10px; }
            .header-row { margin-bottom: 4px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th, td { border: 1px solid #000; padding: 6px 8px; text-align: left; font-size: 11px; }
            th { background: #f0f0f0; font-weight: bold; }
            .text-right { text-align: right; }
            .text-center { text-align: center; }
            .total-row { font-weight: bold; }
            .footer { margin-top: 40px; display: flex; justify-content: space-between; padding: 0 20px; }
            .signature-block { text-align: center; width: 150px; }
            .signature-line { border-top: 1px solid #000; margin-top: 40px; padding-top: 5px; font-size: 10px; }
            @media print { body { padding: 10px; } }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>IMPORTED INVENTORY ITEMS</h1>
            <div class="header-info">
              <div class="header-row"><strong>Date:</strong> ${new Date().toLocaleDateString()}</div>
              <div class="header-row"><strong>Total Items:</strong> ${items.length}</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Sheet No.</th>
                <th>Product Code</th>
                <th>Product Description</th>
                <th class="text-center">Qty</th>
                <th class="text-right">Price</th>
                <th class="text-right">Amount</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              ${items.map((item) => `
                <tr>
                  <td>${item.sheetNo || '-'}</td>
                  <td>${item.itemCode}</td>
                  <td>${item.itemName}</td>
                  <td class="text-center">${item.qty}</td>
                  <td class="text-right">${item.price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                  <td class="text-right">${item.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                  <td>${item.remarks || '-'}</td>
                </tr>
              `).join('')}
              <tr class="total-row">
                <td colspan="3" class="text-right">Total:</td>
                <td class="text-center">${totalQty}</td>
                <td></td>
                <td class="text-right">${totalAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                <td></td>
              </tr>
            </tbody>
          </table>

          <div class="footer">
            <div class="signature-block">
              <div class="signature-line">Checked By</div>
            </div>
            <div class="signature-block">
              <div class="signature-line">Approved By</div>
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
    setTimeout(() => printWindow.print(), 250);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Upload Section */}
      <div className="rounded-xl border bg-card p-8 shadow-sm text-center">
        <FileSpreadsheet className="h-16 w-16 mx-auto text-primary mb-4" />
        <h2 className="text-xl font-semibold mb-2">Import Inventory from Excel</h2>
        <p className="text-muted-foreground mb-6">
          Upload .xlsx or .csv file - items will be imported automatically
        </p>
        
        <input 
          ref={fileInputRef} 
          type="file" 
          accept=".xlsx,.xls,.csv" 
          onChange={handleFileUpload} 
          className="hidden" 
          id="file-upload" 
          disabled={importing}
        />
        <Button asChild size="lg" className="gap-2" disabled={importing}>
          <label htmlFor="file-upload" className="cursor-pointer">
            <Upload className="h-4 w-4" />
            {importing ? 'Importing...' : 'Choose File & Import'}
          </label>
        </Button>
      </div>

      {/* Results Section */}
      {results && (
        <div className="rounded-xl border bg-card p-6 shadow-sm animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-full ${results.failed === 0 ? 'bg-green-100' : 'bg-yellow-100'}`}>
                {results.failed === 0 ? (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-yellow-600" />
                )}
              </div>
              <div>
                <h3 className="font-semibold">Import Complete</h3>
                <p className="text-sm text-muted-foreground">
                  {results.success} imported successfully
                  {results.failed > 0 && `, ${results.failed} failed`}
                </p>
              </div>
            </div>
            {results.items.length > 0 && (
              <Button variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="h-4 w-4 mr-1" />
                Print
              </Button>
            )}
          </div>

          {results.errors.length > 0 && (
            <div className="mt-4 p-4 bg-destructive/10 rounded-lg">
              <p className="text-sm font-medium text-destructive mb-2">Errors:</p>
              <ul className="text-sm text-muted-foreground space-y-1">
                {results.errors.slice(0, 5).map((error, i) => (
                  <li key={i}>• {error}</li>
                ))}
                {results.errors.length > 5 && (
                  <li>... and {results.errors.length - 5} more</li>
                )}
              </ul>
            </div>
          )}

          {results.items.length > 0 && (
            <div className="mt-4 rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted">
                    <TableHead className="font-bold">Sheet No.</TableHead>
                    <TableHead className="font-bold">Product Code</TableHead>
                    <TableHead className="font-bold">Product Description</TableHead>
                    <TableHead className="font-bold text-center">Qty</TableHead>
                    <TableHead className="font-bold text-right">Price</TableHead>
                    <TableHead className="font-bold text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.sheetNo || '-'}</TableCell>
                      <TableCell className="font-mono">{item.itemCode}</TableCell>
                      <TableCell>{item.itemName}</TableCell>
                      <TableCell className="text-center">{item.qty}</TableCell>
                      <TableCell className="text-right">{item.price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell className="text-right font-semibold">{item.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/50 font-bold">
                    <TableCell colSpan={3} className="text-right">Total:</TableCell>
                    <TableCell className="text-center">{results.items.reduce((sum, item) => sum + item.qty, 0)}</TableCell>
                    <TableCell></TableCell>
                    <TableCell className="text-right">{results.items.reduce((sum, item) => sum + item.amount, 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ImportExcel;