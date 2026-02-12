import { useState, useRef, useCallback } from 'react';
import { Camera, X, Loader2, Eye, Plus, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

interface ResumePhotoUploadCellProps {
  recordId: string;
  photos: string[];
  fieldName: 'letter_photos' | 'resume_letter_photos';
  maxPhotos?: number;
  onPhotoUpdate: () => void;
}

export const ResumePhotoUploadCell = ({ 
  recordId, 
  photos = [], 
  fieldName, 
  maxPhotos = 3,
  onPhotoUpdate 
}: ResumePhotoUploadCellProps) => {
  const [isUploading, setIsUploading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { userRole } = useAuth();
  
  const canUpload = userRole === 'admin' || userRole === 'staff' || userRole === 'assistant';
  const currentPhotos = photos || [];

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

    if (currentPhotos.length >= maxPhotos) {
      toast.error(`Maximum ${maxPhotos} photos allowed`);
      return;
    }

    setIsUploading(true);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${recordId}-${fieldName}-${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('resume-letters')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('resume-letters')
        .getPublicUrl(filePath);

      const updatedPhotos = [...currentPhotos, publicUrl];

      const { error: updateError } = await supabase
        .from('attendance_records')
        .update({ [fieldName]: updatedPhotos })
        .eq('id', recordId);

      if (updateError) throw updateError;

      toast.success('Photo uploaded successfully');
      onPhotoUpdate();
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error(error.message || 'Failed to upload photo');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemovePhoto = async (photoUrl: string) => {
    try {
      const updatedPhotos = currentPhotos.filter(p => p !== photoUrl);

      const { error } = await supabase
        .from('attendance_records')
        .update({ [fieldName]: updatedPhotos })
        .eq('id', recordId);

      if (error) throw error;
      
      toast.success('Photo removed');
      onPhotoUpdate();
    } catch (error: any) {
      console.error('Remove photo error:', error);
      toast.error(error.message || 'Failed to remove photo');
    }
  };

  const handlePhotoClick = (url: string) => {
    setSelectedPhoto(url);
    setPreviewOpen(true);
  };

  return (
    <div className="flex items-center gap-1">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept="image/*"
        className="hidden"
      />
      
      {/* Display existing photos */}
      {currentPhotos.map((photo, index) => (
        <div key={index} className="relative group">
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); handlePhotoClick(photo); }}
            className="w-8 h-8 rounded overflow-hidden border border-border hover:border-primary transition-all duration-200 hover:scale-105 cursor-pointer"
          >
            <img src={photo} alt={`Photo ${index + 1}`} className="w-full h-full object-cover" />
          </button>
          {canUpload && (
            <button
              onClick={(e) => { e.stopPropagation(); handleRemovePhoto(photo); }}
              className="absolute -top-1 -right-1 w-4 h-4 bg-destructive text-destructive-foreground rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      ))}
      
      {/* Upload button if under max */}
      {canUpload && currentPhotos.length < maxPhotos && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className={cn(
            "w-8 h-8 rounded border border-dashed border-muted-foreground/30 hover:border-primary hover:bg-primary/5 transition-all duration-200",
            isUploading && "opacity-50"
          )}
        >
          {isUploading ? (
            <Loader2 className="w-3 h-3 animate-spin text-primary" />
          ) : (
            <Plus className="w-3 h-3 text-muted-foreground" />
          )}
        </Button>
      )}
      
      {/* Empty state */}
      {currentPhotos.length === 0 && !canUpload && (
        <span className="text-xs text-muted-foreground">-</span>
      )}

      {/* Photo Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>
              {fieldName === 'letter_photos' ? 'Letter Photo' : 'Resume Letter Photo'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="flex items-center justify-center bg-muted/30 rounded-lg p-4 min-h-[300px]">
            {selectedPhoto && (
              <img 
                src={selectedPhoto} 
                alt="Preview" 
                className="max-w-full max-h-[60vh] rounded-lg object-contain"
              />
            )}
          </div>

          {/* Photo thumbnails */}
          {currentPhotos.length > 1 && (
            <div className="flex gap-2 justify-center mt-2">
              {currentPhotos.map((photo, index) => (
                <button
                  key={index}
                  onClick={() => setSelectedPhoto(photo)}
                  className={cn(
                    "w-12 h-12 rounded overflow-hidden border-2 transition-all",
                    selectedPhoto === photo ? "border-primary" : "border-transparent hover:border-muted-foreground"
                  )}
                >
                  <img src={photo} alt={`Thumbnail ${index + 1}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
