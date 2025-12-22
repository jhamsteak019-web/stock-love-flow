import { useState, useRef } from 'react';
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, Printer, FolderOpen, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useInventory } from '@/hooks/useInventory';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import * as XLSX from 'xlsx';

interface ParsedItem {
  id: string;
  year: string;
  name: string;
  upc: string;
  description: string;
  category: string;
  priceA: number;
  branch: string;
}

interface ImportBatch {
  id: string;
  fileName: string;
  importDate: string;
  itemCount: number;
  items: ParsedItem[];
}

const IMPORT_BUCKET_KEY = 'import_excel_bucket';

const ImportExcel = () => {
  const { addItem, addCategory, categories, fetchAll } = useInventory();
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<{ success: number; failed: number; errors: string[]; items: ParsedItem[] } | null>(null);
  const [importBucket, setImportBucket] = useState<ImportBatch[]>(() => {
    const saved = localStorage.getItem(IMPORT_BUCKET_KEY);
    return saved ? JSON.parse(saved) : [];
  });

  const saveToBucket = (batch: ImportBatch) => {
    const updated = [batch, ...importBucket];
    setImportBucket(updated);
    localStorage.setItem(IMPORT_BUCKET_KEY, JSON.stringify(updated));
  };

  const removeFromBucket = (batchId: string) => {
    const updated = importBucket.filter(b => b.id !== batchId);
    setImportBucket(updated);
    localStorage.setItem(IMPORT_BUCKET_KEY, JSON.stringify(updated));
    toast({ title: 'Removed', description: 'Import batch removed from bucket' });
  };

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

      // Parse items matching new format: YEAR, Name, UPC, Description, Category, Price A, Branch
      const items: ParsedItem[] = rows.map((row, index) => {
        return {
          id: `item-${index}-${Date.now()}`,
          year: findColumnValue(row, 'YEAR', 'Year', 'year'),
          name: findColumnValue(row, 'Name', 'NAME', 'Item Name', 'ITEM NAME', 'Product Name'),
          upc: findColumnValue(row, 'UPC', 'upc', 'Barcode', 'BARCODE', 'Item Code', 'ITEM CODE', 'Code', 'SKU'),
          description: findColumnValue(row, 'Description', 'DESCRIPTION', 'Desc', 'DESC', 'Product Description'),
          category: findColumnValue(row, 'Category', 'CATEGORY', 'Cat', 'Type'),
          priceA: findNumericValue(row, 'Price A', 'PRICE A', 'Price', 'PRICE', 'Unit Price', 'Cost'),
          branch: findColumnValue(row, 'Branch', 'BRANCH', 'Location', 'Store', 'Destination'),
        };
      });

      const validItems = items.filter(item => item.name || item.upc || item.description);

      if (validItems.length === 0) {
        toast({ title: 'No Items Found', description: 'Check if your Excel has correct column headers (YEAR, Name, UPC, Description, Category, Price A, Branch).', variant: 'destructive' });
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
          if (!item.name && !item.upc && !item.description) {
            errors.push(`Row missing required data`);
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

          const itemName = item.name || item.description || item.upc;
          const itemCode = item.upc || `${item.year}-${item.name}`.substring(0, 50);

          await addItem({
            item_name: itemName,
            item_code: itemCode,
            category_id: categoryId,
            total_stock: 1,
            price: item.priceA,
            amount: item.priceA,
            supplier: item.branch || undefined,
            date_received: undefined,
            created_by: user?.id,
          });

          savedItems.push(item);
          success++;
        } catch (err) {
          failed++;
          errors.push(`Failed: ${item.name || item.upc} - ${String(err)}`);
        }
      }

      // Save to bucket
      if (savedItems.length > 0) {
        saveToBucket({
          id: crypto.randomUUID(),
          fileName: file.name,
          importDate: new Date().toISOString(),
          itemCount: savedItems.length,
          items: savedItems,
        });
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

  const handlePrint = (items: ParsedItem[]) => {
    if (items.length === 0) return;
    
    const totalPrice = items.reduce((sum, item) => sum + item.priceA, 0);
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
                <th>Year</th>
                <th>Name</th>
                <th>UPC</th>
                <th>Description</th>
                <th>Category</th>
                <th class="text-right">Price A</th>
                <th>Branch</th>
              </tr>
            </thead>
            <tbody>
              ${items.map((item) => `
                <tr>
                  <td>${item.year || '-'}</td>
                  <td>${item.name}</td>
                  <td>${item.upc || '-'}</td>
                  <td>${item.description || '-'}</td>
                  <td>${item.category || '-'}</td>
                  <td class="text-right">${item.priceA.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                  <td>${item.branch || '-'}</td>
                </tr>
              `).join('')}
              <tr class="total-row">
                <td colspan="5" class="text-right">Total:</td>
                <td class="text-right">${totalPrice.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
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
        <p className="text-muted-foreground mb-2">
          Upload .xlsx or .csv file - items will be imported automatically
        </p>
        <p className="text-sm text-muted-foreground mb-6">
          Expected columns: <span className="font-medium">YEAR, Name, UPC, Description, Category, Price A, Branch</span>
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
              <Button variant="outline" size="sm" onClick={() => handlePrint(results.items)}>
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
                    <TableHead className="font-bold">Year</TableHead>
                    <TableHead className="font-bold">Name</TableHead>
                    <TableHead className="font-bold">UPC</TableHead>
                    <TableHead className="font-bold">Description</TableHead>
                    <TableHead className="font-bold">Category</TableHead>
                    <TableHead className="font-bold text-right">Price A</TableHead>
                    <TableHead className="font-bold">Branch</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.year || '-'}</TableCell>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell className="font-mono">{item.upc || '-'}</TableCell>
                      <TableCell>{item.description || '-'}</TableCell>
                      <TableCell>{item.category || '-'}</TableCell>
                      <TableCell className="text-right">{item.priceA.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell>{item.branch || '-'}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/50 font-bold">
                    <TableCell colSpan={5} className="text-right">Total:</TableCell>
                    <TableCell className="text-right">{results.items.reduce((sum, item) => sum + item.priceA, 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}

      {/* Import Bucket Section */}
      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <FolderOpen className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Import Bucket</h2>
            <p className="text-sm text-muted-foreground">Previously imported Excel files</p>
          </div>
        </div>

        {importBucket.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No imports yet</p>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File Name</TableHead>
                  <TableHead>Import Date</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {importBucket.map((batch) => (
                  <TableRow key={batch.id}>
                    <TableCell className="font-medium">{batch.fileName}</TableCell>
                    <TableCell>{new Date(batch.importDate).toLocaleString()}</TableCell>
                    <TableCell>{batch.itemCount}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-2 justify-end">
                        <Button variant="ghost" size="sm" onClick={() => handlePrint(batch.items)}>
                          <Printer className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => removeFromBucket(batch.id)} className="text-destructive hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ImportExcel;