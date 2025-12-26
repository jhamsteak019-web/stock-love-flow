import { useState } from 'react';
import { Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';

export type ColumnKey = 'allocation' | 'destination' | 'category' | 'totalBoxes' | 'totalQty' | 'dateOut' | 'status' | 'waybill' | 'remarks';

export interface ColumnConfig {
  key: ColumnKey;
  label: string;
  visible: boolean;
  width: number;
  minWidth: number;
  maxWidth: number;
}

interface ColumnSettingsProps {
  columns: ColumnConfig[];
  onColumnChange: (columns: ColumnConfig[]) => void;
}

const ColumnSettings = ({ columns, onColumnChange }: ColumnSettingsProps) => {
  const handleVisibilityChange = (key: ColumnKey, visible: boolean) => {
    const updated = columns.map(col => 
      col.key === key ? { ...col, visible } : col
    );
    onColumnChange(updated);
  };

  const handleWidthChange = (key: ColumnKey, width: number) => {
    const updated = columns.map(col => 
      col.key === key ? { ...col, width } : col
    );
    onColumnChange(updated);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Settings2 className="h-4 w-4" />
          Column Settings
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="bg-primary px-4 py-3">
          <h4 className="font-semibold text-primary-foreground">Column Settings</h4>
          <p className="text-xs text-primary-foreground/80">Customize table columns</p>
        </div>
        
        <div className="p-4 space-y-4 max-h-[400px] overflow-y-auto">
          {/* Column Widths Section */}
          <div>
            <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Column Widths
            </h5>
            <div className="space-y-4">
              {columns.map(col => (
                <div key={col.key} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">{col.label}</Label>
                    <span className="text-xs text-muted-foreground font-mono">{col.width}px</span>
                  </div>
                  <Slider
                    value={[col.width]}
                    onValueChange={([value]) => handleWidthChange(col.key, value)}
                    min={col.minWidth}
                    max={col.maxWidth}
                    step={10}
                    className="w-full"
                  />
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* Visibility Section */}
          <div>
            <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Visibility
            </h5>
            <div className="grid grid-cols-2 gap-3">
              {columns.map(col => (
                <div key={col.key} className="flex items-center gap-2">
                  <Switch
                    id={`visibility-${col.key}`}
                    checked={col.visible}
                    onCheckedChange={(checked) => handleVisibilityChange(col.key, checked)}
                    className="scale-90"
                  />
                  <Label 
                    htmlFor={`visibility-${col.key}`} 
                    className="text-xs cursor-pointer"
                  >
                    {col.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default ColumnSettings;
