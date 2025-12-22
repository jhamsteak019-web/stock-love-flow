import { useState, useRef, useEffect } from 'react';
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, Printer, FolderOpen, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
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
  batch_id: string;
  file_name: string;
  created_at: string;
  items: Array<{
    id: string;
    year: string | null;
    name: string;
    upc: string | null;
    description: string | null;
    category: string | null;
    price_a: number | null;
    branch: string | null;
  }>;
}

const ImportExcel = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<{ success: number; failed: number; errors: string[]; items: ParsedItem[] } | null>(null);
  const [importBucket, setImportBucket] = useState<ImportBatch[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchImportBucket = async () => {
    try {
      const { data, error } = await supabase
        .from('imported_items')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Group by batch_id
      const grouped = (data || []).reduce((acc, item) => {
        if (!acc[item.batch_id]) {
          acc[item.batch_id] = {
            batch_id: item.batch_id,
            file_name: item.file_name,
            created_at: item.created_at,
            items: []
          };
        }
        acc[item.batch_id].items.push(item);
        return acc;
      }, {} as Record<string, ImportBatch>);

      setImportBucket(Object.values(grouped));
    } catch (error) {
      console.error('Error fetching import bucket:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchImportBucket();
  }, []);

  const removeFromBucket = async (batchId: string) => {
    try {
      const { error } = await supabase
        .from('imported_items')
        .delete()
        .eq('batch_id', batchId);

      if (error) throw error;

      setImportBucket(prev => prev.filter(b => b.batch_id !== batchId));
      toast({ title: 'Removed', description: 'Import batch removed' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to remove batch', variant: 'destructive' });
    }
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
    if (!file || !user) return;

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
        toast({ title: 'No Items Found', description: 'Check if your Excel has correct column headers.', variant: 'destructive' });
        setImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      const batchId = crypto.randomUUID();
      const insertData = validItems.map(item => ({
        batch_id: batchId,
        file_name: file.name,
        year: item.year || null,
        name: item.name || item.description || item.upc,
        upc: item.upc || null,
        description: item.description || null,
        category: item.category || null,
        price_a: item.priceA || 0,
        branch: item.branch || null,
        imported_by: user.id,
      }));

      const { error } = await supabase.from('imported_items').insert(insertData);

      if (error) throw error;

      setResults({ success: validItems.length, failed: 0, errors: [], items: validItems });
      await fetchImportBucket();
      toast({ title: 'Import Complete', description: `${validItems.length} items imported successfully` });
    } catch (error) {
      console.error('Excel parse error:', error);
      toast({ title: 'Error', description: 'Failed to import file.', variant: 'destructive' });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handlePrint = (items: Array<{ year?: string | null; name: string; upc?: string | null; description?: string | null; category?: string | null; price_a?: number | null; priceA?: number; branch?: string | null }>) => {
    if (items.length === 0) return;
    
    const totalPrice = items.reduce((sum, item) => sum + (item.price_a ?? item.priceA ?? 0), 0);
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Imported Items</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: Arial, sans-serif; padding: 20px; color: #000; font-size: 12px; }
            .header { text-align: center; margin-bottom: 20px; }
            .header h1 { font-size: 18px; font-weight: bold; margin-bottom: 15px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th, td { border: 1px solid #000; padding: 6px 8px; text-align: left; font-size: 11px; }
            th { background: #f0f0f0; font-weight: bold; }
            .text-right { text-align: right; }
            .total-row { font-weight: bold; }
            @media print { body { padding: 10px; } }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>IMPORTED ITEMS</h1>
            <p>Date: ${new Date().toLocaleDateString()} | Total Items: ${items.length}</p>
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
                  <td class="text-right">${(item.price_a ?? item.priceA ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
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
        <h2 className="text-xl font-semibold mb-2">Import Excel</h2>
        <p className="text-muted-foreground mb-2">Upload .xlsx or .csv file</p>
        <p className="text-sm text-muted-foreground mb-6">
          Columns: <span className="font-medium">YEAR, Name, UPC, Description, Category, Price A, Branch</span>
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
                {results.failed === 0 ? <CheckCircle className="h-5 w-5 text-green-600" /> : <AlertCircle className="h-5 w-5 text-yellow-600" />}
              </div>
              <div>
                <h3 className="font-semibold">Import Complete</h3>
                <p className="text-sm text-muted-foreground">{results.success} items imported</p>
              </div>
            </div>
            {results.items.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => handlePrint(results.items)}>
                <Printer className="h-4 w-4 mr-1" /> Print
              </Button>
            )}
          </div>

          {results.items.length > 0 && (
            <div className="mt-4 rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted">
                    <TableHead>Year</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>UPC</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Price A</TableHead>
                    <TableHead>Branch</TableHead>
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

        {loading ? (
          <div className="flex justify-center py-8"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>
        ) : importBucket.length === 0 ? (
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
                  <TableRow key={batch.batch_id}>
                    <TableCell className="font-medium">{batch.file_name}</TableCell>
                    <TableCell>{new Date(batch.created_at).toLocaleString()}</TableCell>
                    <TableCell>{batch.items.length}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-2 justify-end">
                        <Button variant="ghost" size="sm" onClick={() => handlePrint(batch.items)}>
                          <Printer className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => removeFromBucket(batch.batch_id)} className="text-destructive hover:text-destructive">
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