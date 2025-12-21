import { useState, useRef } from 'react';
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useInventory } from '@/hooks/useInventory';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import * as XLSX from 'xlsx';

interface ImportedItem {
  itemCode: string;
  itemName: string;
  category: string;
  qty: number;
  supplier: string;
  dateReceived: string;
}

const ImportExcel = () => {
  const { addItem, addCategory, categories, fetchAll } = useInventory();
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<{ success: number; failed: number; errors: string[] } | null>(null);
  const [importedItems, setImportedItems] = useState<ImportedItem[]>([]);

  const handlePrint = () => {
    if (importedItems.length === 0) return;
    
    const totalQty = importedItems.reduce((sum, item) => sum + item.qty, 0);
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
            .page-info { text-align: right; margin-top: 20px; font-size: 10px; }
            @media print { body { padding: 10px; } }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>IMPORTED INVENTORY ITEMS</h1>
            <div class="header-info">
              <div class="header-row"><strong>Date Imported:</strong> ${new Date().toLocaleDateString()}</div>
              <div class="header-row"><strong>Total Items:</strong> ${importedItems.length}</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Product Code</th>
                <th>Product Description</th>
                <th>Category</th>
                <th class="text-center">Qty</th>
                <th>Supplier</th>
              </tr>
            </thead>
            <tbody>
              ${importedItems.map((item) => `
                <tr>
                  <td>${item.itemCode}</td>
                  <td>${item.itemName}</td>
                  <td>${item.category || '-'}</td>
                  <td class="text-center">${item.qty}</td>
                  <td>${item.supplier || '-'}</td>
                </tr>
              `).join('')}
              <tr class="total-row">
                <td colspan="3" class="text-right">Total Qty:</td>
                <td class="text-center">${totalQty}</td>
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setResults(null);
    setImportedItems([]);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet) as Record<string, unknown>[];

      let success = 0;
      let failed = 0;
      const errors: string[] = [];
      const imported: ImportedItem[] = [];

      for (const row of rows) {
        try {
          const itemName = String(row['Item Name'] || row['item_name'] || row['Product Description'] || '');
          const itemCode = String(row['Item Code'] || row['SKU'] || row['item_code'] || row['Product Code'] || '');
          const categoryName = String(row['Category'] || row['category'] || '');
          const totalStock = Number(row['Total Stock'] || row['total_stock'] || row['Qty'] || 0);
          const supplier = String(row['Supplier'] || row['supplier'] || '');
          const dateReceived = row['Date Received'] || row['date_received'];

          if (!itemName || !itemCode) {
            errors.push(`Row missing item name or code`);
            failed++;
            continue;
          }

          let categoryId: string | undefined;
          if (categoryName) {
            const existing = categories.find(c => c.name.toLowerCase() === categoryName.toLowerCase());
            if (existing) {
              categoryId = existing.id;
            } else {
              const newCat = await addCategory(categoryName);
              categoryId = newCat.id;
            }
          }

          await addItem({
            item_name: itemName,
            item_code: itemCode,
            category_id: categoryId,
            total_stock: totalStock,
            supplier: supplier || undefined,
            date_received: dateReceived ? String(dateReceived) : undefined,
            created_by: user?.id,
          });

          imported.push({
            itemCode,
            itemName,
            category: categoryName,
            qty: totalStock,
            supplier,
            dateReceived: dateReceived ? String(dateReceived) : '',
          });

          success++;
        } catch (err) {
          failed++;
          errors.push(`Failed to import row: ${String(err)}`);
        }
      }

      setResults({ success, failed, errors });
      setImportedItems(imported);
      await fetchAll();
      toast({ title: 'Import Complete', description: `${success} items imported successfully` });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to read file', variant: 'destructive' });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const totalQty = importedItems.reduce((sum, item) => sum + item.qty, 0);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="rounded-xl border bg-card p-8 shadow-sm text-center">
        <FileSpreadsheet className="h-16 w-16 mx-auto text-primary mb-4" />
        <h2 className="text-xl font-semibold mb-2">Import Inventory from Excel</h2>
        <p className="text-muted-foreground mb-6">Upload .xlsx or .csv file with columns: Product Code, Product Description, Category, Qty, Supplier, Date Received</p>
        
        <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} className="hidden" id="file-upload" />
        <Button asChild disabled={importing} size="lg" className="gap-2">
          <label htmlFor="file-upload" className="cursor-pointer">
            <Upload className="h-4 w-4" />
            {importing ? 'Importing...' : 'Choose File'}
          </label>
        </Button>
      </div>

      {results && (
        <div className="rounded-xl border bg-card p-6 shadow-sm animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Import Results</h3>
            {importedItems.length > 0 && (
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
            <div className="text-sm text-muted-foreground space-y-1 mb-4">
              {results.errors.slice(0, 5).map((err, i) => <p key={i}>{err}</p>)}
            </div>
          )}

          {/* Imported Items Table */}
          {importedItems.length > 0 && (
            <div className="rounded-lg border overflow-hidden mt-4">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted">
                    <TableHead className="font-bold border-r">Product Code</TableHead>
                    <TableHead className="font-bold border-r">Product Description</TableHead>
                    <TableHead className="font-bold border-r">Category</TableHead>
                    <TableHead className="font-bold text-center w-[80px] border-r">Qty</TableHead>
                    <TableHead className="font-bold">Supplier</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {importedItems.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell className="border-r font-mono text-sm">{item.itemCode}</TableCell>
                      <TableCell className="border-r">{item.itemName}</TableCell>
                      <TableCell className="border-r">{item.category || '-'}</TableCell>
                      <TableCell className="text-center border-r">{item.qty}</TableCell>
                      <TableCell>{item.supplier || '-'}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/50 font-bold">
                    <TableCell colSpan={3} className="text-right border-r">Total Qty:</TableCell>
                    <TableCell className="text-center border-r">{totalQty}</TableCell>
                    <TableCell></TableCell>
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
