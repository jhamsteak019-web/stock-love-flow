import { useState, useRef } from 'react';
import { Camera, Upload, X, Loader2, CheckCircle, XCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

export type PhotoStatus = 'no_photo' | 'pending' | 'approved' | 'rejected';

interface PhotoUploadCellProps {
  batchId: string;
  photoUrl: string | null;
  photoStatus?: PhotoStatus;
  onPhotoUpdate: () => void;
  showApproval?: boolean;
}

export const PhotoUploadCell = ({ 
  batchId, 
  photoUrl, 
  photoStatus = 'no_photo',
  onPhotoUpdate,
  showApproval = false
}: PhotoUploadCellProps) => {
  const [isUploading, setIsUploading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { userRole } = useAuth();
  const isAdmin = userRole === 'admin';

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
        .update({ photo_url: publicUrl, photo_status: 'pending' })
        .eq('batch_id', batchId);

      if (updateError) throw updateError;

      toast({ title: 'Success', description: 'Photo uploaded and pending approval' });
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

  const handleApprovalChange = async (status: 'approved' | 'rejected') => {
    try {
      const updateData: { photo_status: string; photo_url?: null } = { photo_status: status };
      
      // If rejected, clear the photo URL so user must re-upload
      if (status === 'rejected') {
        updateData.photo_url = null;
      }

      const { error } = await supabase
        .from('stock_releases')
        .update(updateData)
        .eq('batch_id', batchId);

      if (error) throw error;
      
      toast({ 
        title: 'Success', 
        description: status === 'approved' ? 'Photo approved' : 'Photo rejected - user must re-upload'
      });
      onPhotoUpdate();
    } catch (error: any) {
      toast({ title: 'Error', description: 'Failed to update status', variant: 'destructive' });
    }
  };

  const getStatusIcon = () => {
    switch (photoStatus) {
      case 'approved':
        return <CheckCircle className="w-3 h-3 text-green-500" />;
      case 'rejected':
        return <XCircle className="w-3 h-3 text-destructive" />;
      case 'pending':
        return <Clock className="w-3 h-3 text-yellow-500" />;
      default:
        return null;
    }
  };

  const needsReupload = photoStatus === 'rejected' || photoStatus === 'no_photo';

  return (
    <div className="flex items-center gap-2">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept="image/*"
        className="hidden"
      />
      
      {photoUrl && photoStatus !== 'rejected' ? (
        <div className="relative group">
          <button
            onClick={() => setPreviewOpen(true)}
            className="w-9 h-9 rounded-lg overflow-hidden border-2 border-primary/30 hover:border-primary transition-all duration-200 hover:scale-105"
          >
            <img src={photoUrl} alt="Delivery" className="w-full h-full object-cover" />
          </button>
          {photoStatus && photoStatus !== 'no_photo' && (
            <div className="absolute -bottom-1 -right-1">
              {getStatusIcon()}
            </div>
          )}
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
            "w-9 h-9 rounded-lg border-2 border-dashed transition-all duration-200",
            needsReupload && photoStatus === 'rejected' 
              ? "border-destructive/50 hover:border-destructive hover:bg-destructive/5" 
              : "border-muted-foreground/30 hover:border-primary hover:bg-primary/5",
            isUploading && "opacity-50"
          )}
          title={photoStatus === 'rejected' ? 'Photo rejected - please re-upload' : 'Upload photo'}
        >
          {isUploading ? (
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
          ) : photoStatus === 'rejected' ? (
            <XCircle className="w-4 h-4 text-destructive" />
          ) : (
            <Camera className="w-4 h-4 text-muted-foreground" />
          )}
        </Button>
      )}

      {/* Admin approval dropdown */}
      {showApproval && isAdmin && photoUrl && photoStatus === 'pending' && (
        <Select onValueChange={(value) => handleApprovalChange(value as 'approved' | 'rejected')}>
          <SelectTrigger className="w-24 h-8 text-xs">
            <SelectValue placeholder="Review" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="approved" className="text-green-600">
              <div className="flex items-center gap-1">
                <CheckCircle className="w-3 h-3" />
                Approve
              </div>
            </SelectItem>
            <SelectItem value="rejected" className="text-destructive">
              <div className="flex items-center gap-1">
                <XCircle className="w-3 h-3" />
                Reject
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      )}

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Delivery Photo
              {photoStatus === 'pending' && <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">Pending</span>}
              {photoStatus === 'approved' && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Approved</span>}
            </DialogTitle>
          </DialogHeader>
          <div className="relative">
            {photoUrl && <img src={photoUrl} alt="Delivery" className="w-full rounded-lg" />}
          </div>
          <div className="flex justify-between gap-2">
            {isAdmin && photoStatus === 'pending' && (
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  className="text-green-600 border-green-600 hover:bg-green-50"
                  onClick={() => { handleApprovalChange('approved'); setPreviewOpen(false); }}
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Approve
                </Button>
                <Button 
                  variant="outline" 
                  className="text-destructive border-destructive hover:bg-destructive/10"
                  onClick={() => { handleApprovalChange('rejected'); setPreviewOpen(false); }}
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  Reject
                </Button>
              </div>
            )}
            <div className="flex gap-2 ml-auto">
              <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                <Upload className="w-4 h-4 mr-2" />
                Replace
              </Button>
              <Button variant="destructive" onClick={() => { handleRemovePhoto(); setPreviewOpen(false); }}>
                <X className="w-4 h-4 mr-2" />
                Remove
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
