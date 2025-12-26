import { useState, useRef, useMemo, useEffect, useCallback, useTransition, memo } from 'react';
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
import { useToast } from '@/hooks/use-toast';
import { useDebounce } from '@/hooks/useDebounce';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import ColumnSettings, { ColumnConfig, ColumnKey } from '@/components/deliveries/ColumnSettings';
import { useColumnSettings } from '@/hooks/useColumnSettings';

const DEFAULT_RELEASE_COLUMNS: ColumnConfig[] = [
  { key: 'allocation' as ColumnKey, label: 'Allocation Bill', visible: true, width: 130, minWidth: 80, maxWidth: 200 },
  { key: 'destination' as ColumnKey, label: 'Destination', visible: true, width: 130, minWidth: 80, maxWidth: 200 },
  { key: 'category' as ColumnKey, label: 'Category', visible: true, width: 110, minWidth: 60, maxWidth: 150 },
  { key: 'totalBoxes' as ColumnKey, label: 'Boxes', visible: true, width: 80, minWidth: 60, maxWidth: 120 },
  { key: 'totalQty' as ColumnKey, label: 'Qty/Item', visible: true, width: 80, minWidth: 60, maxWidth: 120 },
  { key: 'remarks' as ColumnKey, label: 'Remarks', visible: true, width: 130, minWidth: 80, maxWidth: 200 },
  { key: 'waybill' as ColumnKey, label: 'Waybill No.', visible: true, width: 130, minWidth: 80, maxWidth: 200 },
  { key: 'dateOut' as ColumnKey, label: 'Date Out Warehouse', visible: true, width: 130, minWidth: 100, maxWidth: 200 },
];

const ITEMS_PER_PAGE = 15;

interface ParsedReleaseItem {
  id: string;
  sheetNo: string;
  deliverTo: string;
  qtyBoxes: number;
  qtyItem: number;
  remarks: string;
  category: string;
  waybillNo: string;
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
  const { items, releases, releaseStockBatch, loading } = useInventory();
  const { user, userRole } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { columns, setColumns, isAdmin } = useColumnSettings('releaseStock', DEFAULT_RELEASE_COLUMNS);
  
  const isColumnVisible = (key: string) => {
    const col = columns.find(c => c.key === key);
    return col?.visible ?? true;
  };
  
  const [releaseItems, setReleaseItems] = useState<ReleaseItem[]>([
    { id: crypto.randomUUID(), itemId: '', boxes: 1 }
  ]);
  const [allocationBill, setAllocationBill] = useState('');
  const [destination, setDestination] = useState('');
  const [category, setCategory] = useState('');
  const [boxes, setBoxes] = useState<number>(0);
  const [qtyItems, setQtyItems] = useState<number>(0);
  const [remarks, setRemarks] = useState('');
  const [waybillNo, setWaybillNo] = useState('');
  const [setDate, setSetDate] = useState<Date | undefined>(undefined);
  const [courier, setCourier] = useState('');
  const [notes, setNotes] = useState('');
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

  const addReleaseItem = () => {
    setReleaseItems([...releaseItems, { id: crypto.randomUUID(), itemId: '', boxes: 1 }]);
  };

  const removeReleaseItem = (id: string) => {
    if (releaseItems.length > 1) {
      setReleaseItems(releaseItems.filter(item => item.id !== id));
    }
  };

  const updateReleaseItem = (id: string, field: 'itemId' | 'boxes', value: string | number) => {
    setReleaseItems(releaseItems.map(item => 
      item.id === id ? { ...item, [field]: value } : item
    ));
    
    // Auto-fill remarks and destination when selecting an item
    if (field === 'itemId' && typeof value === 'string') {
      const selectedItem = items.find(i => i.id === value);
      if (selectedItem?.description) {
        setRemarks(selectedItem.description);
      }
      if (selectedItem?.branch) {
        setDestination(selectedItem.branch);
      }
    }
  };

  const getAvailableItems = (currentItemId: string) => {
    const selectedIds = releaseItems.map(r => r.itemId).filter(id => id && id !== currentItemId);
    return items.filter(item => item.available_stock > 0 && !selectedIds.includes(item.id));
  };

  const getItemData = (itemId: string) => items.find(i => i.id === itemId);

  // Check if allocation bill already exists
  const isDuplicateAllocationBill = (bill: string) => {
    if (!bill.trim()) return false;
    return releases.some(r => r.allocation_bill?.toLowerCase().trim() === bill.toLowerCase().trim());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate required fields
    if (!allocationBill.trim() || !destination.trim()) {
      toast({ title: 'Error', description: 'Please enter allocation bill and destination', variant: 'destructive' });
      return;
    }

    // Check for duplicate allocation bill
    if (isDuplicateAllocationBill(allocationBill)) {
      toast({ title: 'Warning', description: `Allocation bill "${allocationBill}" already exists. Please use a different one.`, variant: 'destructive' });
      return;
    }

    if (boxes <= 0) {
      toast({ title: 'Error', description: 'Please enter number of boxes', variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    try {
      // Create a manual release entry (no inventory item linked)
      await releaseStockBatch(
        [{ itemId: '', boxes: boxes }],
        destination,
        user!.id,
        remarks || undefined,
        courier || undefined,
        allocationBill || undefined,
        category || undefined,
        waybillNo || undefined,
        setDate?.toISOString() || undefined,
        qtyItems || boxes
      );
      toast({ title: 'Success', description: 'Stock released successfully' });
      
      // Reset form
      setAllocationBill('');
      setDestination('');
      setCategory('');
      setBoxes(0);
      setQtyItems(0);
      setRemarks('');
      setWaybillNo('');
      setSetDate(undefined);
      setCourier('');
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to release stock', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setImporting(true);
    setParsedItems([]);

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

      // Parse rows into release items - Format: Sheet No., Deliver To, Qty/Boxes, Qty/Item, Category, Remarks
      // Note: BILL column is intentionally excluded from parsing
      const parsed: ParsedReleaseItem[] = rows.map((row, index) => {
        const sheetNo = findColumnValue(row, 'Sheet No.', 'Sheet No', 'SHEET NO', 'Sheet', 'SheetNo', 'Item Code', 'ItemCode', 'Code', 'Allocation Bill', 'Bill', 'BILL');
        const deliverTo = findColumnValue(row, 'Deliver To', 'DeliverTo', 'DELIVER TO', 'Destination', 'DESTINATION', 'Branch');
        const qtyBoxes = findNumericValue(row, 'Qty/Boxes', 'Qty/Box', 'QTY/BOXES', 'Boxes', 'Box', 'BOX', 'BOXES');
        const qtyItem = findNumericValue(row, 'Qty/Item', 'QTY/ITEM', 'Qty Item', 'QtyItem', 'Quantity', 'Qty');
        const category = findColumnValue(row, 'Category', 'CATEGORY', 'Cat');
        const rem = findColumnValue(row, 'Remarks', 'REMARKS', 'Notes', 'NOTES');
        const waybillNo = findColumnValue(row, 'Waybill No.', 'Waybill No', 'Waybill', 'WAYBILL', 'WAYBILL NO');
        const setDateStr = findColumnValue(row, 'Set Date', 'SET DATE', 'Date', 'DATE');

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
          qtyItem,
          category,
          remarks: rem,
          waybillNo,
          setDate: setDateStr,
          courier: '',
          matchedItemId: matchedItem?.id || null,
          matchedItemName: matchedItem?.item_name || null,
        };
      }).filter(item => item.sheetNo || item.qtyBoxes > 0);

      if (parsed.length === 0) {
        toast({ title: 'No Items Found', description: 'Check column headers (Sheet No., Deliver To, Qty/Boxes, Qty/Item, Remarks).', variant: 'destructive' });
        setImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      setParsedItems(parsed);
      setShowImportPreview(true);
      toast({ title: 'File Parsed', description: `${parsed.length} items found. Review and confirm.` });
    } catch (error) {
      console.error('Excel parse error:', error);
      toast({ title: 'Error', description: 'Failed to parse file.', variant: 'destructive' });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleConfirmImport = async () => {
    const validItems = parsedItems.filter(p => p.qtyBoxes > 0 && selectedItems.has(p.id) && p.courier && p.setDate);
    
    if (validItems.length === 0) {
      toast({ title: 'Error', description: 'No selected items to release. Ensure items have Courier and Set Date.', variant: 'destructive' });
      return;
    }

    // Check for duplicate allocation bills
    const duplicates = validItems.filter(item => isDuplicateAllocationBill(item.sheetNo));
    if (duplicates.length > 0) {
      const duplicateBills = duplicates.map(d => d.sheetNo).join(', ');
      toast({ title: 'Warning', description: `Allocation bill(s) already exist: ${duplicateBills}. Please remove or change them.`, variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    try {
      // Release all selected items as ONE BATCH (single batch_id)
      // Use the first item's courier, setDate, and waybillNo for the batch
      const firstItem = validItems[0];

      // Release all items together as one batch
      for (const item of validItems) {
        await releaseStockBatch(
          [{ itemId: item.matchedItemId || '', boxes: item.qtyBoxes }],
          item.deliverTo || 'Unknown',
          user!.id,
          item.remarks || undefined,
          firstItem.courier, // Use first item's courier for all
          item.sheetNo || undefined,
          item.category || undefined,
          firstItem.waybillNo || undefined, // Use first item's waybill for all
          firstItem.setDate || undefined, // Use first item's set date for all
          item.qtyItem || item.qtyBoxes
        );
      }

      // Remove released items from preview
      const releasedIds = new Set(validItems.map(i => i.id));
      setParsedItems(prev => prev.filter(p => !releasedIds.has(p.id)));
      setSelectedItems(new Set());
      
      // Hide preview if no items left
      if (parsedItems.length - validItems.length === 0) {
        setShowImportPreview(false);
      }

      toast({ title: 'Success', description: `${validItems.length} item(s) released as one batch` });
    } catch (error) {
      console.error('Release error:', error);
      toast({ title: 'Error', description: 'Failed to release stock from import', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  // Bulk update function - when user changes waybill/setDate/courier on any checked item, apply to all checked items
  const updateParsedItemWithBulk = (id: string, field: keyof ParsedReleaseItem, value: string | number) => {
    const isChecked = selectedItems.has(id);
    const isBulkField = field === 'waybillNo' || field === 'setDate' || field === 'courier';
    
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

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Import Excel Section */}
      <div className="rounded-xl border bg-card p-6 shadow-sm animate-fade-in">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold select-none">Import from Excel</h2>
              <p className="text-sm text-muted-foreground select-none">Upload Excel with: Sheet No., Deliver To, Qty/Boxes, Qty/Item, Remarks</p>
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
              <div className="max-h-[400px] overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead className="w-12 px-2">
                        <Checkbox 
                          checked={allSelectableSelected}
                          onCheckedChange={toggleSelectAll}
                          aria-label="Select all"
                        />
                      </TableHead>
                      <TableHead className="min-w-[130px] px-2">Allocation Bill</TableHead>
                      <TableHead className="min-w-[130px] px-2">Destination</TableHead>
                      <TableHead className="min-w-[110px] px-2">Category</TableHead>
                      <TableHead className="w-24 px-2">Boxes</TableHead>
                      <TableHead className="w-24 px-2">Qty/Item</TableHead>
                      <TableHead className="min-w-[130px] px-2">Remarks</TableHead>
                      <TableHead className="min-w-[130px] px-2">Waybill No.</TableHead>
                      <TableHead className="min-w-[130px] px-2">Date Out Warehouse</TableHead>
                      <TableHead className="min-w-[130px] px-2">Courier</TableHead>
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
                          <TableCell className="px-2">
                            <Checkbox 
                              checked={selectedItems.has(item.id)}
                              onCheckedChange={() => toggleSelectItem(item.id)}
                              disabled={item.qtyBoxes <= 0}
                              aria-label={`Select ${item.sheetNo}`}
                            />
                          </TableCell>
                          <TableCell className="px-2">
                            <Input 
                              defaultValue={item.sheetNo}
                              onBlur={(e) => {
                                if (e.target.value !== item.sheetNo) {
                                  updateParsedItem(item.id, 'sheetNo', e.target.value);
                                }
                              }}
                              className="h-8 text-xs font-mono min-w-[110px]"
                              placeholder="Allocation Bill"
                            />
                          </TableCell>
                          <TableCell className="px-2">
                            <Input 
                              defaultValue={item.deliverTo}
                              onBlur={(e) => {
                                if (e.target.value !== item.deliverTo) {
                                  updateParsedItem(item.id, 'deliverTo', e.target.value);
                                }
                              }}
                              className="h-8 text-xs min-w-[110px]"
                              placeholder="Destination"
                            />
                          </TableCell>
                          <TableCell className="px-2">
                            <Input 
                              defaultValue={item.category}
                              onBlur={(e) => {
                                if (e.target.value !== item.category) {
                                  updateParsedItem(item.id, 'category', e.target.value);
                                }
                              }}
                              className="h-8 text-xs min-w-[90px]"
                              placeholder="Category"
                            />
                          </TableCell>
                          <TableCell className="px-2">
                            <Input 
                              type="number"
                              defaultValue={item.qtyBoxes}
                              onBlur={(e) => {
                                const val = parseInt(e.target.value) || 0;
                                if (val !== item.qtyBoxes) {
                                  updateParsedItem(item.id, 'qtyBoxes', val);
                                }
                              }}
                              className="h-8 text-xs w-20"
                              min={0}
                            />
                          </TableCell>
                          <TableCell className="px-2">
                            <Input 
                              type="number"
                              defaultValue={item.qtyItem}
                              onBlur={(e) => {
                                const val = parseInt(e.target.value) || 0;
                                if (val !== item.qtyItem) {
                                  updateParsedItem(item.id, 'qtyItem', val);
                                }
                              }}
                              className="h-8 text-xs w-20"
                              min={0}
                            />
                          </TableCell>
                          <TableCell className="px-2">
                            <Input 
                              defaultValue={item.remarks}
                              onBlur={(e) => {
                                if (e.target.value !== item.remarks) {
                                  updateParsedItem(item.id, 'remarks', e.target.value);
                                }
                              }}
                              className="h-8 text-xs min-w-[110px]"
                              placeholder="Remarks"
                            />
                          </TableCell>
                          <TableCell className="px-2">
                            <Input 
                              defaultValue={item.waybillNo || ''}
                              onBlur={(e) => {
                                if (e.target.value !== (item.waybillNo || '')) {
                                  updateParsedItemWithBulk(item.id, 'waybillNo', e.target.value);
                                }
                              }}
                              className="h-8 text-xs min-w-[110px]"
                              placeholder="Waybill No."
                            />
                          </TableCell>
                          <TableCell className="px-2">
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button variant="outline" className="h-8 text-xs w-full min-w-[100px] justify-start">
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
                          <TableCell className="px-2">
                            <Select value={item.courier} onValueChange={(val) => updateParsedItemWithBulk(item.id, 'courier', val)}>
                              <SelectTrigger className="h-8 text-xs min-w-[110px]">
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

      {/* Manual Release Form */}
      <div className="rounded-xl border bg-card p-6 shadow-sm animate-fade-in">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <PackagePlus className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold select-none">OUT WAREHOUSE DELIVERY</h2>
            <p className="text-sm text-muted-foreground select-none">Manual stock release entry</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* 1. Allocation Bill */}
          <div className="space-y-2">
            <Label>Allocation Bill *</Label>
            <Input value={allocationBill} onChange={(e) => setAllocationBill(e.target.value)} placeholder="Enter allocation bill number" />
          </div>

          {/* 2. Destination */}
          <div className="space-y-2">
            <Label>Destination *</Label>
            <Input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Store / Branch / Customer" />
          </div>

          {/* 3. Category (Manual Input) */}
          <div className="space-y-2">
            <Label>Category</Label>
            <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Enter category (e.g. BAGS, WALLET, SHOES)" />
          </div>

          {/* 4. Boxes */}
          <div className="space-y-2">
            <Label>Boxes</Label>
            <Input 
              type="number" 
              min={0}
              value={boxes || ''} 
              onChange={(e) => setBoxes(parseInt(e.target.value) || 0)} 
              placeholder="Enter number of boxes" 
            />
          </div>

          {/* 5. Qty/Items */}
          <div className="space-y-2">
            <Label>Qty/Items</Label>
            <Input 
              type="number" 
              min={0}
              value={qtyItems || ''} 
              onChange={(e) => setQtyItems(parseInt(e.target.value) || 0)} 
              placeholder="Enter total quantity of items" 
            />
          </div>

          {/* 6. Remarks */}
          <div className="space-y-2">
            <Label>Remarks</Label>
            <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Remarks / reference" />
          </div>

          {/* 7. Waybill No */}
          <div className="space-y-2">
            <Label>Waybill No.</Label>
            <Input value={waybillNo} onChange={(e) => setWaybillNo(e.target.value)} placeholder="Enter waybill number" />
          </div>

          {/* 8. Set Date */}
          <div className="space-y-2">
            <Label>Set Date (Date Out Warehouse)</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {setDate ? format(setDate, 'MMM d, yyyy') : 'Select date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={setDate}
                  onSelect={setSetDate}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Courier (Optional) */}
          <div className="space-y-2">
            <Label>Courier (Optional)</Label>
            <Select value={courier} onValueChange={setCourier}>
              <SelectTrigger>
                <SelectValue placeholder="Select courier" />
              </SelectTrigger>
              <SelectContent>
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
          </div>

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Processing...' : 'Release Stock'}
          </Button>
        </form>
      </div>


    </div>
  );
};

export default ReleaseStock;
