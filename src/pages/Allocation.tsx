import { useState, useRef, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { FileSpreadsheet, Save, Upload, X, Image as ImageIcon, CheckCircle2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

interface ProductColumn {
  qty: number | string;
  coll: string;
  date: string;
  photoUrl?: string;
  category: string;
  price: string;
  orderedQty?: number;
  totalBoxes?: number;
  color: string;
}

interface StoreRow {
  name: string;
  isHeader?: boolean;
  isSubtotal?: boolean;
  highlight?: 'yellow' | 'green' | 'blue' | 'red';
  allocations: (number | string)[];
}

interface AllocationData {
  products: ProductColumn[];
  stores: StoreRow[];
  headers: string[];
}

type ImportStatus = 'idle' | 'reading' | 'parsing' | 'processing' | 'done';

const Allocation = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [data, setData] = useState<AllocationData | null>(null);
  const [importStatus, setImportStatus] = useState<ImportStatus>('idle');
  const [importProgress, setImportProgress] = useState(0);
  const [importMessage, setImportMessage] = useState('');
  const [showTable, setShowTable] = useState(false);

  const parseExcelData = useCallback((worksheet: XLSX.WorkSheet, range: XLSX.Range) => {
    console.log('Parsing Excel - Range:', range);
    
    // Read all data as a 2D array first
    const rawData: (string | number | undefined)[][] = [];
    
    for (let r = range.s.r; r <= range.e.r; r++) {
      const row: (string | number | undefined)[] = [];
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = worksheet[XLSX.utils.encode_cell({ r, c })];
        row.push(cell?.v);
      }
      rawData.push(row);
    }
    
    console.log('Raw data rows:', rawData.length);
    console.log('First 10 rows:', rawData.slice(0, 10));
    
    // Find key rows by scanning first column
    let qtyRowIdx = -1;
    let collRowIdx = -1;
    let priceRowIdx = -1;
    let colorRowIdx = -1;
    let dataStartRowIdx = -1;
    
    // Scan first column for keywords
    rawData.forEach((row, idx) => {
      const firstCell = row[0]?.toString().toUpperCase().trim() || '';
      if (firstCell === 'QTY') qtyRowIdx = idx;
      if (firstCell === 'COLL') collRowIdx = idx;
      if (firstCell === 'PRICE') priceRowIdx = idx;
      if (firstCell === 'COLOR') colorRowIdx = idx;
    });
    
    console.log('Found rows - QTY:', qtyRowIdx, 'COLL:', collRowIdx, 'PRICE:', priceRowIdx, 'COLOR:', colorRowIdx);
    
    // If COLOR row found, data starts after it
    if (colorRowIdx !== -1) {
      dataStartRowIdx = colorRowIdx + 1;
    } else if (priceRowIdx !== -1) {
      // Try to find where store names start
      for (let i = priceRowIdx + 1; i < rawData.length; i++) {
        const firstCell = rawData[i][0]?.toString().trim() || '';
        if (firstCell && !['QTY', 'COLL', 'PRICE', 'COLOR', 'ORDERED QTY', 'TOTAL BOXES'].includes(firstCell.toUpperCase())) {
          dataStartRowIdx = i;
          break;
        }
      }
    }
    
    // If still not found, try to detect by looking for store-like names
    if (dataStartRowIdx === -1) {
      for (let i = 0; i < rawData.length; i++) {
        const firstCell = rawData[i][0]?.toString().trim() || '';
        if (firstCell.includes('SM ') || firstCell.includes('Metro ') || firstCell.includes('RDS ') || 
            firstCell.includes('Market') || firstCell === 'SM' || firstCell === 'METRO') {
          dataStartRowIdx = i;
          break;
        }
      }
    }
    
    console.log('Data starts at row:', dataStartRowIdx);
    
    // Build headers array (first column labels)
    const headers: string[] = [];
    for (let i = 0; i < dataStartRowIdx; i++) {
      headers.push(rawData[i][0]?.toString() || '');
    }
    
    // Parse product columns (from column 1 onwards)
    const products: ProductColumn[] = [];
    const numCols = rawData[0]?.length || 0;
    
    for (let c = 1; c < numCols; c++) {
      const product: ProductColumn = {
        qty: qtyRowIdx !== -1 ? (rawData[qtyRowIdx][c] ?? '') : '',
        coll: collRowIdx !== -1 ? (rawData[collRowIdx][c]?.toString() ?? '') : '',
        date: '',
        category: '',
        price: priceRowIdx !== -1 ? (rawData[priceRowIdx][c]?.toString() ?? '') : '',
        color: colorRowIdx !== -1 ? (rawData[colorRowIdx][c]?.toString() ?? '') : '',
      };
      
      // Try to find date (usually a row with date format in first column)
      for (let r = 0; r < dataStartRowIdx; r++) {
        const firstCell = rawData[r][0]?.toString() || '';
        if (/^\d{1,2}-[A-Za-z]{3}/.test(firstCell)) {
          product.date = firstCell;
          break;
        }
      }
      
      // Find category row (between date and price, contains R2, R6, NEW, etc.)
      for (let r = 0; r < dataStartRowIdx; r++) {
        const cellVal = rawData[r][c]?.toString().trim() || '';
        if (cellVal.match(/^R\d/) || cellVal === 'NEW' || cellVal.includes('INCMPLTE')) {
          product.category = cellVal;
          break;
        }
      }
      
      products.push(product);
    }
    
    console.log('Parsed products:', products.length, products.slice(0, 3));
    
    // Parse store rows
    const stores: StoreRow[] = [];
    
    if (dataStartRowIdx !== -1) {
      for (let r = dataStartRowIdx; r < rawData.length; r++) {
        const row = rawData[r];
        const storeName = row[0]?.toString().trim() || '';
        
        // Get allocations
        const allocations: (number | string)[] = [];
        for (let c = 1; c < numCols; c++) {
          const val = row[c];
          if (typeof val === 'number') {
            allocations.push(val);
          } else if (val !== undefined && val !== null) {
            allocations.push(val.toString());
          } else {
            allocations.push('');
          }
        }
        
        // Determine highlight and type
        const upperName = storeName.toUpperCase();
        let isHeader = false;
        let isSubtotal = false;
        let highlight: 'yellow' | 'green' | 'blue' | 'red' | undefined;
        
        // Section headers
        if (upperName === 'SM' || upperName === 'METRO' || upperName === 'RDS') {
          isHeader = true;
          if (upperName === 'SM') highlight = 'blue';
          if (upperName === 'METRO') highlight = 'yellow';
        }
        
        // Store highlighting
        if (storeName.startsWith('SM ') || storeName.startsWith('SM-')) {
          highlight = 'blue';
        } else if (storeName.startsWith('Metro ')) {
          if (storeName.includes('Colon')) highlight = 'green';
          else if (storeName.includes('Ayala Cebu')) highlight = 'blue';
          else if (storeName.includes('Market')) highlight = 'yellow';
        }
        
        // Subtotal detection
        if (!storeName && allocations.some(a => typeof a === 'number' && a > 0)) {
          isSubtotal = true;
        }
        
        stores.push({
          name: storeName,
          isHeader,
          isSubtotal,
          highlight,
          allocations,
        });
      }
    }
    
    console.log('Parsed stores:', stores.length, stores.slice(0, 3));
    
    return { products, stores, headers };
  }, []);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setShowTable(false);
    setImportStatus('reading');
    setImportProgress(0);
    setImportMessage('Reading file...');
    
    try {
      // Step 1: Read file
      await new Promise(resolve => setTimeout(resolve, 50));
      setImportProgress(20);
      
      const buffer = await file.arrayBuffer();
      
      // Step 2: Parse workbook
      setImportStatus('parsing');
      setImportProgress(40);
      setImportMessage('Parsing Excel data...');
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
      
      console.log('Workbook loaded, sheet:', sheetName);
      console.log('Range:', worksheet['!ref']);
      
      // Step 3: Process data
      setImportStatus('processing');
      setImportProgress(70);
      setImportMessage('Processing allocations...');
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const parsedData = parseExcelData(worksheet, range);
      
      // Validate parsed data
      if (parsedData.products.length === 0 || parsedData.stores.length === 0) {
        console.warn('No data parsed - products:', parsedData.products.length, 'stores:', parsedData.stores.length);
        toast.error('Could not parse Excel file. Please check the format.');
        setImportStatus('idle');
        return;
      }
      
      // Step 4: Complete
      setImportProgress(100);
      setImportStatus('done');
      setImportMessage('Import complete!');
      
      setData(parsedData);
      
      // Show success briefly then display table
      await new Promise(resolve => setTimeout(resolve, 300));
      setShowTable(true);
      
      toast.success(`Imported ${parsedData.stores.length} stores with ${parsedData.products.length} columns`);
    } catch (error) {
      console.error('Import error:', error);
      toast.error('Failed to import Excel file');
      setImportStatus('idle');
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleClear = () => {
    setData(null);
    setShowTable(false);
    setImportStatus('idle');
    setImportProgress(0);
  };

  const handleAllocationChange = (storeIndex: number, colIndex: number, value: string) => {
    if (!data) return;
    
    const newStores = [...data.stores];
    const numValue = parseInt(value) || 0;
    newStores[storeIndex].allocations[colIndex] = numValue;
    setData({ ...data, stores: newStores });
  };

  const getHighlightClass = (highlight?: string) => {
    switch (highlight) {
      case 'yellow':
        return 'bg-yellow-100';
      case 'green':
        return 'bg-green-100';
      case 'blue':
        return 'bg-blue-100';
      case 'red':
        return 'bg-red-100';
      default:
        return '';
    }
  };

  const getColumnTotal = (colIndex: number) => {
    if (!data) return 0;
    return data.stores.reduce((sum, store) => {
      if (store.isHeader || store.isSubtotal) return sum;
      const val = store.allocations[colIndex];
      return sum + (typeof val === 'number' ? val : parseInt(val?.toString() || '0') || 0);
    }, 0);
  };

  const isLoading = importStatus !== 'idle' && importStatus !== 'done';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Allocation</h1>
          <p className="text-muted-foreground">Import and manage product allocations per store</p>
        </div>
        <div className="flex gap-2">
          <input
            type="file"
            ref={fileInputRef}
            accept=".xlsx,.xls"
            onChange={handleFileUpload}
            className="hidden"
          />
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            {isLoading ? 'Importing...' : 'Import Excel'}
          </Button>
          {data && showTable && (
            <>
              <Button variant="outline" size="sm">
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Export
              </Button>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={handleClear}
              >
                <X className="h-4 w-4 mr-2" />
                Clear
              </Button>
              <Button size="sm">
                <Save className="h-4 w-4 mr-2" />
                Save
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Import Progress */}
      {isLoading && (
        <Card className="animate-in fade-in duration-200">
          <CardContent className="py-8">
            <div className="flex flex-col items-center gap-4">
              <div className="relative">
                <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <Loader2 className="h-8 w-8 text-primary animate-spin" />
                </div>
              </div>
              <div className="text-center space-y-2 w-full max-w-md">
                <p className="font-medium">{importMessage}</p>
                <Progress value={importProgress} className="h-2" />
                <p className="text-sm text-muted-foreground">{importProgress}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Import Complete */}
      {importStatus === 'done' && !showTable && (
        <Card className="animate-in fade-in duration-200">
          <CardContent className="py-8">
            <div className="flex flex-col items-center gap-4">
              <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center animate-in zoom-in duration-300">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </div>
              <p className="font-medium text-green-600">Import complete!</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* No data state */}
      {!data && importStatus === 'idle' && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FileSpreadsheet className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Allocation Data</h3>
            <p className="text-muted-foreground text-center mb-4">
              Import an Excel file to view and edit allocations
            </p>
            <Button onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4 mr-2" />
              Import Excel File
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Allocation Table */}
      {data && data.products.length > 0 && showTable && (
        <Card className="animate-in fade-in slide-in-from-bottom-4 duration-300">
          <CardContent className="p-0">
            <ScrollArea className="w-full h-[calc(100vh-200px)]">
              <div className="min-w-max">
                <table className="w-full border-collapse text-xs">
                  <thead className="sticky top-0 z-20 bg-background">
                    {/* QTY Row */}
                    <tr className="border-b">
                      <th className="border p-1.5 bg-muted/50 text-left font-medium sticky left-0 z-30 min-w-[150px]">QTY</th>
                      {data.products.map((product, idx) => (
                        <th 
                          key={`qty-${idx}`}
                          className={cn(
                            "border p-1.5 text-center font-medium min-w-[50px]",
                            product.qty ? "bg-red-50 text-red-700" : "bg-muted/50"
                          )}
                        >
                          {product.qty || ''}
                        </th>
                      ))}
                    </tr>

                    {/* COLL Row */}
                    <tr className="border-b">
                      <th className="border p-1.5 bg-muted/50 text-left font-medium sticky left-0 z-30">COLL</th>
                      {data.products.map((product, idx) => (
                        <th 
                          key={`coll-${idx}`}
                          className="border p-1.5 bg-muted/50 text-center font-medium text-[10px]"
                        >
                          {product.coll}
                        </th>
                      ))}
                    </tr>

                    {/* Date/Photo Row */}
                    <tr className="border-b h-16">
                      <th className="border p-1.5 bg-muted/50 text-left font-medium sticky left-0 z-30">
                        {data.products[0]?.date || ''}
                      </th>
                      {data.products.map((product, idx) => (
                        <th 
                          key={`photo-${idx}`}
                          className="border p-1 bg-muted/50 text-center"
                        >
                          {product.photoUrl ? (
                            <img 
                              src={product.photoUrl} 
                              alt={product.coll}
                              className="h-12 w-auto mx-auto object-contain"
                            />
                          ) : (
                            <div className="h-12 w-10 mx-auto bg-muted rounded flex items-center justify-center">
                              <ImageIcon className="h-4 w-4 text-muted-foreground" />
                            </div>
                          )}
                        </th>
                      ))}
                    </tr>

                    {/* Category Row */}
                    <tr className="border-b">
                      <th className="border p-1.5 bg-muted/50 text-left font-medium sticky left-0 z-30"></th>
                      {data.products.map((product, idx) => (
                        <th 
                          key={`cat-${idx}`}
                          className={cn(
                            "border p-1.5 text-center font-medium text-[10px]",
                            product.category?.includes('NEW') ? "bg-green-50 text-green-700" : "bg-muted/50"
                          )}
                        >
                          {product.category}
                        </th>
                      ))}
                    </tr>

                    {/* Price Row */}
                    <tr className="border-b">
                      <th className="border p-1.5 bg-muted/50 text-left font-medium sticky left-0 z-30 text-red-600">PRICE</th>
                      {data.products.map((product, idx) => (
                        <th 
                          key={`price-${idx}`}
                          className="border p-1.5 bg-muted/50 text-center font-medium text-red-600"
                        >
                          {product.price}
                        </th>
                      ))}
                    </tr>

                    {/* Color Row */}
                    <tr className="border-b">
                      <th className="border p-1.5 bg-muted/50 text-left font-medium sticky left-0 z-30 text-blue-600">COLOR</th>
                      {data.products.map((product, idx) => (
                        <th 
                          key={`color-${idx}`}
                          className="border p-1.5 bg-muted/50 text-center font-medium text-blue-600"
                        >
                          {product.color}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  {/* Store rows */}
                  <tbody>
                    {data.stores.map((store, storeIdx) => (
                      <tr 
                        key={storeIdx}
                        className={cn(
                          "border-b",
                          getHighlightClass(store.highlight),
                          store.isSubtotal && "bg-muted font-medium"
                        )}
                      >
                        <td className={cn(
                          "border p-1.5 text-left font-medium sticky left-0 z-10",
                          store.isHeader ? "font-bold" : "",
                          getHighlightClass(store.highlight) || "bg-background",
                          store.isSubtotal && "bg-muted"
                        )}>
                          {store.name}
                        </td>
                        {store.allocations.map((val, colIdx) => (
                          <td 
                            key={colIdx}
                            className={cn(
                              "border p-0.5 text-center",
                              getHighlightClass(store.highlight),
                              store.isSubtotal && "bg-muted font-medium"
                            )}
                          >
                            {store.isHeader ? (
                              <span></span>
                            ) : store.isSubtotal ? (
                              <span>{getColumnTotal(colIdx)}</span>
                            ) : (
                              <Input
                                type="number"
                                min="0"
                                value={val === '' ? '' : val}
                                onChange={(e) => handleAllocationChange(storeIdx, colIdx, e.target.value)}
                                className={cn(
                                  "h-6 w-12 text-center mx-auto p-0.5 text-xs border-0",
                                  getHighlightClass(store.highlight) || "bg-transparent"
                                )}
                                placeholder=""
                              />
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ScrollBar orientation="horizontal" />
              <ScrollBar orientation="vertical" />
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default Allocation;
