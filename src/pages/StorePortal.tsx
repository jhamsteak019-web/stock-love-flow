import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { Upload, Package, CheckCircle, XCircle, Clock, Camera, AlertTriangle, Store, Loader2 } from 'lucide-react';

interface StoreDelivery {
  batch_id: string;
  allocation_bill: string | null;
  destination: string;
  category: string | null;
  total_boxes: number;
  total_qty: number;
  set_date: string | null;
  delivery_status: string;
  photo_url: string | null;
  photo_status: string;
  waybill_no: string | null;
}

const StorePortal = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const { toast } = useToast();
  
  const [storeName, setStoreName] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<StoreDelivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadingBatchId, setUploadingBatchId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Validate token and get store name
  useEffect(() => {
    const validateToken = async () => {
      if (!token) {
        setError('Invalid or missing access token. Please contact your administrator.');
        setLoading(false);
        return;
      }

      try {
        const { data: tokenData, error: tokenError } = await supabase
          .from('store_access_tokens')
          .select('store_name, is_active')
          .eq('access_token', token)
          .single();

        if (tokenError || !tokenData) {
          setError('Invalid access token. Please contact your administrator.');
          setLoading(false);
          return;
        }

        if (!tokenData.is_active) {
          setError('This access link has been deactivated. Please contact your administrator.');
          setLoading(false);
          return;
        }

        setStoreName(tokenData.store_name);
        await fetchDeliveries(tokenData.store_name);
      } catch (err) {
        setError('Failed to validate access. Please try again.');
        setLoading(false);
      }
    };

    validateToken();
  }, [token]);

  const fetchDeliveries = async (store: string) => {
    try {
      const { data, error } = await supabase
        .from('stock_releases')
        .select('batch_id, allocation_bill, destination, category, boxes_released, total_qty, set_date, delivery_status, photo_url, photo_status, waybill_no')
        .ilike('destination', `%${store}%`)
        .is('deleted_at', null)
        .order('set_date', { ascending: false });

      if (error) throw error;

      // Group by batch_id
      const grouped: Record<string, StoreDelivery> = {};
      data?.forEach(release => {
        const batchKey = release.batch_id || release.allocation_bill || '';
        if (!grouped[batchKey]) {
          grouped[batchKey] = {
            batch_id: batchKey,
            allocation_bill: release.allocation_bill,
            destination: release.destination,
            category: release.category,
            total_boxes: 0,
            total_qty: 0,
            set_date: release.set_date,
            delivery_status: release.delivery_status,
            photo_url: release.photo_url,
            photo_status: release.photo_status || 'no_photo',
            waybill_no: release.waybill_no,
          };
        }
        grouped[batchKey].total_boxes += release.boxes_released;
        grouped[batchKey].total_qty += release.total_qty || 0;
      });

      setDeliveries(Object.values(grouped));
      setLoading(false);
    } catch (err) {
      console.error('Error fetching deliveries:', err);
      setError('Failed to load deliveries. Please refresh the page.');
      setLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, batchId: string) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        toast({ title: 'Error', description: 'Please select an image file', variant: 'destructive' });
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast({ title: 'Error', description: 'File size must be less than 10MB', variant: 'destructive' });
        return;
      }
      setSelectedFile(file);
      setUploadingBatchId(batchId);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !uploadingBatchId || !storeName) return;

    setUploading(true);
    try {
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `${uploadingBatchId}-${Date.now()}.${fileExt}`;
      const filePath = `${storeName}/${fileName}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('allocation-bills')
        .upload(filePath, selectedFile);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('allocation-bills')
        .getPublicUrl(filePath);

      // Update the stock_releases records
      const { error: updateError } = await supabase
        .from('stock_releases')
        .update({ 
          photo_url: urlData.publicUrl,
          photo_status: 'pending_approval'
        })
        .eq('batch_id', uploadingBatchId);

      if (updateError) throw updateError;

      toast({ title: 'Success', description: 'Photo uploaded successfully! Waiting for approval.' });
      
      // Refresh deliveries
      await fetchDeliveries(storeName);
      
      // Reset state
      setSelectedFile(null);
      setUploadingBatchId(null);
      setPreviewUrl(null);
    } catch (err) {
      console.error('Upload error:', err);
      toast({ title: 'Error', description: 'Failed to upload photo. Please try again.', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const getStatusBadge = (photoStatus: string) => {
    switch (photoStatus) {
      case 'approved':
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"><CheckCircle className="h-3 w-3 mr-1" /> Approved</Badge>;
      case 'pending_approval':
        return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"><Clock className="h-3 w-3 mr-1" /> Pending Approval</Badge>;
      case 'rejected':
        return <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"><XCircle className="h-3 w-3 mr-1" /> Rejected</Badge>;
      default:
        return <Badge variant="outline"><Camera className="h-3 w-3 mr-1" /> No Photo</Badge>;
    }
  };

  const getDeliveryStatusBadge = (status: string) => {
    switch (status) {
      case 'delivered':
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">Delivered</Badge>;
      case 'out_for_delivery':
        return <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">Out for Delivery</Badge>;
      case 'in_transit':
        return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">In Transit</Badge>;
      default:
        return <Badge variant="outline">Pending</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="mt-4 text-muted-foreground">Loading store portal...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Access Error</h2>
            <p className="text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <Store className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-xl font-bold">Store Portal</h1>
              <p className="text-sm text-muted-foreground">{storeName}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Your Deliveries
            </CardTitle>
            <CardDescription>
              Upload photos of your allocation bills as proof of receipt. Once approved, the delivery will be marked as completed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {deliveries.length === 0 ? (
              <div className="text-center py-12">
                <Package className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-muted-foreground">No deliveries found for your store</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Bill No.</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-center">Boxes</TableHead>
                      <TableHead className="text-center">Qty</TableHead>
                      <TableHead>Date Out</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Photo Status</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deliveries.map((delivery) => (
                      <TableRow key={delivery.batch_id}>
                        <TableCell className="font-medium">{delivery.allocation_bill || '-'}</TableCell>
                        <TableCell>{delivery.category || '-'}</TableCell>
                        <TableCell className="text-center">{delivery.total_boxes}</TableCell>
                        <TableCell className="text-center">{delivery.total_qty}</TableCell>
                        <TableCell>
                          {delivery.set_date ? format(new Date(delivery.set_date), 'MMM d, yyyy') : '-'}
                        </TableCell>
                        <TableCell>{getDeliveryStatusBadge(delivery.delivery_status)}</TableCell>
                        <TableCell>{getStatusBadge(delivery.photo_status)}</TableCell>
                        <TableCell>
                          {delivery.photo_status === 'no_photo' || delivery.photo_status === 'rejected' ? (
                            <div>
                              <Input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                id={`upload-${delivery.batch_id}`}
                                onChange={(e) => handleFileSelect(e, delivery.batch_id)}
                              />
                              <label htmlFor={`upload-${delivery.batch_id}`}>
                                <Button variant="outline" size="sm" asChild className="cursor-pointer">
                                  <span>
                                    <Upload className="h-4 w-4 mr-1" />
                                    {delivery.photo_status === 'rejected' ? 'Re-upload' : 'Upload'}
                                  </span>
                                </Button>
                              </label>
                            </div>
                          ) : delivery.photo_url ? (
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => window.open(delivery.photo_url!, '_blank')}
                            >
                              View Photo
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Upload Preview Dialog */}
      <Dialog open={!!previewUrl} onOpenChange={() => { setPreviewUrl(null); setSelectedFile(null); setUploadingBatchId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Photo Upload</DialogTitle>
            <DialogDescription>
              Please verify the photo before uploading. Make sure the allocation bill is clearly visible.
            </DialogDescription>
          </DialogHeader>
          {previewUrl && (
            <div className="rounded-lg overflow-hidden border">
              <img src={previewUrl} alt="Preview" className="w-full h-auto max-h-[400px] object-contain" />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPreviewUrl(null); setSelectedFile(null); setUploadingBatchId(null); }}>
              Cancel
            </Button>
            <Button onClick={handleUpload} disabled={uploading}>
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Photo
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StorePortal;
