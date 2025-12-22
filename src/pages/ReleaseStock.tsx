import { useState, useRef } from 'react';
import { PackagePlus, Plus, Trash2, FileText, Upload, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useInventory } from '@/hooks/useInventory';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import AllocationBillModal from '@/components/deliveries/AllocationBillModal';
import { format } from 'date-fns';
import type { StockRelease } from '@/types/inventory';
import * as XLSX from 'xlsx';

interface ParsedReleaseItem {
  id: string;
  sheetNo: string;
  boxes: number;
  destination: string;
  courier: string;
  remarks: string;
  matchedItemId: string | null;
  matchedItemName: string | null;
}

interface ReleaseItem {
  id: string;
  itemId: string;
  boxes: number;
}

interface AllocationBillGroup {
  batch_id: string;
  destination: string;
  courier: string | null;
  allocation_bill: string | null;
  date_released: string;
  delivery_status: string;
  releases: StockRelease[];
}

const ReleaseStock = () => {
  const { items, releases, releaseStockBatch, loading } = useInventory();
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [releaseItems, setReleaseItems] = useState<ReleaseItem[]>([
    { id: crypto.randomUUID(), itemId: '', boxes: 1 }
  ]);
  const [destination, setDestination] = useState('');
  const [courier, setCourier] = useState('');
  const [remarks, setRemarks] = useState('');
  const [notes, setNotes] = useState('');
  const [allocationBill, setAllocationBill] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [selectedBill, setSelectedBill] = useState<AllocationBillGroup | null>(null);
  
  // Import Excel state
  const [importing, setImporting] = useState(false);
  const [parsedItems, setParsedItems] = useState<ParsedReleaseItem[]>([]);
  const [showImportPreview, setShowImportPreview] = useState(false);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const validItems = releaseItems.filter(r => r.itemId && r.boxes > 0);
    
    if (validItems.length === 0 || !destination) {
      toast({ title: 'Error', description: 'Please add at least one item and destination', variant: 'destructive' });
      return;
    }

    for (const releaseItem of validItems) {
      const itemData = getItemData(releaseItem.itemId);
      if (itemData && releaseItem.boxes > itemData.available_stock) {
        toast({ title: 'Error', description: `Not enough stock for ${itemData.item_name}`, variant: 'destructive' });
        return;
      }
    }

    setSubmitting(true);
    try {
      await releaseStockBatch(
        validItems.map(r => ({ itemId: r.itemId, boxes: r.boxes })),
        destination,
        user!.id,
        notes || undefined,
        courier || undefined,
        allocationBill || undefined
      );
      toast({ title: 'Success', description: `${validItems.length} item(s) released successfully` });
      setReleaseItems([{ id: crypto.randomUUID(), itemId: '', boxes: 1 }]);
      setDestination('');
      setCourier('');
      setRemarks('');
      setNotes('');
      setAllocationBill('');
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

      // Parse rows into release items
      const parsed: ParsedReleaseItem[] = rows.map((row, index) => {
        const sheetNo = findColumnValue(row, 'Sheet No.', 'Sheet No', 'SHEET NO', 'Sheet', 'SheetNo', 'Item Code', 'ItemCode', 'Code');
        const boxes = findNumericValue(row, 'Boxes', 'Box', 'BOX', 'BOXES', 'Qty', 'Quantity');
        const dest = findColumnValue(row, 'Destination', 'DESTINATION', 'Deliver To', 'DeliverTo', 'Branch');
        const cour = findColumnValue(row, 'Courier', 'COURIER');
        const rem = findColumnValue(row, 'Remarks', 'REMARKS', 'Notes', 'NOTES');

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
          boxes,
          destination: dest,
          courier: cour,
          remarks: rem,
          matchedItemId: matchedItem?.id || null,
          matchedItemName: matchedItem?.item_name || null,
        };
      }).filter(item => item.sheetNo || item.boxes > 0);

      if (parsed.length === 0) {
        toast({ title: 'No Items Found', description: 'Check column headers (Sheet No., Boxes, Destination, Courier, Remarks).', variant: 'destructive' });
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
    const validItems = parsedItems.filter(p => p.matchedItemId && p.boxes > 0);
    
    if (validItems.length === 0) {
      toast({ title: 'Error', description: 'No valid items with matched inventory to release', variant: 'destructive' });
      return;
    }

    // Check stock availability
    for (const item of validItems) {
      const inventoryItem = items.find(i => i.id === item.matchedItemId);
      if (inventoryItem && item.boxes > inventoryItem.available_stock) {
        toast({ title: 'Error', description: `Not enough stock for ${item.sheetNo}`, variant: 'destructive' });
        return;
      }
    }

    setSubmitting(true);
    try {
      // Group by destination and courier
      const groups = validItems.reduce((acc, item) => {
        const key = `${item.destination || 'Unknown'}__${item.courier || ''}`;
        if (!acc[key]) acc[key] = [];
        acc[key].push(item);
        return acc;
      }, {} as Record<string, ParsedReleaseItem[]>);

      for (const [key, groupItems] of Object.entries(groups)) {
        const [dest, cour] = key.split('__');
        await releaseStockBatch(
          groupItems.map(r => ({ itemId: r.matchedItemId!, boxes: r.boxes })),
          dest,
          user!.id,
          groupItems[0]?.remarks || undefined,
          cour || undefined,
          undefined
        );
      }

      toast({ title: 'Success', description: `${validItems.length} item(s) released from import` });
      setParsedItems([]);
      setShowImportPreview(false);
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to release stock from import', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const cancelImport = () => {
    setParsedItems([]);
    setShowImportPreview(false);
  };

  // Group releases by batch_id for allocation bills
  const allocationBills: AllocationBillGroup[] = Object.values(
    releases.reduce((acc, release) => {
      const key = release.batch_id || release.id;
      if (!acc[key]) {
        acc[key] = {
          batch_id: key,
          destination: release.destination,
          date_released: release.date_released,
          delivery_status: release.delivery_status,
          courier: release.courier,
          allocation_bill: release.allocation_bill,
          releases: []
        };
      }
      acc[key].releases.push(release);
      return acc;
    }, {} as Record<string, AllocationBillGroup>)
  ).sort((a, b) => new Date(b.date_released).getTime() - new Date(a.date_released).getTime());

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
              <h2 className="text-lg font-semibold">Import from Excel</h2>
              <p className="text-sm text-muted-foreground">Upload Excel with: Sheet No., Boxes, Destination, Courier, Remarks</p>
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
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">
                Preview: {parsedItems.length} items found, {parsedItems.filter(p => p.matchedItemId).length} matched
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={cancelImport}>
                  Cancel
                </Button>
                <Button 
                  size="sm" 
                  onClick={handleConfirmImport}
                  disabled={submitting || parsedItems.filter(p => p.matchedItemId).length === 0}
                >
                  {submitting ? 'Releasing...' : `Release ${parsedItems.filter(p => p.matchedItemId).length} Items`}
                </Button>
              </div>
            </div>
            <div className="rounded-lg border overflow-hidden max-h-64 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sheet No.</TableHead>
                    <TableHead>Matched Item</TableHead>
                    <TableHead>Boxes</TableHead>
                    <TableHead>Destination</TableHead>
                    <TableHead>Courier</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono">{item.sheetNo || '-'}</TableCell>
                      <TableCell>{item.matchedItemName || <span className="text-destructive">Not found</span>}</TableCell>
                      <TableCell>{item.boxes}</TableCell>
                      <TableCell>{item.destination || '-'}</TableCell>
                      <TableCell>{item.courier || '-'}</TableCell>
                      <TableCell>
                        {item.matchedItemId ? (
                          <span className="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                            Ready
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                            No Match
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
            <h2 className="text-lg font-semibold">Release Stock</h2>
            <p className="text-sm text-muted-foreground">Allocate multiple items for delivery</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Items to Release *</Label>
              <Button type="button" variant="outline" size="sm" onClick={addReleaseItem}>
                <Plus className="h-4 w-4 mr-1" /> Add Item
              </Button>
            </div>

            <div className="space-y-3">
              {releaseItems.map((releaseItem, index) => {
                const itemData = getItemData(releaseItem.itemId);
                return (
                  <div key={releaseItem.id} className="flex gap-3 items-start p-3 rounded-lg bg-muted/30 border">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary mt-1">
                      {index + 1}
                    </span>
                    <div className="flex-1 grid grid-cols-[1fr,120px] gap-3">
                      <Select value={releaseItem.itemId} onValueChange={(val) => updateReleaseItem(releaseItem.id, 'itemId', val)}>
                        <SelectTrigger><SelectValue placeholder="Choose an item" /></SelectTrigger>
                        <SelectContent>
                          {getAvailableItems(releaseItem.itemId).map((item) => (
                            <SelectItem key={item.id} value={item.id}>
                              {item.item_name} ({item.available_stock} available)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input 
                        type="number" 
                        min={1} 
                        max={itemData?.available_stock || 999} 
                        value={releaseItem.boxes} 
                        onChange={(e) => updateReleaseItem(releaseItem.id, 'boxes', parseInt(e.target.value) || 0)}
                        placeholder="Boxes"
                      />
                    </div>
                    <Button 
                      type="button" 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => removeReleaseItem(releaseItem.id)}
                      disabled={releaseItems.length === 1}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Destination *</Label>
            <Input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Store / Branch / Customer" />
          </div>

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
                <SelectItem value="SM DEC">SM DEC</SelectItem>
                <SelectItem value="PRIETO">PRIETO</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Remarks</Label>
            <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Remarks / reference" />
          </div>

          <div className="space-y-2">
            <Label>Notes (Optional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Additional notes..." />
          </div>

          <div className="space-y-2">
            <Label>Allocation Bill</Label>
            <Input value={allocationBill} onChange={(e) => setAllocationBill(e.target.value)} placeholder="Allocation bill number" />
          </div>

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Processing...' : `Release ${releaseItems.filter(r => r.itemId).length} Item(s)`}
          </Button>
        </form>
      </div>

      {/* Allocation Bills Section */}
      <div className="rounded-xl border bg-card p-6 shadow-sm animate-fade-in">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Allocation Bills</h2>
            <p className="text-sm text-muted-foreground">Recent stock releases and allocation bills</p>
          </div>
        </div>

        {allocationBills.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No allocation bills yet</p>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Allocation Bill</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead>Courier</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Total Boxes</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allocationBills.slice(0, 10).map((bill) => {
                  const totalQty = bill.releases.length;
                  const totalBoxes = bill.releases.reduce((sum, r) => sum + r.boxes_released, 0);
                  return (
                    <TableRow key={bill.batch_id}>
                      <TableCell className="font-medium">
                        {format(new Date(bill.date_released), 'MMM dd, yyyy')}
                      </TableCell>
                      <TableCell>{bill.allocation_bill || '-'}</TableCell>
                      <TableCell>{bill.destination}</TableCell>
                      <TableCell>{bill.courier || '-'}</TableCell>
                      <TableCell>{totalQty}</TableCell>
                      <TableCell>{totalBoxes}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                          bill.delivery_status === 'delivered' 
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : bill.delivery_status === 'out_for_delivery'
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                            : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                        }`}>
                          {bill.delivery_status.replace('_', ' ')}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => setSelectedBill(bill)}>
                          <FileText className="h-4 w-4 mr-1" /> View
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {selectedBill && (
        <AllocationBillModal
          open={!!selectedBill}
          onOpenChange={(open) => !open && setSelectedBill(null)}
          releases={selectedBill.releases}
          destination={selectedBill.destination}
          courier={selectedBill.courier}
          dateReleased={selectedBill.date_released}
        />
      )}
    </div>
  );
};

export default ReleaseStock;
