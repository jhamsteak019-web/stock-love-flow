import { useState, useRef } from 'react';
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useInventory } from '@/hooks/useInventory';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import * as XLSX from 'xlsx';

const ImportExcel = () => {
  const { addItem, addCategory, categories, fetchAll } = useInventory();
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<{ success: number; failed: number; errors: string[] } | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setResults(null);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet) as Record<string, unknown>[];

      let success = 0;
      let failed = 0;
      const errors: string[] = [];

      for (const row of rows) {
        try {
          const itemName = String(row['Item Name'] || row['item_name'] || '');
          const itemCode = String(row['Item Code'] || row['SKU'] || row['item_code'] || '');
          const categoryName = String(row['Category'] || row['category'] || '');
          const totalStock = Number(row['Total Stock'] || row['total_stock'] || 0);
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
          success++;
        } catch (err) {
          failed++;
          errors.push(`Failed to import row: ${String(err)}`);
        }
      }

      setResults({ success, failed, errors });
      await fetchAll();
      toast({ title: 'Import Complete', description: `${success} items imported successfully` });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to read file', variant: 'destructive' });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="rounded-xl border bg-card p-8 shadow-sm text-center">
        <FileSpreadsheet className="h-16 w-16 mx-auto text-primary mb-4" />
        <h2 className="text-xl font-semibold mb-2">Import Inventory from Excel</h2>
        <p className="text-muted-foreground mb-6">Upload .xlsx or .csv file with columns: Item Name, Item Code, Category, Total Stock, Supplier, Date Received</p>
        
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
          <h3 className="font-semibold mb-4">Import Results</h3>
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
