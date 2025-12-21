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
        .order('created_at', { ascending: false });

      if (error) throw error;
      setReleases(data || []);
    } catch (error) {
      console.error('Error fetching releases:', error);
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
    const insertData = {
      item_name: item.item_name!,
      item_code: item.item_code!,
      category_id: item.category_id,
      total_stock: item.total_stock || 0,
      available_stock: item.total_stock || 0,
      supplier: item.supplier,
      date_received: item.date_received,
      low_stock_threshold: item.low_stock_threshold || 10,
      created_by: item.created_by,
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
    notes?: string
  ) => {
    const batchId = crypto.randomUUID();
    
    const insertData = items.map(item => ({
      item_id: item.itemId,
      boxes_released: item.boxes,
      destination,
      released_by: releasedBy,
      notes,
      batch_id: batchId,
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

  const updateDeliveryStatus = async (releaseId: string, status: DeliveryStatus) => {
    const updates: Record<string, unknown> = { delivery_status: status };
    if (status === 'delivered') {
      updates.date_delivered = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('stock_releases')
      .update(updates)
      .eq('id', releaseId)
      .select(`*, inventory_item:inventory_items(*)`)
      .single();

    if (error) throw error;
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

  return {
    items,
    categories,
    releases,
    loading,
    fetchAll,
    fetchItems,
    fetchReleases,
    addCategory,
    addItem,
    updateItem,
    deleteItem,
    releaseStock,
    releaseStockBatch,
    updateDeliveryStatus,
    getStats,
  };
};
