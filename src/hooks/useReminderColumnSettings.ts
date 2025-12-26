import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { ReminderColumnConfig } from '@/components/reminder/ColumnSettings';
import { Json } from '@/integrations/supabase/types';

interface ColumnSettingsData {
  visibleColumns: string[];
  columnWidths: Record<string, number>;
}

export const useReminderColumnSettings = (pageName: string, defaultColumns: ReminderColumnConfig[]) => {
  const [columns, setColumns] = useState<ReminderColumnConfig[]>(defaultColumns);
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
  const saveSettings = useCallback(async (newColumns: ReminderColumnConfig[]) => {
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
      // Use upsert to avoid race conditions
      const { error } = await supabase
        .from('column_settings')
        .upsert({
          page_name: pageName,
          settings: settings as unknown as Json,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'page_name'
        });

      if (error) {
        console.error('Error saving column settings:', error);
        toast({ title: 'Error', description: 'Failed to save column settings', variant: 'destructive' });
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