import { useState, useRef, useMemo, useEffect, useCallback, useTransition, memo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { PackagePlus, Plus, Trash2, FileText, Upload, FileSpreadsheet, Search, CalendarIcon, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useInventory } from '@/hooks/useInventory';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { useToast } from '@/hooks/use-toast';
import { useDebounce } from '@/hooks/useDebounce';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import ColumnSettings, { ColumnConfig, ColumnKey } from '@/components/deliveries/ColumnSettings';
import { useColumnSettings } from '@/hooks/useColumnSettings';
import { useActivityLog } from '@/hooks/useActivityLog';

const DEFAULT_RELEASE_COLUMNS: ColumnConfig[] = [
  { key: 'allocation' as ColumnKey, label: 'Allocation Bill', visible: true, width: 130, minWidth: 80, maxWidth: 200 },
  { key: 'destination' as ColumnKey, label: 'Destination', visible: true, width: 130, minWidth: 80, maxWidth: 200 },
  { key: 'category' as ColumnKey, label: 'Category', visible: true, width: 110, minWidth: 60, maxWidth: 150 },
  { key: 'totalBoxes' as ColumnKey, label: 'Boxes', visible: true, width: 80, minWidth: 60, maxWidth: 120 },
  { key: 'amount' as ColumnKey, label: 'Amount', visible: true, width: 100, minWidth: 60, maxWidth: 150 },
  { key: 'totalQty' as ColumnKey, label: 'Qty/Item', visible: true, width: 80, minWidth: 60, maxWidth: 120 },
  { key: 'remarks' as ColumnKey, label: 'Remarks', visible: true, width: 130, minWidth: 80, maxWidth: 200 },
  { key: 'dateOut' as ColumnKey, label: 'Date Out Warehouse', visible: true, width: 130, minWidth: 100, maxWidth: 200 },
];

const ITEMS_PER_PAGE = 15;

interface ParsedReleaseItem {
  id: string;
  sheetNo: string;
  deliverTo: string;
  qtyBoxes: number;
  amount: number;
  qtyItem: number;
  remarks: string;
  category: string;
  billDate: string;
  setDate: string;
  courier: string;
  matchedItemId: string | null;
  matchedItemName: string | null;
}

interface ReleaseItem {
  id: string;
  itemId: string;
  boxes: number;
}


const ReleaseStock = () => {
  const { items, releases, releaseStockBatch, fetchReleases, loading } = useInventory();
  const isReleasingRef = useRef(false);
  const { user, userRole } = useAuth();
  const { selectedBranch } = useBranch();
  const { toast } = useToast();
  const { logActivity } = useActivityLog();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef2 = useRef<HTMLInputElement>(null);
  const { columns, setColumns, isAdmin } = useColumnSettings('releaseStock', DEFAULT_RELEASE_COLUMNS);
  
  const isColumnVisible = (key: string) => {
    const col = columns.find(c => c.key === key);
    return col?.visible ?? true;
  };
  
  const [submitting, setSubmitting] = useState(false);
  
  
  // Import Excel state - initialize from localStorage
  const [importing, setImporting] = useState(false);
  const [parsedItems, setParsedItems] = useState<ParsedReleaseItem[]>(() => {
    const saved = localStorage.getItem('releaseStock_parsedItems');
    return saved ? JSON.parse(saved) : [];
  });
  const [showImportPreview, setShowImportPreview] = useState(() => {
    const saved = localStorage.getItem('releaseStock_parsedItems');
    return saved ? JSON.parse(saved).length > 0 : false;
  });
  const [importCourier, setImportCourier] = useState('');
  const [importCategory, setImportCategory] = useState('');
  const [importWaybillNo, setImportWaybillNo] = useState('');
  const [importSetDate, setImportSetDate] = useState<Date | undefined>(undefined);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [sheetNoSearch, setSheetNoSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [isPending, startTransition] = useTransition();
  
  // Debounced search for smooth typing
  const debouncedSearch = useDebounce(sheetNoSearch, 350);

  // Persist parsedItems to localStorage
  useEffect(() => {
    if (parsedItems.length > 0) {
      localStorage.setItem('releaseStock_parsedItems', JSON.stringify(parsedItems));
    } else {
      localStorage.removeItem('releaseStock_parsedItems');
    }
  }, [parsedItems]);

  // Excel Import Functions
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

  const findNumericValueNullable = (row: Record<string, unknown>, ...possibleNames: string[]): number | null => {
    const val = findColumnValue(row, ...possibleNames);
    if (val === '') return null;
    const cleanVal = val.replace(/[₱$,]/g, '').trim();
    const num = Number(cleanVal);
    return isNaN(num) ? null : num;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setImporting(true);
    // Don't clear existing items - we'll append to them

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

      // Log the column names from the first row for debugging
      if (rows.length > 0) {
        console.log('Excel column names detected:', Object.keys(rows[0]));
      }

      // Parse rows into release items - Format: Sheet No., Deliver To, BOX, Qty, Remarks, BILL DATE
      const parsed: ParsedReleaseItem[] = rows.map((row, index) => {
        // Log each row for debugging if index is 0
        if (index === 0) {
          console.log('First row data:', row);
        }
        
        const sheetNo = findColumnValue(row, 'Sheet No.', 'Sheet No', 'SHEET NO', 'Sheet', 'SheetNo', 'Item Code', 'ItemCode', 'Code', 'Allocation Bill', 'Bill', 'BILL');
        const deliverTo = findColumnValue(row, 'Supplier', 'SUPPLIER', 'Deliver To', 'DeliverTo', 'DELIVER TO', 'Deliver_To', 'DELIVER_TO', 'Destination', 'DESTINATION', 'Branch', 'BRANCH', 'Store', 'STORE', 'To Branch', 'TO BRANCH', 'Ship To', 'SHIP TO', 'Location', 'LOCATION', 'Deliver', 'DELIVER');
        const qtyBoxes = 1; // Default to 1 box when importing
        const qtyItem = findNumericValue(row, 'Qty', 'Qty/Item', 'QTY/ITEM', 'Qty Item', 'QtyItem', 'Quantity', 'QTY');
        const category = findColumnValue(row, 'Category', 'CATEGORY', 'Cat', 'CAT', 'Type', 'TYPE');
        const rem = findColumnValue(row, 'Remarks', 'REMARKS', 'Notes', 'NOTES', 'Remark', 'REMARK', 'Comment', 'COMMENT');
        const amountVal = findNumericValue(row, 'Amount', 'AMOUNT', 'Amt', 'AMT', 'Total', 'TOTAL', 'Price', 'PRICE');
        
        // Log parsed values for first row
        if (index === 0) {
          console.log('Parsed first row - sheetNo:', sheetNo, 'deliverTo:', deliverTo, 'category:', category, 'remarks:', rem);
        }
        
        // Parse BILL DATE - keep as string for manual input
        let billDateStr = '';
        const billDateKeys = ['BILL DATE', 'Bill Date', 'Set Date', 'SET DATE', 'Date', 'DATE'];
        for (const key of billDateKeys) {
          const val = row[key];
          if (val !== undefined && val !== null && val !== '') {
            if (val instanceof Date) {
              // Format as readable date string
              billDateStr = format(val, 'MM/dd/yyyy');
            } else if (typeof val === 'string') {
              billDateStr = val;
            } else if (typeof val === 'number') {
              // Excel serial date number
              const excelDate = new Date((val - 25569) * 86400 * 1000);
              if (!isNaN(excelDate.getTime())) {
                billDateStr = format(excelDate, 'MM/dd/yyyy');
              }
            }
            if (billDateStr) break;
          }
        }

        // Try to match with inventory item by item_code or item_name
        const matchedItem = items.find(i => 
          i.item_code?.toLowerCase() === sheetNo.toLowerCase() ||
          i.item_name?.toLowerCase() === sheetNo.toLowerCase() ||
          i.item_code?.toLowerCase().includes(sheetNo.toLowerCase()) ||
          i.item_name?.toLowerCase().includes(sheetNo.toLowerCase())
        );

        return {
          id: `parsed-${index}-${Date.now()}`,
          sheetNo,
          deliverTo,
          qtyBoxes,
          amount: amountVal,
          qtyItem,
          category,
          remarks: rem,
          billDate: billDateStr,
          setDate: '',
          courier: '',
          matchedItemId: matchedItem?.id || null,
          matchedItemName: matchedItem?.item_name || null,
        };
      }).filter(item => item.sheetNo || item.deliverTo);

      // Filter out items that already exist as allocation bills in releases
      const existingBills = new Set(
        releases
          .filter(r => r.allocation_bill)
          .map(r => r.allocation_bill!.toLowerCase().trim())
      );
      
      const filteredParsed = parsed.filter(item => {
        if (!item.sheetNo) return true; // Keep items without sheetNo
        return !existingBills.has(item.sheetNo.toLowerCase().trim());
      });
      
      const skippedCount = parsed.length - filteredParsed.length;

      if (filteredParsed.length === 0) {
        if (skippedCount > 0) {
          toast({ title: 'All Items Already Released', description: `${skippedCount} item(s) already exist in deliveries and were skipped.`, variant: 'default' });
        } else {
          toast({ title: 'No Items Found', description: 'Check column headers (Sheet No., Deliver To, BOX, Qty, Remarks, BILL DATE).', variant: 'destructive' });
        }
        setImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      // Append new items to existing ones instead of replacing
      setParsedItems(prev => [...prev, ...filteredParsed]);
      setShowImportPreview(true);
      
      const message = skippedCount > 0 
        ? `${filteredParsed.length} items added (${skippedCount} already released and skipped). Total: ${parsedItems.length + filteredParsed.length} items.`
        : `${filteredParsed.length} items added. Total: ${parsedItems.length + filteredParsed.length} items.`;
      toast({ title: 'File Parsed', description: message });
    } catch (error) {
      console.error('Excel parse error:', error);
      toast({ title: 'Error', description: 'Failed to parse file.', variant: 'destructive' });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleConfirmImport = async () => {
    // Prevent double-click / rapid re-submission
    if (isReleasingRef.current) {
      toast({ title: 'Please wait', description: 'Release is already in progress...', variant: 'default' });
      return;
    }

    // Allow boxes >= 0 (0 is valid for import releases)
    const validItems = parsedItems.filter(p => p.qtyBoxes >= 0 && selectedItems.has(p.id) && p.courier && p.setDate);
    
    if (validItems.length === 0) {
      toast({ title: 'Error', description: 'No selected items to release. Ensure items have Courier and Set Date.', variant: 'destructive' });
      return;
    }

    // Allow duplicate Sheet No. — additional rows become extra products under the same allocation bill
    setSubmitting(true);
    isReleasingRef.current = true;

    try {
      const firstItem = validItems[0];

      for (const item of validItems) {
        await releaseStockBatch(
          [{ itemId: item.matchedItemId || '', boxes: item.qtyBoxes }],
          item.deliverTo || 'Unknown',
          user!.id,
          item.remarks || undefined,
          firstItem.courier,
          item.sheetNo || undefined,
          item.category || undefined,
          undefined,
          firstItem.setDate || undefined,
          item.qtyItem || item.qtyBoxes,
          selectedBranch?.id || undefined,
          item.amount || undefined
        );
      }

      // Remove released items from preview
      const releasedIds = new Set(validItems.map(i => i.id));
      setParsedItems(prev => prev.filter(p => !releasedIds.has(p.id)));
      setSelectedItems(new Set());
      
      if (parsedItems.length - validItems.length === 0) {
        setShowImportPreview(false);
      }

      // Refresh releases state to keep duplicate checks accurate
      await fetchReleases();

      await logActivity({
        actionType: 'import',
        module: 'stock_releases',
        description: `Imported ${validItems.length} delivery item(s) via Excel`,
        metadata: {
          items_count: validItems.length,
          courier: firstItem.courier,
          branch: selectedBranch?.name,
          allocation_bills: validItems.map(i => i.sheetNo).filter(Boolean)
        }
      });

      toast({ title: 'Success', description: `${validItems.length} item(s) released successfully` });
    } catch (error) {
      console.error('Release error:', error);
      toast({ title: 'Error', description: 'Failed to release stock from import', variant: 'destructive' });
    } finally {
      setSubmitting(false);
      isReleasingRef.current = false;
    }
  };

  // Bulk update function - when user changes amount/setDate/courier on any checked item, apply to all checked items
  const updateParsedItemWithBulk = (id: string, field: keyof ParsedReleaseItem, value: string | number) => {
    const isChecked = selectedItems.has(id);
    const isBulkField = field === 'amount' || field === 'setDate' || field === 'courier';
    
    if (isChecked && isBulkField && selectedItems.size > 1) {
      // Apply to all checked items
      setParsedItems(prev => prev.map(item => {
        if (selectedItems.has(item.id)) {
          return { ...item, [field]: value };
        }
        return item;
      }));
    } else {
      // Apply only to the single item
      updateParsedItem(id, field, value);
    }
  };

  const cancelImport = () => {
    setParsedItems([]);
    setShowImportPreview(false);
    setImportCourier('');
    setImportCategory('');
    setImportWaybillNo('');
    setImportSetDate(undefined);
    setSelectedItems(new Set());
    setSheetNoSearch('');
    setCurrentPage(1);
  };

  // Filter parsed items by sheet no or destination search - use debounced value
  // Also sort checked items to the top
  const filteredParsedItems = useMemo(() => {
    let filtered = parsedItems;
    
    if (debouncedSearch.trim()) {
      const searchLower = debouncedSearch.toLowerCase();
      filtered = parsedItems.filter(item => 
        item.sheetNo.toLowerCase().includes(searchLower) ||
        item.deliverTo.toLowerCase().includes(searchLower) ||
        item.category.toLowerCase().includes(searchLower) ||
        item.remarks.toLowerCase().includes(searchLower)
      );
    }
    
    // Sort checked items to the top
    return [...filtered].sort((a, b) => {
      const aChecked = selectedItems.has(a.id);
      const bChecked = selectedItems.has(b.id);
      if (aChecked && !bChecked) return -1;
      if (!aChecked && bChecked) return 1;
      return 0;
    });
  }, [parsedItems, debouncedSearch, selectedItems]);

  // Pagination for filtered items
  const totalPages = Math.ceil(filteredParsedItems.length / ITEMS_PER_PAGE);
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredParsedItems.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredParsedItems, currentPage]);

  // Reset page when search changes
  const handleSearchChange = useCallback((value: string) => {
    setSheetNoSearch(value);
    startTransition(() => {
      setCurrentPage(1);
    });
  }, []);

  const goToPage = useCallback((page: number) => {
    startTransition(() => {
      setCurrentPage(Math.max(1, Math.min(page, totalPages)));
    });
  }, [totalPages]);

  // Checkbox handlers - enable checkboxes when courier AND set date are set for item
  const selectableItems = filteredParsedItems.filter(p => p.qtyBoxes > 0 && p.courier && p.setDate);
  const matchedItems = filteredParsedItems.filter(p => p.matchedItemId && p.qtyBoxes > 0);
  const allSelectableSelected = selectableItems.length > 0 && selectableItems.every(p => selectedItems.has(p.id));
  const someMatchedSelected = selectableItems.some(p => selectedItems.has(p.id));

  const toggleSelectAll = () => {
    if (allSelectableSelected) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(selectableItems.map(p => p.id)));
    }
  };

  const toggleSelectItem = (id: string) => {
    const newSet = new Set(selectedItems);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedItems(newSet);
  };

  // Edit parsed item function
  const updateParsedItem = (id: string, field: keyof ParsedReleaseItem, value: string | number) => {
    setParsedItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      
      const updated = { ...item, [field]: value };
      
      // If sheetNo changed, try to re-match with inventory
      if (field === 'sheetNo') {
        const sheetNo = String(value);
        const matchedItem = items.find(i => 
          i.item_code?.toLowerCase() === sheetNo.toLowerCase() ||
          i.item_name?.toLowerCase() === sheetNo.toLowerCase() ||
          i.item_code?.toLowerCase().includes(sheetNo.toLowerCase()) ||
          i.item_name?.toLowerCase().includes(sheetNo.toLowerCase())
        );
        updated.matchedItemId = matchedItem?.id || null;
        updated.matchedItemName = matchedItem?.item_name || null;
      }
      
      return updated;
    }));
  };


  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;
  }

  // Second importer: same preview flow as the first (Out Warehouse Delivery).
  // Headers: Sheet No., Branch, Product Name, Category, Product Description, Qty, Price
  const handleFileUpload2 = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setImporting(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, unknown>[];
      if (rows.length === 0) {
        toast({ title: 'Empty file', description: 'No rows found.', variant: 'destructive' });
        return;
      }

      const parsed: ParsedReleaseItem[] = rows.map((row, index) => {
        const sheetNo = findColumnValue(row, 'Sheet No.', 'Sheet No', 'SHEET NO', 'Sheet');
        const branch = findColumnValue(row, 'Branch', 'BRANCH');
        const productName = findColumnValue(row, 'Product Name', 'PRODUCT NAME', 'Product');
        const category = findColumnValue(row, 'Category', 'CATEGORY');
        const description = findColumnValue(row, 'Product Description', 'PRODUCT DESCRIPTION', 'Description', 'DESCRIPTION');
        const qty = findNumericValue(row, 'Qty', 'QTY', 'Quantity');
        const price = findNumericValue(row, 'Price', 'PRICE', 'Amount');
        const remarks = [productName, description].filter(Boolean).join(' - ');
        return {
          id: `parsed2-${index}-${Date.now()}`,
          sheetNo,
          deliverTo: branch,
          qtyBoxes: 1,
          amount: price,
          qtyItem: qty,
          category,
          remarks,
          billDate: '',
          setDate: '',
          courier: '',
          matchedItemId: null,
          matchedItemName: null,
        };
      }).filter(p => p.sheetNo || p.deliverTo || p.remarks);

      if (parsed.length === 0) {
        toast({ title: 'No items', description: 'Check headers: Sheet No., Branch, Product Name, Category, Product Description, Qty, Price.', variant: 'destructive' });
        return;
      }

      // Allow duplicates: same Sheet No. = additional products under the same allocation bill
      setParsedItems(prev => [...prev, ...parsed]);
      setShowImportPreview(true);
      toast({ title: 'File Parsed', description: `${parsed.length} item(s) added to preview. I-set ang Courier at Date Out, then Confirm Release.` });
    } catch (err) {
      console.error(err);
      toast({ title: 'Error', description: 'Failed to parse file.', variant: 'destructive' });
    } finally {
      setImporting(false);
      if (fileInputRef2.current) fileInputRef2.current.value = '';
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Import Excel #2 — Direct to History (pending Yes/No) */}
      <div className="rounded-xl border bg-card p-6 shadow-sm animate-fade-in">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold select-none">Import from Excel (Direct to History)</h2>
              <p className="text-sm text-muted-foreground select-none">Headers: Sheet No., Branch, Product Name, Category, Product Description, Qty, Price</p>
            </div>
          </div>
          <div>
            <input
              ref={fileInputRef2}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileUpload2}
              className="hidden"
            />
            <Button variant="outline" onClick={() => fileInputRef2.current?.click()} disabled={importing}>
              <Upload className="h-4 w-4 mr-2" />
              {importing ? 'Importing...' : 'Upload File'}
            </Button>
          </div>
        </div>
      </div>

      {/* Import Excel Section */}
      <div className="rounded-xl border bg-card p-6 shadow-sm animate-fade-in">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold select-none">Import from Excel</h2>
              <p className="text-sm text-muted-foreground select-none">Upload Excel with: Sheet No., Deliver To, BOX, Qty, Remarks, BILL DATE</p>
            </div>
          </div>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileUpload}
              className="hidden"
            />
            <Button 
              variant="outline" 
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
            >
              <Upload className="h-4 w-4 mr-2" />
              {importing ? 'Importing...' : 'Upload File'}
            </Button>
          </div>
        </div>

        {/* Import Preview */}
        {showImportPreview && parsedItems.length > 0 && (
          <div className="space-y-4 mt-4 pt-4 border-t">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">
                  {filteredParsedItems.length} of {parsedItems.length} items
                </p>
                {isPending && (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                )}
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search..."
                    value={sheetNoSearch}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    className="h-8 w-[160px] pl-8 pr-8 text-sm"
                  />
                  {sheetNoSearch && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-1/2 -translate-y-1/2 h-7 w-7"
                      onClick={() => handleSearchChange('')}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
                {isAdmin && <ColumnSettings columns={columns} onColumnChange={setColumns} defaultColumns={DEFAULT_RELEASE_COLUMNS} />}
                <Button variant="outline" size="sm" onClick={cancelImport}>
                  Cancel
                </Button>
              </div>
            </div>
            <div className="rounded-lg border overflow-hidden">
              <div className="max-h-[400px] overflow-y-auto overflow-x-scroll scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
                <Table className="min-w-[1200px]">
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead className="w-10 px-5">
                        <Checkbox 
                          checked={allSelectableSelected}
                          onCheckedChange={toggleSelectAll}
                          aria-label="Select all"
                        />
                      </TableHead>
                      {isColumnVisible('allocation') && <TableHead className="px-5 whitespace-nowrap">Allocation Bill</TableHead>}
                      {isColumnVisible('destination') && <TableHead className="px-5 whitespace-nowrap">Destination</TableHead>}
                      {isColumnVisible('category') && <TableHead className="px-5 whitespace-nowrap">Category</TableHead>}
                      {isColumnVisible('totalBoxes') && <TableHead className="w-[80px] px-5 whitespace-nowrap">Boxes</TableHead>}
                      {isColumnVisible('amount') && <TableHead className="w-[100px] px-5 whitespace-nowrap">Amount</TableHead>}
                      {isColumnVisible('totalQty') && <TableHead className="w-[80px] px-5 whitespace-nowrap">Qty/Item</TableHead>}
                      {isColumnVisible('remarks') && <TableHead className="px-5 whitespace-nowrap">Remarks</TableHead>}
                      {isColumnVisible('dateOut') && <TableHead className="px-5 whitespace-nowrap">Date Out</TableHead>}
                      <TableHead className="px-5 whitespace-nowrap">Courier</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                          {debouncedSearch ? 'No matching items found' : 'No items'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedItems.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="px-5">
                            <Checkbox
                              checked={selectedItems.has(item.id)}
                              onCheckedChange={() => toggleSelectItem(item.id)}
                              disabled={item.qtyBoxes <= 0}
                              aria-label={`Select ${item.sheetNo}`}
                            />
                          </TableCell>
                          {isColumnVisible('allocation') && (
                            <TableCell className="px-5">
                              <Input 
                                defaultValue={item.sheetNo}
                                onBlur={(e) => {
                                  if (e.target.value !== item.sheetNo) {
                                    updateParsedItem(item.id, 'sheetNo', e.target.value);
                                  }
                                }}
                                className="h-8 text-xs font-mono min-w-[130px] px-3 rounded-lg"
                                placeholder="Allocation Bill"
                              />
                            </TableCell>
                          )}
                          {isColumnVisible('destination') && (
                            <TableCell className="px-5">
                              <Input 
                                defaultValue={item.deliverTo}
                                onBlur={(e) => {
                                  if (e.target.value !== item.deliverTo) {
                                    updateParsedItem(item.id, 'deliverTo', e.target.value);
                                  }
                                }}
                                className="h-8 text-xs min-w-[140px] px-3 rounded-lg"
                                placeholder="Destination"
                              />
                            </TableCell>
                          )}
                          {isColumnVisible('category') && (
                            <TableCell className="px-5">
                              <Input 
                                defaultValue={item.category}
                                onBlur={(e) => {
                                  if (e.target.value !== item.category) {
                                    updateParsedItem(item.id, 'category', e.target.value);
                                  }
                                }}
                                className="h-8 text-xs min-w-[100px] px-3 rounded-lg"
                                placeholder="Category"
                              />
                            </TableCell>
                          )}
                          {isColumnVisible('totalBoxes') && (
                            <TableCell className="px-5">
                              <Input 
                                type="number"
                                defaultValue={item.qtyBoxes}
                                onBlur={(e) => {
                                  const val = parseInt(e.target.value) || 0;
                                  if (val !== item.qtyBoxes) {
                                    updateParsedItem(item.id, 'qtyBoxes', val);
                                  }
                                }}
                                className="h-7 text-xs w-[60px] px-2 rounded"
                                min={0}
                              />
                            </TableCell>
                          )}
                          {isColumnVisible('amount') && (
                            <TableCell className="px-5">
                              <Input 
                                type="number"
                                defaultValue={item.amount || 0}
                                onBlur={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  if (val !== item.amount) {
                                    updateParsedItemWithBulk(item.id, 'amount', val);
                                  }
                                }}
                                className="h-7 text-xs w-[80px] px-2 rounded"
                                min={0}
                                step="0.01"
                                placeholder="Amount"
                              />
                            </TableCell>
                          )}
                          {isColumnVisible('totalQty') && (
                            <TableCell className="px-5">
                              <Input 
                                type="number"
                                defaultValue={item.qtyItem}
                                onBlur={(e) => {
                                  const val = parseInt(e.target.value) || 0;
                                  if (val !== item.qtyItem) {
                                    updateParsedItem(item.id, 'qtyItem', val);
                                  }
                                }}
                                className="h-7 text-xs w-[60px] px-2 rounded"
                                min={0}
                              />
                            </TableCell>
                          )}
                          {isColumnVisible('remarks') && (
                            <TableCell className="px-5">
                              <Input 
                                defaultValue={item.remarks}
                                onBlur={(e) => {
                                  if (e.target.value !== item.remarks) {
                                    updateParsedItem(item.id, 'remarks', e.target.value);
                                  }
                                }}
                                className="h-8 text-xs min-w-[120px] px-3 rounded-lg"
                                placeholder="Remarks"
                              />
                            </TableCell>
                          )}
                          {isColumnVisible('dateOut') && (
                            <TableCell className="px-5">
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button variant="outline" className="h-8 text-xs w-[110px] justify-start px-3 rounded-lg">
                                    <CalendarIcon className="mr-1 h-3 w-3" />
                                    {item.setDate ? format(new Date(item.setDate), 'MMM d') : 'Date'}
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                  <Calendar
                                    mode="single"
                                    selected={item.setDate ? new Date(item.setDate) : undefined}
                                    onSelect={(date) => updateParsedItemWithBulk(item.id, 'setDate', date?.toISOString() || '')}
                                    initialFocus
                                    className={cn("p-3 pointer-events-auto")}
                                  />
                                </PopoverContent>
                              </Popover>
                            </TableCell>
                          )}
                          <TableCell className="px-5">
                            <Select value={item.courier} onValueChange={(val) => updateParsedItemWithBulk(item.id, 'courier', val)}>
                              <SelectTrigger className="h-8 text-xs w-[130px] px-3 rounded-lg">
                                <SelectValue placeholder="Courier" />
                              </SelectTrigger>
                              <SelectContent className="bg-popover">
                                <SelectItem value="AP CARGO">AP CARGO</SelectItem>
                                <SelectItem value="SOUTHSEA">SOUTHSEA</SelectItem>
                                <SelectItem value="AIRSPEED">AIRSPEED</SelectItem>
                                <SelectItem value="FAST CARGO">FAST CARGO</SelectItem>
                                <SelectItem value="JUNIX TRACKING">JUNIX TRACKING</SelectItem>
                                <SelectItem value="RDS DC">RDS DC</SelectItem>
                                <SelectItem value="SC DEC TO SM DC">SC DEC TO SM DC</SelectItem>
                                <SelectItem value="SM DC">SM DC</SelectItem>
                                <SelectItem value="PRIETO">PRIETO</SelectItem>
                                <SelectItem value="DIRECT">DIRECT</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-2">
                <div className="text-sm text-muted-foreground">
                  Page {currentPage} of {totalPages} ({filteredParsedItems.length} items)
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => goToPage(currentPage - 1)}
                    disabled={currentPage === 1 || isPending}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Prev
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => goToPage(currentPage + 1)}
                    disabled={currentPage === totalPages || isPending}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
            
            <div className="flex justify-end pt-2 border-t">
              <Button 
                onClick={handleConfirmImport}
                disabled={submitting || selectedItems.size === 0}
                className="min-w-[140px]"
              >
                {submitting ? 'Releasing...' : `Release ${selectedItems.size} Items`}
              </Button>
            </div>
          </div>
        )}
      </div>

    </div>
  );
};

export default ReleaseStock;
