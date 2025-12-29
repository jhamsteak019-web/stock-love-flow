import { useState, useRef } from 'react';
import { Camera, Upload, X, Loader2, RotateCw, ZoomIn, ZoomOut, RotateCcw, Save, Type, Copy, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';

interface CollectionPhotoCellProps {
  itemId: string;
  photoUrl: string | null;
  itemName?: string;
  onPhotoUpdate: () => void;
}

// Extract base code and variant info from item name
// Pattern 1: "2026MCXSH6527505-01 43" → base: "2026MCXSH6527505", color: "01", size: "43"
// Pattern 2: "2026MCXUM6555005-23" → base: "2026MCXUM6555005", color: "23", size: null
const parseItemName = (name: string) => {
  // Match pattern: BASECODE-COLOR SIZE or BASECODE-COLOR
  const match = name.match(/^(.+)-(\d{2})\s*(\d+)?$/);
  if (match) {
    return {
      baseCode: match[1],
      colorCode: match[2],
      sizeCode: match[3] || null,
      fullColorCode: `${match[1]}-${match[2]}`, // e.g., "2026MCXSH6527505-01"
    };
  }
  return null;
};

export const CollectionPhotoCell = ({ itemId, photoUrl, itemName, onPhotoUpdate }: CollectionPhotoCellProps) => {
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [overlayText, setOverlayText] = useState('');
  const [showTextBox, setShowTextBox] = useState(false);
  const [textPosition, setTextPosition] = useState({ x: 50, y: 90 });
  const [isDragging, setIsDragging] = useState(false);
  const [appliedCount, setAppliedCount] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const { userRole } = useAuth();
  
  const canEdit = userRole === 'admin' || userRole === 'staff';
  
  // Parse item name to get variant info
  const parsedName = itemName ? parseItemName(itemName) : null;

  // Apply photo to similar items (same color, all sizes)
  const applyToSameColor = async () => {
    if (!photoUrl || !parsedName?.sizeCode) return;
    
    setIsApplying(true);
    setAppliedCount(null);
    
    try {
      // Find all items with same base code + color (different sizes)
      // Pattern: "2026MCXSH6527505-01" matches "2026MCXSH6527505-01 XX"
      const colorPattern = `${parsedName.fullColorCode} %`;
      
      const { data: matchingItems, error: fetchError } = await supabase
        .from('collection_items')
        .select('id, item_name')
        .like('item_name', colorPattern)
        .neq('id', itemId);
      
      if (fetchError) throw fetchError;
      
      if (!matchingItems || matchingItems.length === 0) {
        toast.info('No other items with the same color found');
        setIsApplying(false);
        return;
      }
      
      // Update all matching items with the same photo
      const { error: updateError } = await supabase
        .from('collection_items')
        .update({ photo_url: photoUrl })
        .in('id', matchingItems.map(item => item.id));
      
      if (updateError) throw updateError;
      
      setAppliedCount(matchingItems.length);
      toast.success(`Photo applied to ${matchingItems.length} items (same color)`);
      onPhotoUpdate();
    } catch (error: any) {
      console.error('Apply to same color error:', error);
      toast.error(error.message || 'Failed to apply photo');
    } finally {
      setIsApplying(false);
    }
  };

  // Apply photo to all variants (all colors and sizes)
  const applyToAllVariants = async () => {
    if (!photoUrl || !parsedName) return;
    
    setIsApplying(true);
    setAppliedCount(null);
    
    try {
      // Find all items with same base code
      // Pattern: "2026MCXSH6527505" matches "2026MCXSH6527505-XX" or "2026MCXSH6527505-XX YY"
      const basePattern = `${parsedName.baseCode}-%`;
      
      const { data: matchingItems, error: fetchError } = await supabase
        .from('collection_items')
        .select('id, item_name')
        .like('item_name', basePattern)
        .neq('id', itemId);
      
      if (fetchError) throw fetchError;
      
      if (!matchingItems || matchingItems.length === 0) {
        toast.info('No other variants found');
        setIsApplying(false);
        return;
      }
      
      // Update all matching items with the same photo
      const { error: updateError } = await supabase
        .from('collection_items')
        .update({ photo_url: photoUrl })
        .in('id', matchingItems.map(item => item.id));
      
      if (updateError) throw updateError;
      
      setAppliedCount(matchingItems.length);
      toast.success(`Photo applied to ${matchingItems.length} items (all variants)`);
      onPhotoUpdate();
    } catch (error: any) {
      console.error('Apply to all variants error:', error);
      toast.error(error.message || 'Failed to apply photo');
    } finally {
      setIsApplying(false);
    }
  };


  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be less than 5MB');
      return;
    }

    setIsUploading(true);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${itemId}-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('collection-photos')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('collection-photos')
        .getPublicUrl(fileName);

      const { error: updateError } = await supabase
        .from('collection_items')
        .update({ photo_url: publicUrl })
        .eq('id', itemId);

      if (updateError) throw updateError;

      toast.success('Photo uploaded');
      onPhotoUpdate();
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error(error.message || 'Failed to upload');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemovePhoto = async () => {
    try {
      const { error } = await supabase
        .from('collection_items')
        .update({ photo_url: null })
        .eq('id', itemId);

      if (error) throw error;
      
      toast.success('Photo removed');
      onPhotoUpdate();
    } catch (error: any) {
      console.error('Remove photo error:', error);
      toast.error(error.message || 'Failed to remove photo');
    }
  };

  const handleRotateRight = () => setRotation((prev) => (prev + 90) % 360);
  const handleRotateLeft = () => setRotation((prev) => (prev - 90 + 360) % 360);
  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.25, 0.5));

  const resetTransforms = () => {
    setRotation(0);
    setZoom(1);
    setOverlayText('');
    setShowTextBox(false);
    setTextPosition({ x: 50, y: 90 });
  };

  const handleSaveWithText = async () => {
    if (!photoUrl) return;

    setIsSaving(true);

    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = photoUrl;
      });

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Failed to get canvas context');

      const isRotated90or270 = rotation === 90 || rotation === 270;
      canvas.width = isRotated90or270 ? img.height : img.width;
      canvas.height = isRotated90or270 ? img.width : img.height;

      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);

      ctx.setTransform(1, 0, 0, 1, 0, 0);

      if (overlayText.trim()) {
        const textX = (textPosition.x / 100) * canvas.width;
        const textY = (textPosition.y / 100) * canvas.height;
        
        const fontSize = Math.max(24, Math.min(canvas.width, canvas.height) * 0.04);
        
        ctx.font = `bold ${fontSize}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        const textMetrics = ctx.measureText(overlayText);
        const padding = fontSize * 0.4;
        const bgWidth = textMetrics.width + padding * 2;
        const bgHeight = fontSize + padding;
        
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(textX - bgWidth / 2, textY - bgHeight / 2, bgWidth, bgHeight);
        
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(overlayText, textX, textY);
      }

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => {
          if (b) resolve(b);
          else reject(new Error('Failed to create blob'));
        }, 'image/jpeg', 0.9);
      });

      const fileName = `${itemId}-${Date.now()}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from('collection-photos')
        .upload(fileName, blob, { upsert: true, contentType: 'image/jpeg' });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('collection-photos')
        .getPublicUrl(fileName);

      const { error: updateError } = await supabase
        .from('collection_items')
        .update({ photo_url: publicUrl })
        .eq('id', itemId);

      if (updateError) throw updateError;

      toast.success(overlayText.trim() ? `Image saved with text: ${overlayText}` : 'Image saved');
      
      resetTransforms();
      onPhotoUpdate();
    } catch (error: any) {
      console.error('Save error:', error);
      toast.error(error.message || 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!showTextBox || !imageContainerRef.current) return;
    setIsDragging(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !imageContainerRef.current) return;
    
    const rect = imageContainerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    
    setTextPosition({
      x: Math.max(10, Math.min(90, x)),
      y: Math.max(10, Math.min(90, y))
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleDialogOpen = () => {
    if (itemName) {
      setOverlayText(itemName);
      setShowTextBox(true);
    }
    setPreviewOpen(true);
  };

  const handleDialogClose = (open: boolean) => {
    if (!open) resetTransforms();
    setPreviewOpen(open);
  };

  const hasChanges = rotation !== 0 || (showTextBox && overlayText.trim());

  return (
    <div className="flex items-center">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept="image/*"
        className="hidden"
      />
      
      {photoUrl ? (
        <div className="relative group">
          <button
            onClick={handleDialogOpen}
            className="w-9 h-9 rounded-lg overflow-hidden border-2 border-primary/30 hover:border-primary transition-all duration-200 hover:scale-105"
          >
            <img src={photoUrl} alt="Collection item" className="w-full h-full object-cover" />
          </button>
          {canEdit && (
            <button
              onClick={(e) => { e.stopPropagation(); handleRemovePhoto(); }}
              className="absolute -top-1 -right-1 w-4 h-4 bg-destructive text-destructive-foreground rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading || !canEdit}
          className={cn(
            "w-9 h-9 rounded-lg border-2 border-dashed border-muted-foreground/30 hover:border-primary hover:bg-primary/5 transition-all duration-200",
            isUploading && "opacity-50"
          )}
        >
          {isUploading ? (
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
          ) : (
            <Camera className="w-4 h-4 text-muted-foreground" />
          )}
        </Button>
      )}

      <Dialog open={previewOpen} onOpenChange={handleDialogClose}>
        <DialogContent className="sm:max-w-[750px]">
          <DialogHeader>
            <DialogTitle>Collection Photo</DialogTitle>
          </DialogHeader>
          
          {/* Image Controls */}
          {canEdit && (
            <div className="flex items-center justify-between gap-2 py-2 border-b flex-wrap">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleRotateLeft} title="Rotate Left">
                  <RotateCcw className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={handleRotateRight} title="Rotate Right">
                  <RotateCw className="w-4 h-4" />
                </Button>
                <div className="w-px h-6 bg-border mx-1" />
                <Button variant="outline" size="sm" onClick={handleZoomOut} disabled={zoom <= 0.5} title="Zoom Out">
                  <ZoomOut className="w-4 h-4" />
                </Button>
                <span className="text-sm font-medium w-14 text-center">{Math.round(zoom * 100)}%</span>
                <Button variant="outline" size="sm" onClick={handleZoomIn} disabled={zoom >= 3} title="Zoom In">
                  <ZoomIn className="w-4 h-4" />
                </Button>
                <div className="w-px h-6 bg-border mx-1" />
                <Button 
                  variant={showTextBox ? "default" : "outline"} 
                  size="sm" 
                  onClick={() => setShowTextBox(!showTextBox)} 
                  title="Add Text Overlay"
                >
                  <Type className="w-4 h-4 mr-1" />
                  Text
                </Button>
                <div className="w-px h-6 bg-border mx-1" />
                <Button variant="ghost" size="sm" onClick={resetTransforms} title="Reset">
                  Reset
                </Button>
              </div>
            </div>
          )}

          {/* Text Input */}
          {showTextBox && canEdit && (
            <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
              <Input
                placeholder="Enter text overlay..."
                value={overlayText}
                onChange={(e) => setOverlayText(e.target.value)}
                className="flex-1"
              />
              <span className="text-xs text-muted-foreground">Drag text on image to position</span>
            </div>
          )}
          
          {/* Image Preview */}
          <div 
            ref={imageContainerRef}
            className="relative overflow-auto max-h-[55vh] flex items-center justify-center bg-muted/30 rounded-lg p-4 select-none"
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            {photoUrl && (
              <div className="relative">
                <img 
                  src={photoUrl} 
                  alt="Collection item" 
                  className="max-w-full rounded-lg transition-transform duration-200"
                  style={{ 
                    transform: `rotate(${rotation}deg) scale(${zoom})`,
                    transformOrigin: 'center center'
                  }}
                  draggable={false}
                />
                {/* Text overlay preview */}
                {showTextBox && overlayText.trim() && (
                  <div
                    className={cn(
                      "absolute px-3 py-1.5 bg-black/70 text-white font-bold rounded cursor-move select-none transition-shadow",
                      isDragging && "shadow-lg ring-2 ring-primary"
                    )}
                    style={{
                      left: `${textPosition.x}%`,
                      top: `${textPosition.y}%`,
                      transform: 'translate(-50%, -50%)',
                      fontSize: '14px'
                    }}
                    onMouseDown={handleMouseDown}
                  >
                    {overlayText}
                  </div>
                )}
              </div>
            )}
          </div>
          
          {/* Action Buttons */}
          {canEdit && (
            <div className="flex justify-between items-center pt-2 border-t gap-2">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Replace Photo
                </Button>
                
                {/* Apply to Similar Items Dropdown */}
                {parsedName && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isApplying}
                      >
                        {isApplying ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : appliedCount !== null ? (
                          <CheckCircle2 className="w-4 h-4 mr-2 text-green-500" />
                        ) : (
                          <Copy className="w-4 h-4 mr-2" />
                        )}
                        Apply to Similar
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      {parsedName.sizeCode && (
                        <DropdownMenuItem onClick={applyToSameColor}>
                          <div className="flex flex-col">
                            <span className="font-medium">Same Color (All Sizes)</span>
                            <span className="text-xs text-muted-foreground">
                              Apply to all {parsedName.fullColorCode} sizes
                            </span>
                          </div>
                        </DropdownMenuItem>
                      )}
                      {parsedName.sizeCode && <DropdownMenuSeparator />}
                      <DropdownMenuItem onClick={applyToAllVariants}>
                        <div className="flex flex-col">
                          <span className="font-medium">All Variants</span>
                          <span className="text-xs text-muted-foreground">
                            Apply to all {parsedName.baseCode} colors & sizes
                          </span>
                        </div>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
              
              <Button
                onClick={handleSaveWithText}
                disabled={isSaving || !hasChanges}
                size="sm"
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Save Changes
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
