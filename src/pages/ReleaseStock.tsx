import { useState, useRef, useMemo, useEffect, useCallback, useTransition, memo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { CheckCircle2, Loader2, PackagePlus, Plus, Trash2, Upload, FileSpreadsheet, Search, CalendarIcon, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { useInventory } from '@/hooks/useInventory';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { useToast } from '@/hooks/use-toast';
import { useDebounce } from '@/hooks/useDebounce';
import { format, isValid, parse } from 'date-fns';
import * as XLSX from 'xlsx';
import ColumnSettings, { ColumnConfig, ColumnKey } from '@/components/deliveries/ColumnSettings';
import { useColumnSettings } from '@/hooks/useColumnSettings';
import { useActivityLog } from '@/hooks/useActivityLog';
import { PENDING_ALLOCATION_ACTION_STATUSES } from '@/lib/pendingAllocationStatus';

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

const ITEMS_PER_PAGE = 25;
const PARSED_ITEMS_STORAGE_KEY = 'releaseStock_parsedItems';
const MAX_PERSISTED_PARSED_ITEMS = 1000;
const STOCK_RELEASE_INSERT_CHUNK_SIZE = 500;
const STOCK_RELEASE_LOOKUP_CHUNK_SIZE = 500;
const PENDING_IMPORT_PREVIEW_LIMIT = 8;

type PendingImportProgress = {
  active: boolean;
  fileName: string;
  stage: string;
  message: string;
  percent: number;
  totalRows: number;
  parsedItems: number;
  totalBills: number;
  importableItems: number;
  importableBills: number;
  skippedItems: number;
  skippedBills: number;
  importedItems: number;
  importablePreview: string[];
  skippedPreview: string[];
};

const createPendingImportProgress = (): PendingImportProgress => ({
  active: false,
  fileName: '',
  stage: 'Preparing',
  message: '',
  percent: 0,
  totalRows: 0,
  parsedItems: 0,
  totalBills: 0,
  importableItems: 0,
  importableBills: 0,
  skippedItems: 0,
  skippedBills: 0,
  importedItems: 0,
  importablePreview: [],
  skippedPreview: [],
});

const waitForProgressScreen = (ms = 900) => new Promise(resolve => window.setTimeout(resolve, ms));

const toStableReleaseDate = (date: Date) => `${format(date, 'yyyy-MM-dd')}T12:00:00.000Z`;
const toImportedDateTime = (date: Date) => (isValid(date) ? date.toISOString() : '');
const toImportedDateTimeDisplay = (date: Date) => (isValid(date) ? format(date, 'yyyy-MM-dd HH:mm:ss') : '');

const isMissingImportCreatedAtError = (error: unknown) => {
  if (!error || typeof error !== 'object') return false;
  const details = error as { code?: string; message?: string; details?: string; hint?: string };
  return [details.message, details.details, details.hint]
    .filter(Boolean)
    .some(text => String(text).toLowerCase().includes('import_created_at'));
};

const normalizeImportHeader = (value: string) =>
  value
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const hasCellValue = (value: unknown) =>
  value !== undefined && value !== null && String(value).trim() !== '';

const parseImportedDateValue = (value: unknown) => {
  if (value === undefined || value === null || value === '') return '';

  if (value instanceof Date && isValid(value)) {
    return toStableReleaseDate(value);
  }

  if (typeof value === 'number') {
    const excelDate = new Date((value - 25569) * 86400 * 1000);
    return isValid(excelDate) ? toStableReleaseDate(excelDate) : '';
  }

  const text = String(value).trim();
  if (!text) return '';

  const parsedByPattern = [
    'yyyy-MM-dd',
    'yyyy/M/d',
    'MM/dd/yyyy',
    'M/d/yyyy',
    'MM/dd/yy',
    'M/d/yy',
    'MM-dd-yyyy',
    'M-d-yyyy',
    'MM-dd-yy',
    'M-d-yy',
    'dd/MM/yyyy',
    'd/M/yyyy',
    'dd/MM/yy',
    'd/M/yy',
  ]
    .map(pattern => parse(text, pattern, new Date()))
    .find(date => isValid(date));

  if (parsedByPattern) return toStableReleaseDate(parsedByPattern);

  const parsed = new Date(text);
  return isValid(parsed) ? toStableReleaseDate(parsed) : '';
};

const parseImportedDateTimeValue = (value: unknown) => {
  if (value === undefined || value === null || value === '') return { iso: '', display: '' };

  if (value instanceof Date && isValid(value)) {
    return {
      iso: toImportedDateTime(value),
      display: toImportedDateTimeDisplay(value),
    };
  }

  if (typeof value === 'number') {
    const excelDate = new Date((value - 25569) * 86400 * 1000);
    return {
      iso: toImportedDateTime(excelDate),
      display: toImportedDateTimeDisplay(excelDate),
    };
  }

  const text = String(value).trim();
  if (!text) return { iso: '', display: '' };

  const parsedByPattern = [
    'yyyy-MM-dd HH:mm:ss',
    'yyyy-MM-dd H:mm:ss',
    'yyyy-MM-dd HH:mm',
    'yyyy-MM-dd H:mm',
    'yyyy/M/d HH:mm:ss',
    'yyyy/M/d H:mm:ss',
    'yyyy/M/d HH:mm',
    'yyyy/M/d H:mm',
    'MM/dd/yyyy HH:mm:ss',
    'M/d/yyyy H:mm:ss',
    'MM/dd/yyyy HH:mm',
    'M/d/yyyy H:mm',
    'MM/dd/yyyy h:mm:ss a',
    'M/d/yyyy h:mm:ss a',
    'MM/dd/yyyy h:mm a',
    'M/d/yyyy h:mm a',
  ]
    .map(pattern => parse(text, pattern, new Date()))
    .find(date => isValid(date));

  if (parsedByPattern) {
    return {
      iso: toImportedDateTime(parsedByPattern),
      display: text,
    };
  }

  const parsed = new Date(text);
  if (!isValid(parsed)) return { iso: '', display: text };

  return {
    iso: toImportedDateTime(parsed),
    display: text,
  };
};

const findRawColumnValue = (row: Record<string, unknown>, ...possibleNames: string[]) => {
  const keys = Object.keys(row);
  const normalizedNames = possibleNames.map(normalizeImportHeader).filter(Boolean);

  for (const key of keys) {
    const normalizedKey = normalizeImportHeader(key);
    if (normalizedNames.includes(normalizedKey) && hasCellValue(row[key])) {
      return row[key];
    }
  }

  for (const key of keys) {
    const normalizedKey = normalizeImportHeader(key);
    const matched = normalizedNames.some(name => normalizedKey.includes(name) || name.includes(normalizedKey));
    if (matched && hasCellValue(row[key])) {
      return row[key];
    }
  }

  return undefined;
};

const findLikelyCreatedDateValue = (row: Record<string, unknown>) => {
  const entries = Object.entries(row).filter(([, value]) => hasCellValue(value));

  for (const [, value] of [...entries].reverse()) {
    if (value instanceof Date && isValid(value)) return value;
    if (typeof value !== 'string') continue;

    const text = value.trim();
    if (
      /^\d{4}[-/]\d{1,2}[-/]\d{1,2}[ T]\d{1,2}:\d{2}/.test(text) ||
      /^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}[ T]\d{1,2}:\d{2}/.test(text)
    ) {
      return value;
    }
  }

  return undefined;
};

interface ParsedReleaseItem {
  id: string;
  sheetNo: string;
  deliverTo: string;
  qtyBoxes: number;
  amount: number;
  unitPrice?: number | null;
  qtyItem: number;
  remarks: string;
  productCode: string;
  productDescription: string;
  category: string;
  billDate: string;
  setDate: string;
  createdAt: string;
  createdAtDisplay: string;
  courier: string;
  matchedItemId: string | null;
  matchedItemName: string | null;
}

interface ReleaseItem {
  id: string;
  itemId: string;
  boxes: number;
}

type StockReleaseInsertRow = {
  item_id: string | null;
  boxes_released: number;
  destination: string;
  released_by: string;
  notes: string | null;
  courier: string | null;
  allocation_bill: string | null;
  batch_id: string;
  category: string | null;
  waybill_no: string | null;
  set_date: string | null;
  total_qty: number | null;
  branch_id: string | null;
  amount: number | null;
  delivery_status?: 'pending';
  action_status: string | null;
  product_code: string | null;
  product_description: string | null;
  unit_price: number | null;
  created_at?: string;
  import_created_at?: string | null;
};

const getSavedParsedItems = () => {
  try {
    const saved = localStorage.getItem(PARSED_ITEMS_STORAGE_KEY);
    if (!saved) return [];

    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];

    if (parsed.length > MAX_PERSISTED_PARSED_ITEMS) {
      localStorage.removeItem(PARSED_ITEMS_STORAGE_KEY);
      return [];
    }

    return parsed as ParsedReleaseItem[];
  } catch {
    localStorage.removeItem(PARSED_ITEMS_STORAGE_KEY);
    return [];
  }
};

const getUniqueAllocationBills = (items: ParsedReleaseItem[]) => {
  const bills = new Set<string>();
  items.forEach(item => {
    const bill = item.sheetNo.trim();
    if (bill) bills.add(bill);
  });
  return Array.from(bills);
};


const ReleaseStock = () => {
  const { items, loading } = useInventory({ loadCategories: false, loadReleases: false });
  const isReleasingRef = useRef(false);
  const { user } = useAuth();
  const { selectedBranch } = useBranch();
  const { toast } = useToast();
  const { logActivity } = useActivityLog();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingImportFileInputRef = useRef<HTMLInputElement>(null);
  const { columns, setColumns, isAdmin } = useColumnSettings('releaseStock', DEFAULT_RELEASE_COLUMNS);
  
  const isColumnVisible = (key: string) => {
    const col = columns.find(c => c.key === key);
    return col?.visible ?? true;
  };
  
  const [submitting, setSubmitting] = useState(false);
  
  
  // Import Excel state - initialize from localStorage
  const [importing, setImporting] = useState(false);
  const [pendingImporting, setPendingImporting] = useState(false);
  const [pendingImportProgress, setPendingImportProgress] = useState<PendingImportProgress>(createPendingImportProgress);
  const [parsedItems, setParsedItems] = useState<ParsedReleaseItem[]>(getSavedParsedItems);
  const [showImportPreview, setShowImportPreview] = useState(() => {
    return getSavedParsedItems().length > 0;
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

  useEffect(() => {
    const savePreview = () => {
      if (parsedItems.length > MAX_PERSISTED_PARSED_ITEMS) {
        localStorage.removeItem(PARSED_ITEMS_STORAGE_KEY);
        return;
      }

      localStorage.setItem(PARSED_ITEMS_STORAGE_KEY, JSON.stringify(parsedItems));
    };

    if (parsedItems.length > 0) {
      const timer = window.setTimeout(savePreview, 400);
      return () => window.clearTimeout(timer);
    }

    localStorage.removeItem(PARSED_ITEMS_STORAGE_KEY);
  }, [parsedItems]);

  const normalizeAllocation = useCallback((allocation?: string | null) => {
    return String(allocation || '')
      .normalize('NFKC')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .trim()
      .replace(/[^a-z0-9]/gi, '')
      .toLowerCase();
  }, []);

  const fetchExistingAllocationKeys = async (allocations?: string[]) => {
    const keys = new Set<string>();
    const requestedAllocations = (allocations || []).map(bill => bill.trim()).filter(Boolean);

    if (requestedAllocations.length === 0) return keys;

    for (let index = 0; index < requestedAllocations.length; index += STOCK_RELEASE_LOOKUP_CHUNK_SIZE) {
      const chunk = requestedAllocations.slice(index, index + STOCK_RELEASE_LOOKUP_CHUNK_SIZE);
      const { data, error } = await supabase
        .from('stock_releases')
        .select('allocation_bill')
        .is('deleted_at', null)
        .in('allocation_bill', chunk);

      if (error) throw error;

      (data || []).forEach((release) => {
        const key = normalizeAllocation(release.allocation_bill);
        if (key) keys.add(key);
      });
    }

    return keys;
  };

  const insertStockReleaseRows = async (rows: StockReleaseInsertRow[]) => {
    for (let index = 0; index < rows.length; index += STOCK_RELEASE_INSERT_CHUNK_SIZE) {
      const chunk = rows.slice(index, index + STOCK_RELEASE_INSERT_CHUNK_SIZE);
      const { error } = await supabase.from('stock_releases').insert(chunk);
      if (!error) continue;

      if (!isMissingImportCreatedAtError(error)) throw error;

      const fallbackChunk = chunk.map(({ import_created_at: _importCreatedAt, ...row }) => row);
      const { error: fallbackError } = await supabase.from('stock_releases').insert(fallbackChunk);
      if (fallbackError) throw fallbackError;
    }
  };

  const syncExistingPendingAllocationCreatedDates = async (
    releaseItems: ParsedReleaseItem[],
    existingKeys: Set<string>,
  ) => {
    const datesByBill = new Map<string, { bills: Set<string>; createdAt: string; createdAtDisplay: string }>();

    releaseItems.forEach((item) => {
      const key = normalizeAllocation(item.sheetNo);
      if (!key || !existingKeys.has(key) || !item.createdAtDisplay) return;

      const current = datesByBill.get(key) || {
        bills: new Set<string>(),
        createdAt: item.createdAt,
        createdAtDisplay: item.createdAtDisplay,
      };

      current.bills.add(item.sheetNo.trim());
      if (!current.createdAtDisplay) {
        current.createdAt = item.createdAt;
        current.createdAtDisplay = item.createdAtDisplay;
      }
      datesByBill.set(key, current);
    });

    if (datesByBill.size === 0) return;

    const bills = Array.from(
      new Set(
        Array.from(datesByBill.values())
          .flatMap(entry => Array.from(entry.bills))
          .filter(Boolean),
      ),
    );
    const existingRows: { id: string; allocation_bill: string | null }[] = [];

    for (let index = 0; index < bills.length; index += STOCK_RELEASE_LOOKUP_CHUNK_SIZE) {
      const chunk = bills.slice(index, index + STOCK_RELEASE_LOOKUP_CHUNK_SIZE);
      let query = supabase
        .from('stock_releases')
        .select('id,allocation_bill')
        .is('deleted_at', null)
        .in('action_status', PENDING_ALLOCATION_ACTION_STATUSES)
        .in('allocation_bill', chunk);

      if (selectedBranch?.id) {
        query = query.eq('branch_id', selectedBranch.id);
      }

      const { data, error } = await query;
      if (error) {
        console.warn('Unable to sync pending allocation Created Date:', error);
        continue;
      }

      existingRows.push(...(data || []));
    }

    const updatesByPayload = new Map<string, { ids: string[]; createdAt?: string; createdAtDisplay: string }>();
    existingRows.forEach((row) => {
      const key = normalizeAllocation(row.allocation_bill);
      const entry = datesByBill.get(key);
      if (!entry) return;

      const payloadKey = `${entry.createdAt || ''}|${entry.createdAtDisplay}`;
      const current = updatesByPayload.get(payloadKey) || {
        ids: [],
        createdAt: entry.createdAt || undefined,
        createdAtDisplay: entry.createdAtDisplay,
      };
      current.ids.push(row.id);
      updatesByPayload.set(payloadKey, current);
    });

    for (const update of updatesByPayload.values()) {
      if (update.ids.length === 0) continue;

      const updatePayload: { import_created_at: string; created_at?: string } = {
        import_created_at: update.createdAtDisplay,
      };

      if (update.createdAt) updatePayload.created_at = update.createdAt;

      for (let index = 0; index < update.ids.length; index += STOCK_RELEASE_LOOKUP_CHUNK_SIZE) {
        const chunk = update.ids.slice(index, index + STOCK_RELEASE_LOOKUP_CHUNK_SIZE);
        const { error: updateError } = await supabase
          .from('stock_releases')
          .update(updatePayload)
          .in('id', chunk);

        if (updateError) {
          if (!isMissingImportCreatedAtError(updateError) || !update.createdAt) {
            console.warn('Unable to update pending allocation Created Date:', updateError);
            continue;
          }

          const { error: fallbackError } = await supabase
            .from('stock_releases')
            .update({ created_at: update.createdAt })
            .in('id', chunk);

          if (fallbackError) {
            console.warn('Unable to update pending allocation Created Date:', fallbackError);
          }
        }
      }
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

  const findNumericColumnValue = (row: Record<string, unknown>, ...possibleNames: string[]) => {
    const keys = Object.keys(row);

    for (const name of possibleNames) {
      const exactKey = keys.find(k => k.toLowerCase().trim() === name.toLowerCase().trim());
      const key = row[name] !== undefined ? name : exactKey;
      if (key && row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') {
        const cleanVal = String(row[key]).replace(/[â‚±$,]/g, '').trim();
        return { value: Number(cleanVal) || 0, matchedColumn: key };
      }
    }

    for (const name of possibleNames) {
      const partialKey = keys.find(k =>
        k.toLowerCase().includes(name.toLowerCase()) ||
        name.toLowerCase().includes(k.toLowerCase())
      );
      if (partialKey && row[partialKey] !== undefined && row[partialKey] !== null && String(row[partialKey]).trim() !== '') {
        const cleanVal = String(row[partialKey]).replace(/[â‚±$,]/g, '').trim();
        return { value: Number(cleanVal) || 0, matchedColumn: partialKey };
      }
    }

    return { value: 0, matchedColumn: '' };
  };

  const readReleaseImportRows = async (file: File) => {
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

    return rows;
  };

  const parseReleaseRows = (rows: Record<string, unknown>[]) => {
    if (rows.length > 0) {
      console.log('Excel column names detected:', Object.keys(rows[0]));
    }

    return rows.map((row, index) => {
      if (index === 0) {
        console.log('First row data:', row);
      }

      const sheetNo = findColumnValue(row, 'Sheet No.', 'Sheet No', 'SHEET NO', 'Sheet', 'SheetNo', 'Allocation', 'ALLOCATION', 'Allocation Bill', 'ALLOCATION BILL', 'Bill No', 'BILL NO', 'Bill', 'BILL');
      const deliverTo = findColumnValue(row, 'Deliver To', 'DeliverTo', 'DELIVER TO', 'Deliver_To', 'DELIVER_TO', 'Destination', 'DESTINATION', 'Branch', 'BRANCH', 'Store', 'STORE', 'To Branch', 'TO BRANCH', 'Ship To', 'SHIP TO', 'Location', 'LOCATION', 'Deliver', 'DELIVER', 'Supplier', 'SUPPLIER');
      const qtyBoxes = 1;
      const qtyItem = findNumericValue(row, 'Qty', 'Qty/Item', 'QTY/ITEM', 'Qty Item', 'QtyItem', 'Quantity', 'QTY');
      const productCode = findColumnValue(row, 'Product Code', 'PRODUCT CODE', 'ProductCode', 'Item Code', 'ITEM CODE', 'ItemCode', 'Code', 'CODE', 'SKU', 'Product Name', 'PRODUCT NAME', 'Product');
      const productDescription = findColumnValue(row, 'Product Description', 'PRODUCT DESCRIPTION', 'Product Desc', 'PRODUCT DESC', 'Description', 'DESCRIPTION', 'Desc', 'DESC', 'Model', 'MODEL');
      const category = findColumnValue(row, 'Category', 'CATEGORY', 'Cat', 'CAT', 'Type', 'TYPE');
      const rem = findColumnValue(row, 'Remarks', 'REMARKS', 'Notes', 'NOTES', 'Remark', 'REMARK', 'Comment', 'COMMENT');
      const courier = findColumnValue(row, 'Courier', 'COURIER', 'Delivery Courier', 'DELIVERY COURIER');
      const amountInfo = findNumericColumnValue(row, 'Amount', 'AMOUNT', 'Amt', 'AMT', 'Total', 'TOTAL', 'Price', 'PRICE', 'Unit Price', 'UNIT PRICE');
      const amountHeader = amountInfo.matchedColumn.toLowerCase();
      const amountIsUnitPrice = amountHeader.includes('price') && !amountHeader.includes('amount') && !amountHeader.includes('total');
      const amountVal = amountIsUnitPrice && qtyItem > 0 ? amountInfo.value * qtyItem : amountInfo.value;
      const unitPrice = amountIsUnitPrice ? amountInfo.value : null;

      if (index === 0) {
        console.log('Parsed first row - sheetNo:', sheetNo, 'deliverTo:', deliverTo, 'category:', category, 'remarks:', rem);
      }

      let billDateIso = '';
      const billDateKeys = ['BILL DATE', 'Bill Date', 'Set Date', 'SET DATE', 'Date', 'DATE'];
      for (const key of billDateKeys) {
        const val = row[key];
        billDateIso = parseImportedDateValue(val);
        if (billDateIso) break;
      }
      const billDateStr = billDateIso ? format(new Date(billDateIso), 'MM/dd/yyyy') : '';

      const createdAtValue =
        findRawColumnValue(
          row,
          'Created Date',
          'Create Date',
          'Date Created',
          'Created At',
          'CreatedDate',
          'CreateDate',
          'DateCreated',
          'created_at',
          'IMPORT CREATED DATE',
        ) ?? findLikelyCreatedDateValue(row);
      const parsedCreatedAt = parseImportedDateTimeValue(createdAtValue);
      const createdAtIso = parsedCreatedAt.iso;
      const createdAtDisplay = parsedCreatedAt.display;

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
        unitPrice,
        qtyItem,
        category,
        remarks: rem,
        productCode,
        productDescription,
        billDate: billDateStr,
        setDate: billDateIso,
        createdAt: createdAtIso,
        createdAtDisplay,
        courier,
        matchedItemId: matchedItem?.id || null,
        matchedItemName: matchedItem?.item_name || null,
      };
    }).filter(item => item.sheetNo || item.deliverTo);
  };

  const buildStockReleaseRowsFromItems = (releaseItems: ParsedReleaseItem[]) => {
    const groups = new Map<string, ParsedReleaseItem[]>();
    for (const item of releaseItems) {
      const normalizedSheetNo = normalizeAllocation(item.sheetNo);
      const key = normalizedSheetNo
        ? `bill:${normalizedSheetNo}`
        : `row:${item.id}`;
      const arr = groups.get(key) || [];
      arr.push(item);
      groups.set(key, arr);
    }

    const rowsToInsert: StockReleaseInsertRow[] = [];
    for (const group of groups.values()) {
      const head = group[0];
      const batchId = crypto.randomUUID();
      const combinedNotes = group.map(g => g.remarks).filter(Boolean).join(' | ');

      group.forEach(item => {
        rowsToInsert.push({
          item_id: null,
          boxes_released: item.qtyBoxes,
          destination: head.deliverTo || 'Unknown',
          released_by: user!.id,
          notes: combinedNotes || null,
          courier: head.courier || null,
          allocation_bill: head.sheetNo || null,
          batch_id: batchId,
          category: item.category || head.category || null,
          waybill_no: null,
          set_date: head.setDate || null,
          total_qty: item.qtyItem || item.qtyBoxes || 0,
          branch_id: selectedBranch?.id || null,
          amount: item.amount || null,
          delivery_status: 'pending',
          action_status: 'yes',
          product_code: item.productCode || null,
          product_description: item.productDescription || null,
          unit_price: item.unitPrice || null,
          created_at: head.createdAt || undefined,
          import_created_at: head.createdAtDisplay || null,
        });
      });
    }

    return rowsToInsert;
  };

  const buildPendingAllocationRowsFromItems = (releaseItems: ParsedReleaseItem[]) => {
    const groups = new Map<string, ParsedReleaseItem[]>();
    for (const item of releaseItems) {
      const normalizedSheetNo = normalizeAllocation(item.sheetNo);
      const key = normalizedSheetNo
        ? `bill:${normalizedSheetNo}`
        : `row:${item.id}`;
      const arr = groups.get(key) || [];
      arr.push(item);
      groups.set(key, arr);
    }

    const rowsToInsert: StockReleaseInsertRow[] = [];
    for (const group of groups.values()) {
      const head = group[0];
      const batchId = crypto.randomUUID();
      const combinedNotes = group.map(g => g.remarks).filter(Boolean).join(' | ');

      group.forEach(item => {
        rowsToInsert.push({
          item_id: null,
          batch_id: batchId,
          allocation_bill: head.sheetNo || null,
          destination: head.deliverTo || 'Unknown',
          released_by: user!.id,
          category: item.category || head.category || null,
          boxes_released: item.qtyBoxes,
          amount: item.amount || null,
          total_qty: item.qtyItem || item.qtyBoxes || 0,
          notes: combinedNotes || null,
          set_date: head.setDate || null,
          courier: head.courier || null,
          waybill_no: null,
          branch_id: selectedBranch?.id || null,
          delivery_status: 'pending',
          action_status: 'pending_allocation',
          product_code: item.productCode || null,
          product_description: item.productDescription || null,
          unit_price: item.unitPrice || null,
          created_at: head.createdAt || undefined,
          import_created_at: head.createdAtDisplay || null,
        });
      });
    }

    return rowsToInsert;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setImporting(true);
    // Don't clear existing items - we'll append to them

    try {
      const rows = await readReleaseImportRows(file);
      const parsed = parseReleaseRows(rows);

      if (parsed.length === 0) {
        toast({ title: 'No Items Found', description: 'Check column headers (Sheet No., Deliver To, BOX, Qty, Remarks, BILL DATE).', variant: 'destructive' });
        setImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      // Keep duplicate Sheet No. rows: they are product lines under the same allocation bill.
      setParsedItems(prev => [...prev, ...parsed]);
      setShowImportPreview(true);
      
      toast({
        title: 'File Parsed',
        description: `${parsed.length} items added. Total: ${parsedItems.length + parsed.length} items.`,
      });
    } catch (error) {
      console.error('Excel parse error:', error);
      toast({ title: 'Error', description: 'Failed to parse file.', variant: 'destructive' });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handlePendingImportUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (isReleasingRef.current) {
      toast({ title: 'Please wait', description: 'Another release import is already in progress.', variant: 'default' });
      return;
    }

    setPendingImporting(true);
    isReleasingRef.current = true;
    setPendingImportProgress({
      ...createPendingImportProgress(),
      active: true,
      fileName: file.name,
      stage: 'Reading Excel',
      message: 'Binabasa ang file at kinukuha ang rows...',
      percent: 12,
    });

    try {
      await waitForProgressScreen(100);
      const rows = await readReleaseImportRows(file);
      setPendingImportProgress(prev => ({
        ...prev,
        totalRows: rows.length,
        stage: 'Parsing rows',
        message: `${rows.length} raw row(s) found. Inaayos ang bill, amount, qty, remarks, at created date.`,
        percent: 25,
      }));

      const parsed = parseReleaseRows(rows).filter(item => item.sheetNo.trim());
      const parsedBills = getUniqueAllocationBills(parsed);
      setPendingImportProgress(prev => ({
        ...prev,
        parsedItems: parsed.length,
        totalBills: parsedBills.length,
        stage: 'Checking duplicates',
        message: `${parsedBills.length} bill(s) chine-check kung existing na sa website.`,
        percent: 45,
      }));

      if (parsed.length === 0) {
        setPendingImportProgress(prev => ({
          ...prev,
          stage: 'No valid bills',
          message: 'Walang valid Allocation Bill / Sheet No. na nakita sa file.',
          percent: 100,
        }));
        await waitForProgressScreen(1200);
        toast({ title: 'No Bills Found', description: 'P Import needs rows with Allocation Bill / Sheet No.', variant: 'destructive' });
        return;
      }

      const existingReleaseKeys = await fetchExistingAllocationKeys(parsedBills);
      setPendingImportProgress(prev => ({
        ...prev,
        stage: 'Syncing skipped bills',
        message: 'Ina-update ang Created Date ng existing pending bills, tapos ii-skip sila.',
        percent: 58,
      }));

      await syncExistingPendingAllocationCreatedDates(parsed, existingReleaseKeys);
      const skippedBillKeys = new Set<string>();
      const skippedBillsByKey = new Map<string, string>();
      const importableBillsByKey = new Map<string, string>();
      const importableItems = parsed.filter(item => {
        const key = normalizeAllocation(item.sheetNo);
        if (!key || existingReleaseKeys.has(key)) {
          if (key) skippedBillKeys.add(key);
          if (key && !skippedBillsByKey.has(key)) skippedBillsByKey.set(key, item.sheetNo.trim());
          return false;
        }
        if (key && !importableBillsByKey.has(key)) importableBillsByKey.set(key, item.sheetNo.trim());
        return true;
      });
      const skippedItems = parsed.length - importableItems.length;
      const importableBills = Array.from(importableBillsByKey.values());
      const skippedBills = Array.from(skippedBillsByKey.values());

      setPendingImportProgress(prev => ({
        ...prev,
        importableItems: importableItems.length,
        importableBills: importableBills.length,
        skippedItems,
        skippedBills: skippedBillKeys.size,
        importablePreview: importableBills.slice(0, PENDING_IMPORT_PREVIEW_LIMIT),
        skippedPreview: skippedBills.slice(0, PENDING_IMPORT_PREVIEW_LIMIT),
        stage: importableItems.length > 0 ? 'Importing new bills' : 'All bills skipped',
        message: `${importableItems.length} item(s) papasok. ${skippedItems} item(s) skipped dahil existing na.`,
        percent: importableItems.length > 0 ? 72 : 100,
      }));

      if (importableItems.length === 0) {
        await waitForProgressScreen(1400);
        toast({
          title: 'No New Bills Imported',
          description: `${skippedBillKeys.size} existing bill(s) were skipped.`,
          variant: 'destructive',
        });
        return;
      }

      await insertStockReleaseRows(buildPendingAllocationRowsFromItems(importableItems));
      setPendingImportProgress(prev => ({
        ...prev,
        importedItems: importableItems.length,
        stage: 'Saving activity',
        message: 'Naka-save na ang new bills. Nilalagay na sa activity log.',
        percent: 92,
      }));

      const importedBills = getUniqueAllocationBills(importableItems);
      await logActivity({
        actionType: 'import',
        module: 'pending_allocations',
        description: `P Imported ${importableItems.length} pending allocation item(s) via Excel`,
        metadata: {
          items_count: importableItems.length,
          skipped_existing_bills: skippedBillKeys.size,
          branch_id: selectedBranch?.id,
          branch: selectedBranch?.name,
          allocation_bills: importedBills,
        },
      });

      setPendingImportProgress(prev => ({
        ...prev,
        importedItems: importableItems.length,
        stage: 'P Import Complete',
        message: `${importableItems.length} item(s) added. ${skippedItems} item(s) skipped.`,
        percent: 100,
      }));

      toast({
        title: 'P Import Complete',
        description: `${importableItems.length} item(s) added to Pending Allocation. ${skippedBillKeys.size} existing bill(s) skipped.`,
      });
      await waitForProgressScreen(1200);
    } catch (error) {
      console.error('P Import error:', error);
      setPendingImportProgress(prev => ({
        ...prev,
        stage: 'Import failed',
        message: 'May error habang nag-P Import. Walang dapat i-double import.',
        percent: 100,
      }));
      await waitForProgressScreen(1200);
      toast({ title: 'Error', description: 'Failed to P Import file.', variant: 'destructive' });
    } finally {
      setPendingImporting(false);
      isReleasingRef.current = false;
      setPendingImportProgress(createPendingImportProgress());
      if (pendingImportFileInputRef.current) pendingImportFileInputRef.current.value = '';
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
    const existingAllocationKeys = await fetchExistingAllocationKeys(getUniqueAllocationBills(validItems));
    const existingSheetNos = validItems.filter(item => {
      const normalizedSheetNo = normalizeAllocation(item.sheetNo);
      return Boolean(normalizedSheetNo && existingAllocationKeys.has(normalizedSheetNo));
    });
    if (existingSheetNos.length > 0) {
      toast({
        title: 'Duplicate Sheet No.',
        description: `${existingSheetNos.length} selected item(s) already exist and will not be imported.`,
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);
    isReleasingRef.current = true;

    try {
      const firstItem = validItems[0];

      await insertStockReleaseRows(buildStockReleaseRowsFromItems(validItems));

      // Remove released items from preview
      const releasedIds = new Set(validItems.map(i => i.id));
      setParsedItems(prev => prev.filter(p => !releasedIds.has(p.id)));
      setSelectedItems(new Set());
      
      if (parsedItems.length - validItems.length === 0) {
        setShowImportPreview(false);
      }

      await logActivity({
        actionType: 'import',
        module: 'stock_releases',
        description: `Imported ${validItems.length} delivery item(s) via Excel`,
        metadata: {
          items_count: validItems.length,
          courier: firstItem.courier,
          branch_id: selectedBranch?.id,
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
    
    const checked: ParsedReleaseItem[] = [];
    const unchecked: ParsedReleaseItem[] = [];
    filtered.forEach(item => {
      if (selectedItems.has(item.id)) {
        checked.push(item);
      } else {
        unchecked.push(item);
      }
    });

    return [...checked, ...unchecked];
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
  const allSelectableSelected = selectableItems.length > 0 && selectableItems.every(p => selectedItems.has(p.id));

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
    <div className="w-full max-w-[min(96vw,1600px)] mx-auto space-y-6 px-2">
      {pendingImportProgress.active && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-xl border bg-card p-5 shadow-2xl sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  {pendingImportProgress.percent >= 100 ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  )}
                </div>
                <div>
                  <h3 className="text-lg font-semibold">P Import Progress</h3>
                  <p className="text-sm text-muted-foreground">
                    {pendingImportProgress.fileName || 'Excel file'}
                  </p>
                </div>
              </div>
              <div className="rounded-md border px-3 py-2 text-sm font-medium">
                {pendingImportProgress.percent}%
              </div>
            </div>

            <div className="mt-5 space-y-2">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <p className="font-medium">{pendingImportProgress.stage}</p>
                <p className="text-sm text-muted-foreground">{pendingImportProgress.message}</p>
              </div>
              <Progress value={pendingImportProgress.percent} className="h-2" />
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-4">
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-xs font-medium uppercase text-muted-foreground">Parsed</p>
                <p className="mt-1 text-2xl font-semibold">{pendingImportProgress.parsedItems}</p>
                <p className="text-xs text-muted-foreground">{pendingImportProgress.totalBills} bill(s)</p>
              </div>
              <div className="rounded-lg border bg-green-50 p-3 text-green-900">
                <p className="text-xs font-medium uppercase">Papasok</p>
                <p className="mt-1 text-2xl font-semibold">{pendingImportProgress.importableItems}</p>
                <p className="text-xs">{pendingImportProgress.importableBills} bill(s)</p>
              </div>
              <div className="rounded-lg border bg-amber-50 p-3 text-amber-900">
                <p className="text-xs font-medium uppercase">Skipped</p>
                <p className="mt-1 text-2xl font-semibold">{pendingImportProgress.skippedItems}</p>
                <p className="text-xs">{pendingImportProgress.skippedBills} existing bill(s)</p>
              </div>
              <div className="rounded-lg border bg-blue-50 p-3 text-blue-900">
                <p className="text-xs font-medium uppercase">Saved</p>
                <p className="mt-1 text-2xl font-semibold">{pendingImportProgress.importedItems}</p>
                <p className="text-xs">pending item(s)</p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-green-700">Hindi skipped / papasok</p>
                  <span className="text-xs text-muted-foreground">{pendingImportProgress.importableBills} bill(s)</span>
                </div>
                <div className="mt-3 max-h-36 space-y-2 overflow-auto">
                  {pendingImportProgress.importablePreview.length > 0 ? (
                    pendingImportProgress.importablePreview.map((bill) => (
                      <div key={`import-${bill}`} className="rounded-md bg-green-50 px-2 py-1.5 font-mono text-xs text-green-900">
                        {bill}
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">Wala pang bagong bill na papasok.</p>
                  )}
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-amber-700">Skipped / existing na</p>
                  <span className="text-xs text-muted-foreground">{pendingImportProgress.skippedBills} bill(s)</span>
                </div>
                <div className="mt-3 max-h-36 space-y-2 overflow-auto">
                  {pendingImportProgress.skippedPreview.length > 0 ? (
                    pendingImportProgress.skippedPreview.map((bill) => (
                      <div key={`skip-${bill}`} className="rounded-md bg-amber-50 px-2 py-1.5 font-mono text-xs text-amber-900">
                        {bill}
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">Wala pang skipped bill.</p>
                  )}
                </div>
              </div>
            </div>

            <p className="mt-4 text-xs text-muted-foreground">
              Hint: kapag existing bill na, hindi siya papasok ulit para iwas duplicate. Created Date lang ang ina-sync kapag kailangan.
            </p>
          </div>
        </div>
      )}

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
            <input
              ref={pendingImportFileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handlePendingImportUpload}
              className="hidden"
            />
            <Button
              variant="default"
              onClick={() => pendingImportFileInputRef.current?.click()}
              disabled={pendingImporting || importing || submitting}
              className="mr-2"
            >
              <Upload className="h-4 w-4 mr-2" />
              {pendingImporting ? 'P Importing...' : 'P Import'}
            </Button>
            <Button 
              variant="outline" 
              onClick={() => fileInputRef.current?.click()}
              disabled={importing || pendingImporting}
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
                    className="h-9 w-[260px] pl-8 pr-8 text-sm"
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
              <div className="max-h-[68vh] min-h-[520px] overflow-y-auto overflow-x-auto scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
                <Table className="min-w-[1500px]">
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
                                readOnly
                                onBlur={(e) => {
                                  if (e.target.value !== item.sheetNo) {
                                    updateParsedItem(item.id, 'sheetNo', e.target.value);
                                  }
                                }}
                                className="h-8 text-xs font-mono min-w-[130px] px-3 rounded-lg bg-muted/50 cursor-default focus-visible:ring-0"
                                placeholder="Allocation Bill"
                              />
                            </TableCell>
                          )}
                          {isColumnVisible('destination') && (
                            <TableCell className="px-5">
                              <Input 
                                defaultValue={item.deliverTo}
                                readOnly
                                onBlur={(e) => {
                                  if (e.target.value !== item.deliverTo) {
                                    updateParsedItem(item.id, 'deliverTo', e.target.value);
                                  }
                                }}
                                className="h-8 text-xs min-w-[140px] px-3 rounded-lg bg-muted/50 cursor-default focus-visible:ring-0"
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
                                readOnly
                                onBlur={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  if (val !== item.amount) {
                                    updateParsedItemWithBulk(item.id, 'amount', val);
                                  }
                                }}
                                className="h-7 text-xs w-[80px] px-2 rounded bg-muted/50 cursor-default focus-visible:ring-0"
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
                                readOnly
                                onBlur={(e) => {
                                  const val = parseInt(e.target.value) || 0;
                                  if (val !== item.qtyItem) {
                                    updateParsedItem(item.id, 'qtyItem', val);
                                  }
                                }}
                                className="h-7 text-xs w-[60px] px-2 rounded bg-muted/50 cursor-default focus-visible:ring-0"
                                min={0}
                              />
                            </TableCell>
                          )}
                          {isColumnVisible('remarks') && (
                            <TableCell className="px-5">
                              <Input 
                                defaultValue={item.remarks}
                                readOnly
                                onBlur={(e) => {
                                  if (e.target.value !== item.remarks) {
                                    updateParsedItem(item.id, 'remarks', e.target.value);
                                  }
                                }}
                                className="h-8 text-xs min-w-[120px] px-3 rounded-lg bg-muted/50 cursor-default focus-visible:ring-0"
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
                                    onSelect={(date) => updateParsedItemWithBulk(item.id, 'setDate', date ? toStableReleaseDate(date) : '')}
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
