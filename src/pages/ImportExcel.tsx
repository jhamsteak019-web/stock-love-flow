import { useState, useRef, useEffect } from 'react';
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, Printer, FolderOpen, Trash2, PackagePlus, Archive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import * as XLSX from 'xlsx';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

// Format 1: Sheet No., Deliver To, Supplier, Price, Box, Pieces/Box, Remarks (auto-generated)
interface Format1Item {
  id: string;
  formatType: 'format1';
  sheetNo: string;
  deliverTo: string;
  supplier: string;
  price: number;
  box: number;
  piecesPerBox: number;
  remarks: string;
}

// Format 2: Legacy format (kept for backward compatibility)
interface Format2Item {
  id: string;
  formatType: 'format2';
  sheetNo: string;
  deliverTo: string;
  supplier: string;
  price: number;
  box: number;
  remarks: string;
}

type ParsedItem = Format1Item | Format2Item;

interface ImportBatch {
  batch_id: string;
  file_name: string;
  created_at: string;
  format_type: string;
  items: Array<{
    id: string;
    format_type: string | null;
    year: string | null;
    name: string;
    upc: string | null;
    description: string | null;
    category: string | null;
    price_a: number | null;
    branch: string | null;
    sheet_no: string | null;
    deliver_to: string | null;
    supplier: string | null;
    qty: number | null;
    pieces_per_box: number | null;
    remarks: string | null;
  }>;
}

const ImportExcel = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<{ success: number; failed: number; formatType: string; items: ParsedItem[] } | null>(null);
  const [importBucket, setImportBucket] = useState<ImportBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; batch: ImportBatch | null }>({ open: false, batch: null });

  const fetchImportBucket = async () => {
    try {
      const { data, error } = await supabase
        .from('imported_items')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const grouped = (data || []).reduce((acc, item) => {
        if (!acc[item.batch_id]) {
          acc[item.batch_id] = {
            batch_id: item.batch_id,
            file_name: item.file_name,
            created_at: item.created_at,
            format_type: item.format_type || 'format1',
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

  const handleAddToInventoryClick = (batch: ImportBatch) => {
    setConfirmDialog({ open: true, batch });
  };

  const confirmAddToInventory = async () => {
    if (!confirmDialog.batch) return;
    await addToInventory(confirmDialog.batch);
    setConfirmDialog({ open: false, batch: null });
  };

  const addToInventory = async (batch: ImportBatch) => {
    try {
      const inventoryItems = batch.items.map((item, index) => ({
        item_name: item.sheet_no || item.deliver_to || `Item ${index + 1}`,
        item_code: `${batch.batch_id.slice(0, 8)}-${index + 1}`,
        total_stock: item.qty || 0,  // Box quantity
        available_stock: item.qty || 0,  // Box quantity
        pieces_per_box: item.pieces_per_box || 1,
        price: item.price_a || 0,  // Price from Qty column
        supplier: item.supplier || null,
        description: item.remarks || null,  // Auto-generated remarks
        branch: item.deliver_to || null,
        created_by: user?.id,
      }));

      const { error } = await supabase
        .from('inventory_items')
        .insert(inventoryItems);

      if (error) throw error;

      // Remove from import bucket after successful transfer
      await removeFromBucket(batch.batch_id);
      
      toast({ 
        title: 'Added to Inventory', 
        description: `${inventoryItems.length} items added to inventory` 
      });
    } catch (error) {
      console.error('Error adding to inventory:', error);
      toast({ title: 'Error', description: 'Failed to add items to inventory', variant: 'destructive' });
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

  const detectFormat = (rows: Record<string, unknown>[]): 'format1' | 'format2' => {
    // Always use format1 for the new inventory format
    return 'format1';
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

      // Limit to 50,000 rows maximum
      if (rows.length > 50000) {
        rows = rows.slice(0, 50000);
        toast({ title: 'Row Limit', description: 'Only first 50,000 rows imported.', variant: 'default' });
      }

      const formatType = detectFormat(rows);
      let items: ParsedItem[] = [];
      let insertData: Record<string, unknown>[] = [];
      const batchId = crypto.randomUUID();

      if (formatType === 'format1') {
        // Parse Format 1: Sheet No., Deliver To, Supplier, Price, Box, Pieces/Box
        // Remarks is auto-generated
        items = rows.map((row, index) => {
          const sheetNo = findColumnValue(row, 'Sheet No.', 'Sheet No', 'SHEET NO', 'Sheet', 'SheetNo', 'Bill No', 'Bill');
          const deliverTo = findColumnValue(row, 'Deliver To', 'DELIVER TO', 'DeliverTo', 'Destination', 'Branch');
          const supplier = findColumnValue(row, 'Supplier', 'SUPPLIER');
          const price = findNumericValue(row, 'Qty', 'QTY', 'Quantity', 'QUANTITY', 'Price', 'PRICE', 'Amount');
          const box = findNumericValue(row, 'Box', 'BOX', 'Boxes', 'BOXES', 'Box Qty');
          const piecesPerBox = findNumericValue(row, 'Pieces/Box', 'Pieces Per Box', 'PIECES/BOX', 'Pieces', 'Pcs/Box') || 1;
          
          // Auto-generate remarks like: "SHEET-001-2024-12-22"
          const dateStr = new Date().toISOString().split('T')[0];
          const autoRemarks = sheetNo ? `${sheetNo}-${dateStr}` : `IMP-${index + 1}-${dateStr}`;
          
          return {
            id: `item-${index}-${Date.now()}`,
            formatType: 'format1' as const,
            sheetNo,
            deliverTo,
            supplier,
            price,
            box,
            piecesPerBox,
            remarks: autoRemarks,
          };
        });

        const validItems = items.filter(item => 
          item.formatType === 'format1' && (item.sheetNo || item.deliverTo || item.price > 0 || item.box > 0)
        ) as Format1Item[];

        if (validItems.length === 0) {
          toast({ title: 'No Items Found', description: 'Check column headers (Sheet No., Deliver To, Supplier, Qty/Price, Box, Pieces/Box).', variant: 'destructive' });
          setImporting(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
          return;
        }

        insertData = validItems.map(item => ({
          batch_id: batchId,
          file_name: file.name,
          format_type: 'format1',
          name: item.sheetNo || item.deliverTo || 'Unknown',
          sheet_no: item.sheetNo || null,
          deliver_to: item.deliverTo || null,
          supplier: item.supplier || null,
          price_a: item.price || 0,
          qty: item.box || 0,
          pieces_per_box: item.piecesPerBox || 1,
          remarks: item.remarks || null,
          imported_by: user.id,
        }));

        items = validItems;
      } else {
        // Parse Format 2 (legacy): Sheet No., Deliver To, Supplier, Price, Box, Remarks
        items = rows.map((row, index) => {
          const sheetNo = findColumnValue(row, 'Sheet No.', 'Sheet No', 'SHEET NO', 'Sheet', 'SheetNo');
          const deliverTo = findColumnValue(row, 'Deliver To', 'DELIVER TO', 'DeliverTo', 'Destination');
          const supplier = findColumnValue(row, 'Supplier', 'SUPPLIER');
          const price = findNumericValue(row, 'Qty', 'QTY', 'Quantity', 'QUANTITY', 'Price', 'PRICE');
          const box = findNumericValue(row, 'Box', 'BOX', 'Boxes', 'BOXES');
          
          // Auto-generate remarks
          const dateStr = new Date().toISOString().split('T')[0];
          const autoRemarks = sheetNo ? `${sheetNo}-${dateStr}` : `IMP-${index + 1}-${dateStr}`;
          
          return {
            id: `item-${index}-${Date.now()}`,
            formatType: 'format2' as const,
            sheetNo,
            deliverTo,
            supplier,
            price,
            box,
            remarks: autoRemarks,
          };
        });

        const validItems = items.filter(item => 
          item.formatType === 'format2' && (item.sheetNo || item.deliverTo || item.price > 0 || item.box > 0)
        ) as Format2Item[];

        if (validItems.length === 0) {
          toast({ title: 'No Items Found', description: 'Check column headers.', variant: 'destructive' });
          setImporting(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
          return;
        }

        insertData = validItems.map(item => ({
          batch_id: batchId,
          file_name: file.name,
          format_type: 'format2',
          name: item.sheetNo || item.deliverTo || 'Unknown',
          sheet_no: item.sheetNo || null,
          deliver_to: item.deliverTo || null,
          supplier: item.supplier || null,
          price_a: item.price || 0,
          qty: item.box || 0,
          remarks: item.remarks || null,
          imported_by: user.id,
        }));

        items = validItems;
      }

      const { error } = await supabase.from('imported_items').insert(insertData as {
        batch_id: string;
        file_name: string;
        format_type: string;
        name: string;
        imported_by: string;
        year?: string | null;
        upc?: string | null;
        description?: string | null;
        category?: string | null;
        price_a?: number | null;
        branch?: string | null;
        sheet_no?: string | null;
        deliver_to?: string | null;
        supplier?: string | null;
        qty?: number | null;
        remarks?: string | null;
      }[]);

      if (error) throw error;

      setResults({ success: items.length, failed: 0, formatType, items });
      await fetchImportBucket();
      toast({ title: 'Import Complete', description: `${items.length} items imported` });
    } catch (error) {
      console.error('Excel parse error:', error);
      toast({ title: 'Error', description: 'Failed to import file.', variant: 'destructive' });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handlePrint = (batch: ImportBatch) => {
    const items = batch.items;
    if (items.length === 0) return;
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const totalBox = items.reduce((sum, item) => sum + (item.qty ?? 0), 0);
    const totalPrice = items.reduce((sum, item) => sum + (item.price_a ?? 0), 0);
    const totalPieces = items.reduce((sum, item) => sum + ((item.qty ?? 0) * (item.pieces_per_box ?? 1)), 0);

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Imported Items</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            @page { size: landscape; margin: 10mm; }
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
            <h1>IMPORTED ITEMS - INVENTORY</h1>
            <p>Date: ${new Date().toLocaleDateString()} | File: ${batch.file_name} | Total Items: ${items.length}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>Sheet No.</th>
                <th>Deliver To</th>
                <th>Supplier</th>
                <th class="text-right">Price</th>
                <th class="text-right">Box</th>
                <th class="text-right">Pieces/Box</th>
                <th class="text-right">Total Pieces</th>
                <th>Remarks (Auto)</th>
              </tr>
            </thead>
            <tbody>
              ${items.map((item) => `
                <tr>
                  <td>${item.sheet_no || '-'}</td>
                  <td>${item.deliver_to || '-'}</td>
                  <td>${item.supplier || '-'}</td>
                  <td class="text-right">${(item.price_a ?? 0).toLocaleString()}</td>
                  <td class="text-right">${(item.qty ?? 0).toLocaleString()}</td>
                  <td class="text-right">${item.pieces_per_box ?? 1}</td>
                  <td class="text-right">${((item.qty ?? 0) * (item.pieces_per_box ?? 1)).toLocaleString()}</td>
                  <td>${item.remarks || '-'}</td>
                </tr>
              `).join('')}
              <tr class="total-row">
                <td colspan="3" class="text-right">Total:</td>
                <td class="text-right">${totalPrice.toLocaleString()}</td>
                <td class="text-right">${totalBox.toLocaleString()}</td>
                <td></td>
                <td class="text-right">${totalPieces.toLocaleString()}</td>
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
        <Archive className="h-16 w-16 mx-auto text-primary mb-4" />
        <h2 className="text-xl font-semibold mb-2">Bucket</h2>
        <p className="text-muted-foreground mb-2">Upload .xlsx or .csv file - Max 50,000 rows</p>
        <div className="text-sm text-muted-foreground mb-6">
          <p><Badge variant="outline" className="mr-2">Format</Badge>Sheet No., Deliver To, Supplier, Qty (Price), Box, Pieces/Box</p>
          <p className="text-xs mt-1 text-muted-foreground">Remarks will be auto-generated. Allocation Bill is set manually when releasing stock.</p>
        </div>
        
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
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <h3 className="font-semibold">Import Complete</h3>
                <p className="text-sm text-muted-foreground">
                  {results.success} items imported
                </p>
              </div>
            </div>
          </div>

          {results.items.length > 0 && (
            <div className="mt-4 rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted">
                    <TableHead>Sheet No.</TableHead>
                    <TableHead>Deliver To</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Box</TableHead>
                    <TableHead className="text-right">Pieces/Box</TableHead>
                    <TableHead>Remarks (Auto)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono">{item.sheetNo || '-'}</TableCell>
                      <TableCell>{item.deliverTo || '-'}</TableCell>
                      <TableCell>{item.supplier || '-'}</TableCell>
                      <TableCell className="text-right">{item.price.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{item.box.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{item.formatType === 'format1' ? item.piecesPerBox : 1}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{item.remarks || '-'}</TableCell>
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
                  <TableHead>Format</TableHead>
                  <TableHead>Import Date</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {importBucket.map((batch) => (
                  <TableRow key={batch.batch_id}>
                    <TableCell className="font-medium">{batch.file_name}</TableCell>
                    <TableCell>
                      <Badge variant={batch.format_type === 'format2' ? 'secondary' : 'outline'}>
                        {batch.format_type === 'format2' ? 'Delivery' : 'Inventory'}
                      </Badge>
                    </TableCell>
                    <TableCell>{new Date(batch.created_at).toLocaleString()}</TableCell>
                    <TableCell>{batch.items.length}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-2 justify-end">
                        <Button variant="default" size="sm" onClick={() => handleAddToInventoryClick(batch)} className="gap-1">
                          <PackagePlus className="h-4 w-4" />
                          Add to Inventory
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handlePrint(batch)}>
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

      {/* Confirmation Dialog */}
      <AlertDialog open={confirmDialog.open} onOpenChange={(open) => setConfirmDialog({ open, batch: open ? confirmDialog.batch : null })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Add to Inventory?</AlertDialogTitle>
            <AlertDialogDescription>
              This will add {confirmDialog.batch?.items.length || 0} items from "{confirmDialog.batch?.file_name}" to your inventory and remove them from the import bucket.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmAddToInventory}>Add to Inventory</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ImportExcel;