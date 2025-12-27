import { useState, useRef } from 'react';
import { Camera, Upload, X, Loader2, RotateCw, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface PhotoUploadCellProps {
  batchId: string;
  photoUrl: string | null;
  onPhotoUpdate: () => void;
}

export const PhotoUploadCell = ({ batchId, photoUrl, onPhotoUpdate }: PhotoUploadCellProps) => {
  const [isUploading, setIsUploading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [zoom, setZoom] = useState(1);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
      const { error } = await supabase
        .from('stock_releases')
        .update({ photo_url: null, photo_status: 'no_photo' })
        .eq('batch_id', batchId);

      if (error) throw error;
      toast({ title: 'Success', description: 'Photo removed' });
      onPhotoUpdate();
    } catch (error: any) {
      toast({ title: 'Error', description: 'Failed to remove photo', variant: 'destructive' });
    }
  };

  const handleRotateRight = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  const handleRotateLeft = () => {
    setRotation((prev) => (prev - 90 + 360) % 360);
  };

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 0.25, 3));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 0.25, 0.5));
  };

  const resetTransforms = () => {
    setRotation(0);
    setZoom(1);
  };

  const handleDialogClose = (open: boolean) => {
    if (!open) {
      resetTransforms();
    }
    setPreviewOpen(open);
  };

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
            onClick={() => setPreviewOpen(true)}
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
        <DialogContent className="sm:max-w-[700px]">
          <DialogHeader>
            <DialogTitle>Delivery Photo</DialogTitle>
          </DialogHeader>
          
          {/* Image Controls */}
          <div className="flex items-center justify-center gap-2 py-2 border-b">
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
            <Button variant="ghost" size="sm" onClick={resetTransforms} title="Reset">
              Reset
            </Button>
          </div>
          
          {/* Image Preview */}
          <div className="relative overflow-auto max-h-[60vh] flex items-center justify-center bg-muted/30 rounded-lg p-4">
            {photoUrl && (
              <img 
                src={photoUrl} 
                alt="Delivery" 
                className="max-w-full rounded-lg transition-transform duration-200"
                style={{ 
                  transform: `rotate(${rotation}deg) scale(${zoom})`,
                  transformOrigin: 'center center'
                }}
              />
            )}
          </div>
          
          <div className="flex justify-end gap-2">
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
