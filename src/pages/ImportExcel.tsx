import { useState, useRef } from 'react';
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, Printer, Save, X, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  
  const [parsedItems, setParsedItems] = useState<ParsedItem[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [results, setResults] = useState<{ success: number; failed: number; errors: string[] } | null>(null);
  const [savedItems, setSavedItems] = useState<ParsedItem[]>([]);

  // Helper to find column value with multiple possible names
  const findColumnValue = (row: Record<string, unknown>, ...possibleNames: string[]): string => {
    const keys = Object.keys(row);
    
    for (const name of possibleNames) {
      // Check exact match first
      if (row[name] !== undefined && row[name] !== null && String(row[name]).trim() !== '') {
        return String(row[name]).trim();
      }
      
      // Check case-insensitive exact match
      const exactKey = keys.find(k => k.toLowerCase().trim() === name.toLowerCase().trim());
      if (exactKey && row[exactKey] !== undefined && row[exactKey] !== null && String(row[exactKey]).trim() !== '') {
        return String(row[exactKey]).trim();
      }
    }
    
    // If no exact match, try partial matching
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
    // Remove any currency symbols and commas
    const cleanVal = val.replace(/[₱$,]/g, '').trim();
    return Number(cleanVal) || 0;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setResults(null);
    setSavedItems([]);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      
      // Try different parsing options
      let rows = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, unknown>[];
      
      // If no rows found, try with header option
      if (rows.length === 0) {
        rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown as Record<string, unknown>[];
        // Convert array format to object format using first row as headers
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

      console.log('Parsed Excel rows:', rows);
      console.log('First row keys:', rows[0] ? Object.keys(rows[0]) : 'No rows');

      const items: ParsedItem[] = rows.map((row, index) => {
        // Get all keys for debugging
        const keys = Object.keys(row);
        console.log(`Row ${index} keys:`, keys, 'values:', row);
        
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

      // Filter out empty rows - check if any key field has value
      const validItems = items.filter(item => 
        item.itemName || item.itemCode || item.qty > 0
      );

      console.log('Valid items:', validItems);

      setParsedItems(validItems);
      toast({ 
        title: 'File Parsed', 
        description: validItems.length > 0 
          ? `${validItems.length} items found. Review and edit before saving.`
          : 'No items found. Check if your Excel has correct column headers.'
      });
    } catch (error) {
      console.error('Excel parse error:', error);
      toast({ title: 'Error', description: 'Failed to read file. Make sure it is a valid Excel file.', variant: 'destructive' });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleEdit = (id: string) => {
    setEditingId(id);
  };

  const handleSaveEdit = () => {
    setEditingId(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
  };

  const handleDelete = (id: string) => {
    setParsedItems(prev => prev.filter(item => item.id !== id));
  };

  const handleFieldChange = (id: string, field: keyof ParsedItem, value: string | number) => {
    setParsedItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      return { ...item, [field]: value };
    }));
  };

  const handleSaveAll = async () => {
    if (parsedItems.length === 0) return;

    setSaving(true);
    let success = 0;
    let failed = 0;
    const errors: string[] = [];
    const saved: ParsedItem[] = [];

    for (const item of parsedItems) {
      try {
        if (!item.itemName || !item.itemCode) {
          errors.push(`Row missing item name or code: ${item.sheetNo || 'Unknown'}`);
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
          item_name: item.itemName,
          item_code: item.itemCode,
          category_id: categoryId,
          total_stock: item.qty,
          price: item.price,
          amount: item.amount,
          supplier: item.supplier || undefined,
          date_received: item.dateReceived || undefined,
          created_by: user?.id,
        });

        saved.push(item);
        success++;
      } catch (err) {
        failed++;
        errors.push(`Failed to import: ${item.itemCode} - ${String(err)}`);
      }
    }

    setResults({ success, failed, errors });
    setSavedItems(saved);
    setParsedItems([]);
    await fetchAll();
    toast({ title: 'Import Complete', description: `${success} items imported successfully` });
    setSaving(false);
  };

  const handleClearAll = () => {
    setParsedItems([]);
    setResults(null);
    setSavedItems([]);
  };

  const handlePrint = () => {
    const items = savedItems.length > 0 ? savedItems : parsedItems;
    if (items.length === 0) return;
    
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
              \${items.map((item) => \`
                <tr>
                  <td>\${item.sheetNo || '-'}</td>
                  <td>\${item.itemCode}</td>
                  <td>\${item.itemName}</td>
                  <td class="text-center">\${item.qty}</td>
                  <td class="text-right">\${item.price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                  <td class="text-right">\${item.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                  <td>\${item.remarks || '-'}</td>
                </tr>
              \`).join('')}
              <tr class="total-row">
                <td colspan="3" class="text-right">Total:</td>
                <td class="text-center">\${totalQty}</td>
                <td></td>
                <td class="text-right">\${totalAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
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

  const totalQty = parsedItems.reduce((sum, item) => sum + item.qty, 0);
  const totalAmount = parsedItems.reduce((sum, item) => sum + item.amount, 0);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Upload Section */}
      <div className="rounded-xl border bg-card p-8 shadow-sm text-center">
        <FileSpreadsheet className="h-16 w-16 mx-auto text-primary mb-4" />
        <h2 className="text-xl font-semibold mb-2">Import Inventory from Excel</h2>
        <p className="text-muted-foreground mb-6">Upload .xlsx or .csv file with columns: Sheet No., Product Code, Product Description, Qty, Price, Remarks</p>
        
        <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} className="hidden" id="file-upload" />
        <Button asChild size="lg" className="gap-2">
          <label htmlFor="file-upload" className="cursor-pointer">
            <Upload className="h-4 w-4" />
            Choose File
          </label>
        </Button>
      </div>

      {/* Parsed Items Preview - Editable */}
      {parsedItems.length > 0 && (
        <div className="rounded-xl border bg-card p-6 shadow-sm animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Preview & Edit Items ({parsedItems.length} items)</h3>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="h-4 w-4 mr-1" />
                Print
              </Button>
              <Button variant="outline" size="sm" onClick={handleClearAll}>
                <X className="h-4 w-4 mr-1" />
                Clear
              </Button>
              <Button size="sm" onClick={handleSaveAll} disabled={saving}>
                <Save className="h-4 w-4 mr-1" />
                {saving ? 'Saving...' : 'Save All'}
              </Button>
            </div>
          </div>

          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted">
                  <TableHead className="font-bold border-r w-[120px]">Sheet No.</TableHead>
                  <TableHead className="font-bold border-r w-[140px]">Product Code</TableHead>
                  <TableHead className="font-bold border-r">Product Description</TableHead>
                  <TableHead className="font-bold border-r text-center w-[70px]">Qty</TableHead>
                  <TableHead className="font-bold border-r text-right w-[100px]">Price</TableHead>
                  <TableHead className="font-bold border-r text-right w-[100px]">Amount</TableHead>
                  <TableHead className="font-bold border-r w-[120px]">Remarks</TableHead>
                  <TableHead className="font-bold text-center w-[80px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parsedItems.map((item) => (
                  <TableRow key={item.id}>
                    {editingId === item.id ? (
                      <>
                        <TableCell className="border-r p-1">
                          <Input
                            value={item.sheetNo}
                            onChange={(e) => handleFieldChange(item.id, 'sheetNo', e.target.value)}
                            className="h-8 text-sm"
                          />
                        </TableCell>
                        <TableCell className="border-r p-1">
                          <Input
                            value={item.itemCode}
                            onChange={(e) => handleFieldChange(item.id, 'itemCode', e.target.value)}
                            className="h-8 text-sm"
                          />
                        </TableCell>
                        <TableCell className="border-r p-1">
                          <Input
                            value={item.itemName}
                            onChange={(e) => handleFieldChange(item.id, 'itemName', e.target.value)}
                            className="h-8 text-sm"
                          />
                        </TableCell>
                        <TableCell className="border-r p-1">
                          <Input
                            type="number"
                            value={item.qty}
                            onChange={(e) => handleFieldChange(item.id, 'qty', Number(e.target.value))}
                            className="h-8 text-sm text-center"
                          />
                        </TableCell>
                        <TableCell className="border-r p-1">
                          <Input
                            type="number"
                            step="0.01"
                            value={item.price}
                            onChange={(e) => handleFieldChange(item.id, 'price', Number(e.target.value))}
                            className="h-8 text-sm text-right"
                          />
                        </TableCell>
                        <TableCell className="border-r p-1">
                          <Input
                            type="number"
                            step="0.01"
                            value={item.amount}
                            onChange={(e) => handleFieldChange(item.id, 'amount', Number(e.target.value))}
                            className="h-8 text-sm text-right"
                          />
                        </TableCell>
                        <TableCell className="border-r p-1">
                          <Input
                            value={item.remarks}
                            onChange={(e) => handleFieldChange(item.id, 'remarks', e.target.value)}
                            className="h-8 text-sm"
                          />
                        </TableCell>
                        <TableCell className="p-1">
                          <div className="flex justify-center gap-1">
                            <Button size="sm" variant="ghost" onClick={handleSaveEdit} className="h-7 w-7 p-0">
                              <CheckCircle className="h-4 w-4 text-green-600" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={handleCancelEdit} className="h-7 w-7 p-0">
                              <X className="h-4 w-4 text-red-600" />
                            </Button>
                          </div>
                        </TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell className="border-r text-sm">{item.sheetNo || '-'}</TableCell>
                        <TableCell className="border-r font-mono text-sm">{item.itemCode}</TableCell>
                        <TableCell className="border-r text-sm">{item.itemName}</TableCell>
                        <TableCell className="border-r text-center">{item.qty}</TableCell>
                        <TableCell className="border-r text-right">{item.price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</TableCell>
                        <TableCell className="border-r text-right font-semibold">{item.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</TableCell>
                        <TableCell className="border-r text-sm">{item.remarks || '-'}</TableCell>
                        <TableCell className="p-1">
                          <div className="flex justify-center gap-1">
                            <Button size="sm" variant="ghost" onClick={() => handleEdit(item.id)} className="h-7 w-7 p-0">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => handleDelete(item.id)} className="h-7 w-7 p-0 text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </>
                    )}
                  </TableRow>
                ))}
                <TableRow className="bg-muted/50 font-bold">
                  <TableCell colSpan={3} className="text-right border-r">Total:</TableCell>
                  <TableCell className="text-center border-r">{totalQty}</TableCell>
                  <TableCell className="border-r"></TableCell>
                  <TableCell className="text-right border-r">{totalAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</TableCell>
                  <TableCell colSpan={2}></TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Results after saving */}
      {results && (
        <div className="rounded-xl border bg-card p-6 shadow-sm animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Import Results</h3>
            {savedItems.length > 0 && (
              <Button variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="h-4 w-4 mr-1" />
                Print
              </Button>
            )}
          </div>
          <div className="flex gap-6 mb-4">
            <div className="flex items-center gap-2 text-status-delivered">
              <CheckCircle className="h-5 w-5" />
              <span>{results.success} successful</span>
            </div>
            {results.failed > 0 && (
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-5 w-5" />
                <span>{results.failed} failed</span>
              </div>
            )}
          </div>
          {results.errors.length > 0 && (
            <div className="text-sm text-muted-foreground space-y-1">
              {results.errors.slice(0, 5).map((err, i) => <p key={i}>{err}</p>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ImportExcel;
