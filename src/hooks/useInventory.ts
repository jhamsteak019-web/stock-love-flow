import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { InventoryItem, Category, StockRelease, DashboardStats, DeliveryStatus } from '@/types/inventory';
import { useToast } from '@/hooks/use-toast';

export const useInventory = () => {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [releases, setReleases] = useState<StockRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchItems = async () => {
    try {
      const { data, error } = await supabase
        .from('inventory_items')
        .select(`
          *,
          category:categories(*)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setItems(data || []);
    } catch (error) {
      console.error('Error fetching items:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch inventory items',
        variant: 'destructive',
      });
    }
  };

  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('name');

      if (error) throw error;
      setCategories(data || []);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const fetchReleases = async () => {
    try {
      const { data, error } = await supabase
        .from('stock_releases')
        .select(`
          *,
          inventory_item:inventory_items(*)
        `)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setReleases(data || []);
    } catch (error) {
      console.error('Error fetching releases:', error);
    }
  };

  const fetchDeletedReleases = async () => {
    try {
      const { data, error } = await supabase
        .from('stock_releases')
        .select(`
          *,
          inventory_item:inventory_items(*)
        `)
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching deleted releases:', error);
      return [];
    }
  };

  const fetchAll = async () => {
    setLoading(true);
    await Promise.all([fetchItems(), fetchCategories(), fetchReleases()]);
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const addCategory = async (name: string) => {
    const { data, error } = await supabase
      .from('categories')
      .insert({ name })
      .select()
      .single();

    if (error) throw error;
    setCategories([...categories, data]);
    return data;
  };

  const addItem = async (item: Partial<InventoryItem>) => {
    const price = item.price || 0;
    const totalStock = item.total_stock || 0;
    const amount = item.amount || 0;
    
    // Generate a unique item_code with timestamp and random suffix to avoid duplicates
    const uniqueCode = item.item_code || `ITEM-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const insertData = {
      item_name: item.item_name || uniqueCode,
      item_code: uniqueCode,
      category_id: item.category_id || null,
      total_stock: totalStock,
      available_stock: totalStock,
      price: price,
      amount: amount,
      supplier: item.supplier || null,
      low_stock_threshold: item.low_stock_threshold || 10,
      created_by: item.created_by,
      year: item.year || null,
      upc: item.upc || null,
      description: item.description || null,
      branch: item.branch || null,
      pieces_per_box: item.pieces_per_box || 1,
      date_received: (item.date_received && item.date_received.trim() !== '') ? item.date_received : null,
    };
    
    const { data, error } = await supabase
      .from('inventory_items')
      .insert(insertData)
      .select(`*, category:categories(*)`)
      .single();

    if (error) throw error;
    setItems([data, ...items]);
    return data;
  };

  const deleteAllItems = async () => {
    const { error } = await supabase
      .from('inventory_items')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (error) throw error;
    setItems([]);
  };

  const updateItem = async (id: string, updates: Partial<InventoryItem>) => {
    const { data, error } = await supabase
      .from('inventory_items')
      .update(updates)
      .eq('id', id)
      .select(`*, category:categories(*)`)
      .single();

    if (error) throw error;
    setItems(items.map(item => item.id === id ? data : item));
    return data;
  };

  const deleteItem = async (id: string) => {
    const { error } = await supabase
      .from('inventory_items')
      .delete()
      .eq('id', id);

    if (error) throw error;
    setItems(items.filter(item => item.id !== id));
  };

  const releaseStock = async (
    itemId: string, 
    boxesReleased: number, 
    destination: string, 
    releasedBy: string,
    notes?: string
  ) => {
    const { data, error } = await supabase
      .from('stock_releases')
      .insert({
        item_id: itemId,
        boxes_released: boxesReleased,
        destination,
        released_by: releasedBy,
        notes,
      })
      .select(`*, inventory_item:inventory_items(*)`)
      .single();

    if (error) throw error;
    
    // Refresh items to get updated stock
    await fetchItems();
    setReleases([data, ...releases]);
    return data;
  };

  const releaseStockBatch = async (
    items: { itemId: string; boxes: number }[],
    destination: string,
    releasedBy: string,
    notes?: string,
    courier?: string,
    allocationBill?: string,
    category?: string,
    waybillNo?: string,
    setDate?: string,
    totalQty?: number
  ) => {
    const batchId = crypto.randomUUID();
    
    const insertData = items.map(item => ({
      item_id: item.itemId && item.itemId.trim() !== '' ? item.itemId : null,
      boxes_released: item.boxes,
      destination,
      released_by: releasedBy,
      notes,
      courier,
      allocation_bill: allocationBill,
      batch_id: batchId,
      category: category || null,
      waybill_no: waybillNo || null,
      set_date: setDate || null,
      total_qty: totalQty || null,
    }));

    const { data, error } = await supabase
      .from('stock_releases')
      .insert(insertData)
      .select(`*, inventory_item:inventory_items(*)`);

    if (error) throw error;
    
    // Refresh items to get updated stock
    await fetchItems();
    setReleases([...(data || []), ...releases]);
    return data;
  };

  const updateDeliveryStatus = async (releaseId: string, status?: DeliveryStatus, dateDelivered?: string) => {
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (status) {
      updates.delivery_status = status;
    }
    if (dateDelivered && dateDelivered.trim() !== '') {
      updates.date_delivered = dateDelivered;
    }

    const { data, error } = await supabase
      .from('stock_releases')
      .update(updates)
      .eq('id', releaseId)
      .select(`*, inventory_item:inventory_items(*)`)
      .single();

    if (error) {
      console.error('Update delivery status error:', error);
      throw error;
    }
    setReleases(releases.map(r => r.id === releaseId ? data : r));
    return data;
  };

  const getStats = (): DashboardStats => {
    const totalItems = items.length;
    const totalStock = items.reduce((sum, item) => sum + item.available_stock, 0);
    const lowStockItems = items.filter(item => item.available_stock <= item.low_stock_threshold).length;
    const pendingDeliveries = releases.filter(r => r.delivery_status === 'pending').length;
    const inTransitDeliveries = releases.filter(r => r.delivery_status === 'out_for_delivery').length;
    const deliveredCount = releases.filter(r => r.delivery_status === 'delivered').length;

    return {
      totalItems,
      totalStock,
      lowStockItems,
      pendingDeliveries,
      inTransitDeliveries,
      deliveredCount,
    };
  };

  const deleteRelease = async (releaseId: string) => {
    // Soft delete - set deleted_at timestamp
    const { error } = await supabase
      .from('stock_releases')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', releaseId);

    if (error) throw error;
    setReleases(releases.filter(r => r.id !== releaseId));
    await fetchItems();
  };

  const deleteReleaseBatch = async (batchId: string) => {
    // Soft delete - set deleted_at timestamp
    const { error } = await supabase
      .from('stock_releases')
      .update({ deleted_at: new Date().toISOString() })
      .eq('batch_id', batchId);

    if (error) throw error;
    setReleases(releases.filter(r => r.batch_id !== batchId));
    await fetchItems();
  };

  const deleteAllReleases = async () => {
    // Soft delete - set deleted_at timestamp
    const { error } = await supabase
      .from('stock_releases')
      .update({ deleted_at: new Date().toISOString() })
      .is('deleted_at', null);

    if (error) throw error;
    setReleases([]);
    await fetchItems();
  };

  const restoreReleaseBatch = async (batchId: string) => {
    const { error } = await supabase
      .from('stock_releases')
      .update({ deleted_at: null })
      .eq('batch_id', batchId);

    if (error) throw error;
    await fetchReleases();
    await fetchItems();
  };

  const permanentlyDeleteBatch = async (batchId: string) => {
    const { error } = await supabase
      .from('stock_releases')
      .delete()
      .eq('batch_id', batchId);

    if (error) throw error;
  };

  const permanentlyDeleteAllDeleted = async () => {
    const { error } = await supabase
      .from('stock_releases')
      .delete()
      .not('deleted_at', 'is', null);

    if (error) throw error;
  };

  const updateDeliveryDateBatch = async (batchId: string, dateDelivered: string) => {
    const { error } = await supabase
      .from('stock_releases')
      .update({ date_delivered: dateDelivered })
      .eq('batch_id', batchId);

    if (error) throw error;
    await fetchReleases();
  };

  const bulkUpdateStock = async (stockValue: number) => {
    // Update all items to have the specified stock value
    const { error } = await supabase
      .from('inventory_items')
      .update({ 
        total_stock: stockValue, 
        available_stock: stockValue 
      })
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Update all

    if (error) throw error;
    
    // Refresh items to get updated values
    await fetchItems();
  };

  return {
    items,
    categories,
    releases,
    loading,
    fetchAll,
    fetchItems,
    fetchReleases,
    fetchDeletedReleases,
    addCategory,
    addItem,
    updateItem,
    deleteItem,
    deleteAllItems,
    releaseStock,
    releaseStockBatch,
    updateDeliveryStatus,
    deleteRelease,
    deleteReleaseBatch,
    deleteAllReleases,
    restoreReleaseBatch,
    permanentlyDeleteBatch,
    permanentlyDeleteAllDeleted,
    updateDeliveryDateBatch,
    getStats,
    bulkUpdateStock,
  };
};
