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
  qty: number;
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
    const products: ProductColumn[] = [];
    const stores: StoreRow[] = [];
    
    // Find header rows
    let qtyRow = -1;
    let collRow = -1;
    let dateRow = -1;
    let categoryRow = -1;
    let priceRow = -1;
    let orderedQtyRow = -1;
    let totalBoxesRow = -1;
    let colorRow = -1;
    let dataStartRow = -1;
    
    // Scan for header rows
    for (let r = range.s.r; r <= Math.min(range.e.r, 20); r++) {
      const cellA = worksheet[XLSX.utils.encode_cell({ r, c: 0 })];
      const cellValue = cellA?.v?.toString().toUpperCase().trim() || '';
      
      if (cellValue === 'QTY') qtyRow = r;
      if (cellValue === 'COLL') collRow = r;
      if (cellValue.includes('DATE') || /^\d{1,2}-[A-Za-z]{3}$/.test(cellA?.v?.toString() || '')) {
        if (dateRow === -1) dateRow = r;
      }
      if (cellValue === 'PRICE') priceRow = r;
      if (cellValue === 'ORDERED QTY') orderedQtyRow = r;
      if (cellValue === 'TOTAL BOXES') totalBoxesRow = r;
      if (cellValue === 'COLOR') colorRow = r;
    }
    
    if (colorRow !== -1) {
      dataStartRow = colorRow + 1;
    }
    
    // Find category row
    if (priceRow !== -1) {
      for (let r = priceRow - 1; r >= 0; r--) {
        const cellA = worksheet[XLSX.utils.encode_cell({ r, c: 0 })];
        const cellValue = cellA?.v?.toString().toUpperCase().trim() || '';
        if (cellValue !== '' && cellValue !== 'QTY' && cellValue !== 'COLL') {
          continue;
        }
        for (let c = 1; c <= range.e.c; c++) {
          const cell = worksheet[XLSX.utils.encode_cell({ r, c })];
          const val = cell?.v?.toString().trim() || '';
          if (val && (val.match(/^R\d/) || val === 'NEW' || val.includes('INCMPLTE'))) {
            categoryRow = r;
            break;
          }
        }
        if (categoryRow !== -1) break;
      }
    }
    
    // Parse products from columns
    const startCol = 1;
    
    for (let c = startCol; c <= range.e.c; c++) {
      const qtyCell = qtyRow !== -1 ? worksheet[XLSX.utils.encode_cell({ r: qtyRow, c })] : null;
      const collCell = collRow !== -1 ? worksheet[XLSX.utils.encode_cell({ r: collRow, c })] : null;
      const priceCell = priceRow !== -1 ? worksheet[XLSX.utils.encode_cell({ r: priceRow, c })] : null;
      const colorCell = colorRow !== -1 ? worksheet[XLSX.utils.encode_cell({ r: colorRow, c })] : null;
      const categoryCell = categoryRow !== -1 ? worksheet[XLSX.utils.encode_cell({ r: categoryRow, c })] : null;
      const orderedQtyCell = orderedQtyRow !== -1 ? worksheet[XLSX.utils.encode_cell({ r: orderedQtyRow, c })] : null;
      const totalBoxesCell = totalBoxesRow !== -1 ? worksheet[XLSX.utils.encode_cell({ r: totalBoxesRow, c })] : null;
      
      let dateValue = '';
      if (dateRow !== -1) {
        const dateCell = worksheet[XLSX.utils.encode_cell({ r: dateRow, c })];
        dateValue = dateCell?.v?.toString() || '';
      } else {
        for (let r = 0; r <= 5; r++) {
          const cell = worksheet[XLSX.utils.encode_cell({ r, c: 0 })];
          const val = cell?.v?.toString() || '';
          if (/^\d{1,2}-[A-Za-z]{3}$/.test(val)) {
            dateValue = val;
            break;
          }
        }
      }
      
      products.push({
        qty: parseInt(qtyCell?.v?.toString() || '0') || 0,
        coll: collCell?.v?.toString() || '',
        date: dateValue,
        category: categoryCell?.v?.toString() || '',
        price: priceCell?.v?.toString() || '',
        orderedQty: parseInt(orderedQtyCell?.v?.toString() || '0') || undefined,
        totalBoxes: parseInt(totalBoxesCell?.v?.toString() || '0') || undefined,
        color: colorCell?.v?.toString() || '',
      });
    }
    
    // Parse store rows
    if (dataStartRow !== -1) {
      for (let r = dataStartRow; r <= range.e.r; r++) {
        const storeCell = worksheet[XLSX.utils.encode_cell({ r, c: 0 })];
        const storeName = storeCell?.v?.toString() || '';
        
        if (!storeName && r === dataStartRow) continue;
        
        const allocations: (number | string)[] = [];
        for (let c = startCol; c <= range.e.c; c++) {
          const cell = worksheet[XLSX.utils.encode_cell({ r, c })];
          const val = cell?.v;
          if (typeof val === 'number') {
            allocations.push(val);
          } else if (val !== undefined && val !== null) {
            allocations.push(val.toString());
          } else {
            allocations.push('');
          }
        }
        
        const upperName = storeName.toUpperCase();
        let isHeader = false;
        let isSubtotal = false;
        let highlight: 'yellow' | 'green' | 'blue' | 'red' | undefined;
        
        if (upperName === 'SM' || upperName === 'METRO' || upperName === 'RDS') {
          isHeader = true;
          if (upperName === 'SM') highlight = 'blue';
          if (upperName === 'METRO') highlight = 'yellow';
        }
        
        if (storeName.startsWith('SM ') || storeName.startsWith('SM-')) {
          highlight = 'blue';
        } else if (storeName.startsWith('Metro ')) {
          if (storeName.includes('Colon')) highlight = 'green';
          else if (storeName.includes('Ayala Cebu')) highlight = 'blue';
          else if (storeName.includes('Market')) highlight = 'yellow';
        }
        
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
    
    return { products, stores };
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
      await new Promise(resolve => setTimeout(resolve, 100));
      setImportProgress(20);
      
      const buffer = await file.arrayBuffer();
      
      // Step 2: Parse workbook
      setImportStatus('parsing');
      setImportProgress(40);
      setImportMessage('Parsing Excel data...');
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
      
      // Step 3: Process data
      setImportStatus('processing');
      setImportProgress(70);
      setImportMessage('Processing allocations...');
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const parsedData = parseExcelData(worksheet, range);
      
      // Step 4: Complete
      setImportProgress(100);
      setImportStatus('done');
      setImportMessage('Import complete!');
      
      setData(parsedData);
      
      // Show success briefly then display table
      await new Promise(resolve => setTimeout(resolve, 500));
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
                            product.qty > 0 ? "bg-red-50 text-red-700" : "bg-muted/50"
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

                    {/* Ordered QTY Row (if exists) */}
                    {data.products.some(p => p.orderedQty) && (
                      <tr className="border-b">
                        <th className="border p-1.5 bg-muted/50 text-left font-medium sticky left-0 z-30">ORDERED QTY</th>
                        {data.products.map((product, idx) => (
                          <th 
                            key={`oqty-${idx}`}
                            className="border p-1.5 bg-muted/50 text-center font-medium"
                          >
                            {product.orderedQty || ''}
                          </th>
                        ))}
                      </tr>
                    )}

                    {/* Total Boxes Row (if exists) */}
                    {data.products.some(p => p.totalBoxes) && (
                      <tr className="border-b">
                        <th className="border p-1.5 bg-muted/50 text-left font-medium sticky left-0 z-30">TOTAL BOXES</th>
                        {data.products.map((product, idx) => (
                          <th 
                            key={`tbox-${idx}`}
                            className="border p-1.5 bg-muted/50 text-center font-medium"
                          >
                            {product.totalBoxes || ''}
                          </th>
                        ))}
                      </tr>
                    )}

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
