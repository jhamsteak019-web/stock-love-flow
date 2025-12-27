import { useState, useRef } from 'react';
import { Camera, Upload, X, Loader2, RotateCw, ZoomIn, ZoomOut, RotateCcw, Save, Type } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface PhotoUploadCellProps {
  batchId: string;
  photoUrl: string | null;
  currentAllocation?: string | null;
  onPhotoUpdate: () => void;
}

export const PhotoUploadCell = ({ batchId, photoUrl, currentAllocation, onPhotoUpdate }: PhotoUploadCellProps) => {
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [allocationText, setAllocationText] = useState('');
  const [showTextBox, setShowTextBox] = useState(false);
  const [textPosition, setTextPosition] = useState({ x: 50, y: 90 }); // percentage position
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({ title: 'Error', description: 'Please select an image file', variant: 'destructive' });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'Error', description: 'Image must be less than 5MB', variant: 'destructive' });
      return;
    }

    setIsUploading(true);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${batchId}-${Date.now()}.${fileExt}`;
      const filePath = `photos/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('delivery-photos')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('delivery-photos')
        .getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from('stock_releases')
        .update({ photo_url: publicUrl, photo_status: 'approved' })
        .eq('batch_id', batchId);

      if (updateError) throw updateError;

      toast({ title: 'Success', description: 'Photo uploaded' });
      onPhotoUpdate();
    } catch (error: any) {
      console.error('Upload error:', error);
      toast({ title: 'Error', description: error.message || 'Failed to upload', variant: 'destructive' });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemovePhoto = async () => {
    try {
      const { error, count } = await supabase
        .from('stock_releases')
        .update({ photo_url: null, photo_status: 'no_photo' })
        .eq('batch_id', batchId)
        .select();

      if (error) throw error;
      
      toast({ title: 'Success', description: 'Photo removed' });
      onPhotoUpdate();
    } catch (error: any) {
      console.error('Remove photo error:', error);
      toast({ title: 'Error', description: error.message || 'Failed to remove photo', variant: 'destructive' });
    }
  };

  const handleRotateRight = () => setRotation((prev) => (prev + 90) % 360);
  const handleRotateLeft = () => setRotation((prev) => (prev - 90 + 360) % 360);
  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.25, 0.5));

  const resetTransforms = () => {
    setRotation(0);
    setZoom(1);
    setAllocationText('');
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

      // Handle rotation
      const isRotated90or270 = rotation === 90 || rotation === 270;
      canvas.width = isRotated90or270 ? img.height : img.width;
      canvas.height = isRotated90or270 ? img.width : img.height;

      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);

      // Reset transform for text
      ctx.setTransform(1, 0, 0, 1, 0, 0);

      // Draw allocation text if provided
      if (allocationText.trim()) {
        const textX = (textPosition.x / 100) * canvas.width;
        const textY = (textPosition.y / 100) * canvas.height;
        
        // Calculate font size based on image dimensions
        const fontSize = Math.max(24, Math.min(canvas.width, canvas.height) * 0.04);
        
        ctx.font = `bold ${fontSize}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Draw background for text
        const textMetrics = ctx.measureText(allocationText);
        const padding = fontSize * 0.4;
        const bgWidth = textMetrics.width + padding * 2;
        const bgHeight = fontSize + padding;
        
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(textX - bgWidth / 2, textY - bgHeight / 2, bgWidth, bgHeight);
        
        // Draw text
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(allocationText, textX, textY);
      }

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => {
          if (b) resolve(b);
          else reject(new Error('Failed to create blob'));
        }, 'image/jpeg', 0.9);
      });

      const fileName = `${batchId}-${Date.now()}.jpg`;
      const filePath = `photos/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('delivery-photos')
        .upload(filePath, blob, { upsert: true, contentType: 'image/jpeg' });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('delivery-photos')
        .getPublicUrl(filePath);

      // Update photo URL and allocation_bill if text was provided
      const updateData: any = { photo_url: publicUrl };
      if (allocationText.trim()) {
        updateData.allocation_bill = allocationText.trim();
      }

      const { error: updateError } = await supabase
        .from('stock_releases')
        .update(updateData)
        .eq('batch_id', batchId);

      if (updateError) throw updateError;

      toast({ 
        title: 'Success', 
        description: allocationText.trim() 
          ? `Image saved with allocation: ${allocationText}` 
          : 'Image saved' 
      });
      
      resetTransforms();
      onPhotoUpdate();
    } catch (error: any) {
      console.error('Save error:', error);
      toast({ title: 'Error', description: error.message || 'Failed to save', variant: 'destructive' });
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
    // Pre-fill allocation text with current allocation when opening
    if (currentAllocation) {
      setAllocationText(currentAllocation);
      setShowTextBox(true);
    }
    setPreviewOpen(true);
  };

  const handleDialogClose = (open: boolean) => {
    if (!open) resetTransforms();
    setPreviewOpen(open);
  };

  const hasChanges = rotation !== 0 || allocationText.trim() !== currentAllocation;

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
            <img src={photoUrl} alt="Delivery" className="w-full h-full object-cover" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleRemovePhoto(); }}
            className="absolute -top-1 -right-1 w-4 h-4 bg-destructive text-destructive-foreground rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
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
            <DialogTitle>Delivery Photo</DialogTitle>
          </DialogHeader>
          
          {/* Image Controls */}
          <div className="flex items-center justify-center gap-2 py-2 border-b flex-wrap">
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
              title="Add Allocation Text"
            >
              <Type className="w-4 h-4 mr-1" />
              Allocation
            </Button>
            <div className="w-px h-6 bg-border mx-1" />
            <Button variant="ghost" size="sm" onClick={resetTransforms} title="Reset">
              Reset
            </Button>
          </div>

          {/* Allocation Text Input */}
          {showTextBox && (
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg border">
              <Label htmlFor="allocation-text" className="text-sm font-medium whitespace-nowrap">
                Allocation:
              </Label>
              <Input
                id="allocation-text"
                value={allocationText}
                onChange={(e) => setAllocationText(e.target.value)}
                placeholder="Enter allocation number..."
                className="flex-1"
              />
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                Drag text on image to position
              </span>
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
                  alt="Delivery" 
                  className="max-w-full rounded-lg transition-transform duration-200"
                  style={{ 
                    transform: `rotate(${rotation}deg) scale(${zoom})`,
                    transformOrigin: 'center center'
                  }}
                  draggable={false}
                />
                {/* Text overlay preview */}
                {showTextBox && allocationText.trim() && (
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
                    {allocationText}
                  </div>
                )}
              </div>
            )}
          </div>
          
          <div className="flex justify-end gap-2">
            {hasChanges && (
              <Button 
                onClick={handleSaveWithText} 
                disabled={isSaving}
                className="bg-primary"
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                {allocationText.trim() ? 'Save with Allocation' : 'Save Rotation'}
              </Button>
            )}
            <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
              <Upload className="w-4 h-4 mr-2" />
              Replace
            </Button>
            <Button variant="destructive" onClick={() => { handleRemovePhoto(); setPreviewOpen(false); }}>
              <X className="w-4 h-4 mr-2" />
              Remove
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
