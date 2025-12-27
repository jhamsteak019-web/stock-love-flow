import { useState } from 'react';
import { Settings2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';

export type ColumnKey = 'photo' | 'allocation' | 'destination' | 'category' | 'totalBoxes' | 'totalQty' | 'dateOut' | 'status' | 'waybill' | 'remarks' | 'billDate';

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
  defaultColumns?: ColumnConfig[];
}

const ColumnSettings = ({ columns, onColumnChange, defaultColumns }: ColumnSettingsProps) => {
  const [open, setOpen] = useState(false);

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

  const handleReset = () => {
    if (defaultColumns) {
      onColumnChange([...defaultColumns]);
    }
  };

  const handleShowAll = () => {
    const updated = columns.map(col => ({ ...col, visible: true }));
    onColumnChange(updated);
  };

  const handleHideAll = () => {
    const updated = columns.map(col => ({ ...col, visible: false }));
    onColumnChange(updated);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Settings2 className="h-4 w-4" />
          Column Settings
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0" sideOffset={8}>
        <div className="bg-primary px-4 py-3 rounded-t-md">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-semibold text-primary-foreground">Column Settings</h4>
              <p className="text-xs text-primary-foreground/80">Customize table columns</p>
            </div>
            {defaultColumns && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleReset}
                className="h-8 w-8 text-primary-foreground hover:bg-primary-foreground/20"
                title="Reset to defaults"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        
        <ScrollArea className="max-h-[400px]">
          <div className="p-4 space-y-4">
            {/* Column Widths Section */}
            <div>
              <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                Column Widths
              </h5>
              <div className="space-y-4">
                {columns.filter(col => col.visible).map(col => (
                  <div key={col.key} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">{col.label}</Label>
                      <span className="text-xs text-muted-foreground font-mono bg-muted px-2 py-0.5 rounded">{col.width}px</span>
                    </div>
                    <Slider
                      value={[col.width]}
                      onValueChange={([value]) => handleWidthChange(col.key, value)}
                      min={col.minWidth}
                      max={col.maxWidth}
                      step={5}
                      className="w-full"
                    />
                  </div>
                ))}
                {columns.filter(col => col.visible).length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-2">No visible columns</p>
                )}
              </div>
            </div>

            <Separator />

            {/* Visibility Section */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Visibility
                </h5>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={handleShowAll} className="h-6 text-xs px-2">
                    Show All
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleHideAll} className="h-6 text-xs px-2">
                    Hide All
                  </Button>
                </div>
              </div>
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
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};

export default ColumnSettings;
