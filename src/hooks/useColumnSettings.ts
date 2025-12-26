import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { ColumnConfig } from '@/components/deliveries/ColumnSettings';
import { Json } from '@/integrations/supabase/types';

interface ColumnSettingsData {
  visibleColumns: string[];
  columnWidths: Record<string, number>;
}

export const useColumnSettings = (pageName: string, defaultColumns: ColumnConfig[]) => {
  const [columns, setColumns] = useState<ColumnConfig[]>(defaultColumns);
  const [loading, setLoading] = useState(true);
  const { userRole } = useAuth();
  const { toast } = useToast();
  const isAdmin = userRole === 'admin';

  // Fetch column settings from database
  const fetchSettings = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('column_settings')
        .select('settings')
        .eq('page_name', pageName)
        .maybeSingle();

      if (error) {
        console.error('Error fetching column settings:', error);
        setLoading(false);
        return;
      }

      if (data?.settings) {
        const settings = data.settings as unknown as ColumnSettingsData;
        const updatedColumns = defaultColumns.map(col => ({
          ...col,
          visible: settings.visibleColumns?.includes(col.key) ?? col.visible,
          width: settings.columnWidths?.[col.key] ?? col.width,
        }));
        setColumns(updatedColumns);
      }
    } catch (error) {
      console.error('Error fetching column settings:', error);
    } finally {
      setLoading(false);
    }
  }, [pageName, defaultColumns]);

  // Save column settings to database (admin only)
  const saveSettings = useCallback(async (newColumns: ColumnConfig[]) => {
    setColumns(newColumns);

    if (!isAdmin) return;

    const settings: ColumnSettingsData = {
      visibleColumns: newColumns.filter(c => c.visible).map(c => c.key),
      columnWidths: newColumns.reduce((acc, col) => {
        acc[col.key] = col.width;
        return acc;
      }, {} as Record<string, number>),
    };

    try {
      // Check if record exists
      const { data: existingData } = await supabase
        .from('column_settings')
        .select('id')
        .eq('page_name', pageName)
        .maybeSingle();

      if (existingData) {
        // Update existing record
        const { error } = await supabase
          .from('column_settings')
          .update({
            settings: settings as unknown as Json,
            updated_at: new Date().toISOString(),
          })
          .eq('page_name', pageName);

        if (error) {
          console.error('Error updating column settings:', error);
          toast({ title: 'Error', description: 'Failed to save column settings', variant: 'destructive' });
        }
      } else {
        // Insert new record
        const { error } = await supabase
          .from('column_settings')
          .insert([{
            page_name: pageName,
            settings: settings as unknown as Json,
            updated_at: new Date().toISOString(),
          }]);

        if (error) {
          console.error('Error inserting column settings:', error);
          toast({ title: 'Error', description: 'Failed to save column settings', variant: 'destructive' });
        }
      }
    } catch (error) {
      console.error('Error saving column settings:', error);
    }
  }, [pageName, isAdmin, toast]);

  // Subscribe to realtime updates
  useEffect(() => {
    fetchSettings();

    const channel = supabase
      .channel(`column_settings_${pageName}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'column_settings',
          filter: `page_name=eq.${pageName}`,
        },
        () => {
          // Refetch settings when they change
          fetchSettings();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [pageName, fetchSettings]);

  return {
    columns,
    setColumns: saveSettings,
    loading,
    isAdmin,
  };
};
