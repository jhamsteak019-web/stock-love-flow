import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Plus, FileSpreadsheet, Save, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Product {
  id: string;
  qty: number;
  coll: string;
  date: string;
  photoUrl?: string;
  category: string;
  price: number;
  colors: string[];
}

interface Store {
  id: string;
  name: string;
  isHeader?: boolean;
  isSubtotal?: boolean;
  highlight?: 'yellow' | 'green' | 'blue';
}

interface AllocationData {
  [storeId: string]: {
    [productColorKey: string]: number;
  };
}

const Allocation = () => {
  // Sample products data matching the image format
  const [products] = useState<Product[]>([
    {
      id: '1',
      qty: 800,
      coll: 'MLXHB5509006',
      date: '05-Nov',
      category: 'R6',
      price: 1500.00,
      colors: ['01', '19', '27'],
    },
    {
      id: '2',
      qty: 1000,
      coll: 'MLXHB5509006',
      date: '05-Nov',
      category: 'R6',
      price: 1500.00,
      colors: ['01', '19', '27'],
    },
    {
      id: '3',
      qty: 1000,
      coll: 'MLXHB5509006',
      date: '05-Nov',
      category: 'R6',
      price: 1500.00,
      colors: ['01', '19', '27'],
    },
    {
      id: '4',
      qty: 1000,
      coll: 'MLXHB5509016',
      date: '',
      category: 'R6',
      price: 1400.00,
      colors: ['01', '12', '19'],
    },
    {
      id: '5',
      qty: 800,
      coll: 'MLXHB5509016',
      date: '',
      category: 'R6',
      price: 1400.00,
      colors: ['01', '12', '19'],
    },
    {
      id: '6',
      qty: 800,
      coll: 'MLXHB5509016',
      date: '',
      category: 'R6',
      price: 1400.00,
      colors: ['01', '12', '19'],
    },
  ]);

  // Sample stores data
  const [stores] = useState<Store[]>([
    { id: 'rds-galleria-south', name: 'RDS Galleria South' },
    { id: 'rds-las-pinas', name: 'RDS Las Pinas' },
    { id: 'rds-galleria', name: 'RDS Galleria' },
    { id: 'rds-gen-trias', name: 'RDS Gen Trias' },
    { id: 'rds-bacolod', name: 'RDS Bacolod' },
    { id: 'rds-cebu-galleria', name: 'RDS Cebu Galleria' },
    { id: 'rds-cabanatuan', name: 'RDS Cabanatuan' },
    { id: 'rds-jaro', name: 'RDS Jaro' },
    { id: 'rds-gensan', name: 'RDS Gensan' },
    { id: 'rds-gapan', name: 'RDS Gapan' },
    { id: 'rds-cebu-fuente', name: 'RDS Cebu Fuente' },
    { id: 'rds-dagupan', name: 'RDS Dagupan' },
    { id: 'rds-pagadian', name: 'RDS PAGADIAN' },
    { id: 'subtotal-rds', name: '', isSubtotal: true },
    { id: 'metro-header', name: 'METRO', isHeader: true, highlight: 'yellow' },
    { id: 'market-market', name: 'Market-Market', highlight: 'yellow' },
    { id: 'metro-colon', name: 'Metro Colon', highlight: 'green' },
    { id: 'metro-ayala-cebu', name: 'Metro Ayala Cebu', highlight: 'blue' },
    { id: 'metro-mandaue', name: 'Metro Mandaue' },
    { id: 'metro-lucena', name: 'Metro Lucena' },
    { id: 'metro-legaspi', name: 'Metro Legaspi' },
    { id: 'metro-tacloban', name: 'Metro Tacloban' },
    { id: 'metro-bacolod', name: 'Metro Bacolod' },
    { id: 'metro-lapulapu', name: 'Metro LapuLapu' },
    { id: 'metro-ayala-feliz', name: 'Metro Ayala Feliz' },
    { id: 'metro-angeles', name: 'Metro Angeles' },
    { id: 'metro-alabang', name: 'Metro Alabang' },
    { id: 'metro-calbayog', name: 'Metro Calbayog' },
    { id: 'metro-danao', name: 'Metro Danao' },
    { id: 'metro-toledo', name: 'Metro Toledo' },
    { id: 'metro-carcar', name: 'Metro Carcar' },
    { id: 'metro-tagaytay', name: 'Metro Tagaytay' },
    { id: 'metro-bogo-cebu', name: 'Metro Bogo Cebu' },
    { id: 'metro-baybay', name: 'Metro Baybay' },
    { id: 'metro-imus-cavite', name: 'Metro Imus Cavite' },
    { id: 'metro-catbalogan', name: 'Metro Catbalogan' },
  ]);

  // Allocation data state
  const [allocations, setAllocations] = useState<AllocationData>({
    'rds-galleria-south': { '1-01': 2, '1-19': 2, '1-27': 2, '4-01': 2, '4-12': 2, '4-19': 2 },
    'rds-las-pinas': { '1-01': 3, '1-19': 2, '1-27': 2, '4-01': 3, '4-12': 3, '4-19': 3 },
    'rds-cebu-galleria': { '1-01': 2, '1-19': 2, '4-01': 0, '4-12': 0, '4-19': 0 },
    'rds-jaro': { '1-01': 3, '1-19': 2, '4-01': 0, '4-12': 0, '4-19': 0 },
    'rds-gensan': { '1-01': 2, '1-19': 2, '1-27': 2, '4-01': 0, '4-12': 2, '4-19': 2 },
    'rds-cebu-fuente': { '1-01': 2, '1-19': 2, '1-27': 2, '4-01': 2, '4-12': 2, '4-19': 0 },
  });

  const handleAllocationChange = (storeId: string, productColorKey: string, value: string) => {
    const numValue = parseInt(value) || 0;
    setAllocations(prev => ({
      ...prev,
      [storeId]: {
        ...prev[storeId],
        [productColorKey]: numValue,
      },
    }));
  };

  const getColumnTotal = (productIndex: number, colorIndex: number) => {
    const key = `${productIndex + 1}-${products[productIndex]?.colors[colorIndex]}`;
    return stores.reduce((sum, store) => {
      if (store.isHeader || store.isSubtotal) return sum;
      return sum + (allocations[store.id]?.[key] || 0);
    }, 0);
  };

  const getHighlightClass = (highlight?: string) => {
    switch (highlight) {
      case 'yellow':
        return 'bg-yellow-100';
      case 'green':
        return 'bg-green-100';
      case 'blue':
        return 'bg-blue-100';
      default:
        return '';
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Allocation</h1>
          <p className="text-muted-foreground">Manage product allocations per store</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button variant="outline" size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add Product
          </Button>
          <Button size="sm">
            <Save className="h-4 w-4 mr-2" />
            Save
          </Button>
        </div>
      </div>

      {/* Allocation Table */}
      <Card>
        <CardContent className="p-0">
          <ScrollArea className="w-full">
            <div className="min-w-max">
              <table className="w-full border-collapse text-sm">
                {/* Header rows */}
                <thead>
                  {/* QTY Row */}
                  <tr className="border-b">
                    <th className="border p-2 bg-muted/50 text-left w-48 sticky left-0 z-10"></th>
                    <th className="border p-2 bg-muted/50 font-medium text-left">QTY</th>
                    {products.map((product, idx) => (
                      <th 
                        key={`qty-${idx}`} 
                        colSpan={1}
                        className="border p-2 bg-muted/50 text-center font-medium"
                      >
                        {product.qty}
                      </th>
                    ))}
                  </tr>

                  {/* COLL Row */}
                  <tr className="border-b">
                    <th className="border p-2 bg-muted/50 text-left sticky left-0 z-10"></th>
                    <th className="border p-2 bg-muted/50 font-medium text-left">COLL</th>
                    {products.map((product, idx) => (
                      <th 
                        key={`coll-${idx}`}
                        className="border p-2 bg-muted/50 text-center font-medium text-xs"
                      >
                        {product.coll}
                      </th>
                    ))}
                  </tr>

                  {/* Date Row */}
                  <tr className="border-b">
                    <th className="border p-2 bg-muted/50 text-left sticky left-0 z-10"></th>
                    <th className="border p-2 bg-muted/50 font-medium text-left"></th>
                    {products.map((product, idx) => (
                      <th 
                        key={`date-${idx}`}
                        className="border p-2 bg-muted/50 text-center text-xs"
                      >
                        {product.date}
                      </th>
                    ))}
                  </tr>

                  {/* Photo Row */}
                  <tr className="border-b h-20">
                    <th className="border p-2 bg-muted/50 text-left sticky left-0 z-10"></th>
                    <th className="border p-2 bg-muted/50 font-medium text-left"></th>
                    {products.map((product, idx) => (
                      <th 
                        key={`photo-${idx}`}
                        className="border p-2 bg-muted/50 text-center"
                      >
                        {product.photoUrl ? (
                          <img 
                            src={product.photoUrl} 
                            alt={product.coll}
                            className="h-16 w-auto mx-auto object-contain"
                          />
                        ) : (
                          <div className="h-16 w-12 mx-auto bg-muted rounded flex items-center justify-center text-xs text-muted-foreground">
                            No img
                          </div>
                        )}
                      </th>
                    ))}
                  </tr>

                  {/* Category Row */}
                  <tr className="border-b">
                    <th className="border p-2 bg-muted/50 text-left sticky left-0 z-10"></th>
                    <th className="border p-2 bg-muted/50 font-medium text-left"></th>
                    {products.map((product, idx) => (
                      <th 
                        key={`cat-${idx}`}
                        className="border p-2 bg-muted/50 text-center font-medium"
                      >
                        {product.category}
                      </th>
                    ))}
                  </tr>

                  {/* Price Row */}
                  <tr className="border-b">
                    <th className="border p-2 bg-muted/50 text-left sticky left-0 z-10"></th>
                    <th className="border p-2 bg-muted/50 font-medium text-left text-red-600">PRICE</th>
                    {products.map((product, idx) => (
                      <th 
                        key={`price-${idx}`}
                        className="border p-2 bg-muted/50 text-center font-medium text-red-600"
                      >
                        {product.price.toFixed(2)}
                      </th>
                    ))}
                  </tr>

                  {/* Color Row */}
                  <tr className="border-b">
                    <th className="border p-2 bg-muted/50 text-left sticky left-0 z-10"></th>
                    <th className="border p-2 bg-muted/50 font-medium text-left text-blue-600">COLOR</th>
                    {products.map((product, idx) => (
                      <th 
                        key={`color-${idx}`}
                        className="border p-2 bg-muted/50 text-center font-medium text-blue-600"
                      >
                        {product.colors[0]}
                      </th>
                    ))}
                  </tr>
                </thead>

                {/* Store rows */}
                <tbody>
                  {stores.map((store, storeIdx) => (
                    <tr 
                      key={store.id} 
                      className={cn(
                        "border-b",
                        getHighlightClass(store.highlight),
                        store.isSubtotal && "bg-muted font-medium"
                      )}
                    >
                      <td className={cn(
                        "border p-2 text-left font-medium sticky left-0 z-10 bg-background",
                        getHighlightClass(store.highlight),
                        store.isSubtotal && "bg-muted",
                        store.isHeader && "font-bold"
                      )}>
                        {storeIdx + 1}
                      </td>
                      <td className={cn(
                        "border p-2 text-left",
                        getHighlightClass(store.highlight),
                        store.isSubtotal && "bg-muted",
                        store.isHeader && "font-bold"
                      )}>
                        {store.name}
                      </td>
                      {products.map((product, productIdx) => {
                        const key = `${productIdx + 1}-${product.colors[0]}`;
                        const value = allocations[store.id]?.[key] || 0;
                        
                        if (store.isHeader) {
                          return (
                            <td key={`${store.id}-${productIdx}`} className={cn("border p-2 text-center", getHighlightClass(store.highlight))}>
                            </td>
                          );
                        }
                        
                        if (store.isSubtotal) {
                          return (
                            <td key={`${store.id}-${productIdx}`} className="border p-2 text-center bg-muted font-medium">
                              {getColumnTotal(productIdx, 0)}
                            </td>
                          );
                        }
                        
                        return (
                          <td key={`${store.id}-${productIdx}`} className={cn("border p-1 text-center", getHighlightClass(store.highlight))}>
                            <Input
                              type="number"
                              min="0"
                              value={value || ''}
                              onChange={(e) => handleAllocationChange(store.id, key, e.target.value)}
                              className="h-7 w-14 text-center mx-auto p-1 text-sm"
                              placeholder="0"
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
};

export default Allocation;
