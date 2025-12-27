import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Camera, CheckCircle, XCircle, Clock, Eye, Loader2 } from 'lucide-react';

interface PhotoApprovalCellProps {
  batchId: string;
  photoUrl: string | null;
  photoStatus: string;
  allocationBill: string | null;
  isAdmin: boolean;
  onStatusChange: () => void;
}

const PhotoApprovalCell = ({
  batchId,
  photoUrl,
  photoStatus,
  allocationBill,
  isAdmin,
  onStatusChange,
}: PhotoApprovalCellProps) => {
  const { toast } = useToast();
  const [showPreview, setShowPreview] = useState(false);
  const [processing, setProcessing] = useState(false);

  const handleApprove = async () => {
    setProcessing(true);
    try {
      // Update photo status to approved and delivery status to delivered
      const { error } = await supabase
        .from('stock_releases')
        .update({ 
          photo_status: 'approved',
          delivery_status: 'delivered',
          date_delivered: new Date().toISOString()
        })
        .eq('batch_id', batchId);

      if (error) throw error;

      toast({ title: 'Approved', description: 'Photo approved and delivery marked as completed.' });
      setShowPreview(false);
      onStatusChange();
    } catch (err) {
      console.error('Approval error:', err);
      toast({ title: 'Error', description: 'Failed to approve photo.', variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    setProcessing(true);
    try {
      const { error } = await supabase
        .from('stock_releases')
        .update({ photo_status: 'rejected' })
        .eq('batch_id', batchId);

      if (error) throw error;

      toast({ title: 'Rejected', description: 'Photo rejected. Store can re-upload.' });
      setShowPreview(false);
      onStatusChange();
    } catch (err) {
      console.error('Rejection error:', err);
      toast({ title: 'Error', description: 'Failed to reject photo.', variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  };

  const getStatusBadge = () => {
    switch (photoStatus) {
      case 'approved':
        return (
          <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
            <CheckCircle className="h-3 w-3 mr-1" /> Approved
          </Badge>
        );
      case 'pending_approval':
        return (
          <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 cursor-pointer" onClick={() => setShowPreview(true)}>
            <Clock className="h-3 w-3 mr-1" /> Review
          </Badge>
        );
      case 'rejected':
        return (
          <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
            <XCircle className="h-3 w-3 mr-1" /> Rejected
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-muted-foreground">
            <Camera className="h-3 w-3 mr-1" /> No Photo
          </Badge>
        );
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        {getStatusBadge()}
        {photoUrl && photoStatus !== 'no_photo' && (
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowPreview(true)}>
            <Eye className="h-3 w-3" />
          </Button>
        )}
      </div>

      {/* Photo Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Allocation Bill Photo</DialogTitle>
            <DialogDescription>
              Bill No: <span className="font-semibold">{allocationBill || 'N/A'}</span>
              {photoStatus === 'pending_approval' && ' - Please verify and approve or reject this photo.'}
            </DialogDescription>
          </DialogHeader>
          
          {photoUrl && (
            <div className="rounded-lg overflow-hidden border bg-muted/30">
              <img 
                src={photoUrl} 
                alt="Allocation Bill" 
                className="w-full h-auto max-h-[500px] object-contain"
              />
            </div>
          )}

          {isAdmin && photoStatus === 'pending_approval' && (
            <DialogFooter className="gap-2">
              <Button 
                variant="destructive" 
                onClick={handleReject}
                disabled={processing}
              >
                {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4 mr-2" />}
                Reject
              </Button>
              <Button 
                onClick={handleApprove}
                disabled={processing}
                className="bg-green-600 hover:bg-green-700"
              >
                {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                Approve & Mark Delivered
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default PhotoApprovalCell;
