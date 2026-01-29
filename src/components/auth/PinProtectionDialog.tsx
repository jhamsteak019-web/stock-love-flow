import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Button } from '@/components/ui/button';
import { Lock, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface PinProtectionDialogProps {
  open: boolean;
  pageName: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export const PinProtectionDialog = ({ 
  open, 
  pageName, 
  onSuccess, 
  onCancel 
}: PinProtectionDialogProps) => {
  const [pin, setPin] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState('');
  const { toast } = useToast();

  // Reset when dialog opens
  useEffect(() => {
    if (open) {
      setPin('');
      setError('');
    }
  }, [open]);

  const handleVerify = async () => {
    if (pin.length < 4) {
      setError('Please enter the complete PIN');
      return;
    }

    setIsVerifying(true);
    setError('');

    try {
      const { data, error: fetchError } = await supabase
        .from('page_access_pins')
        .select('pin')
        .eq('page_name', pageName)
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (!data) {
        // No PIN set, allow access
        onSuccess();
        return;
      }

      if (data.pin === pin) {
        toast({ title: 'Access granted!' });
        onSuccess();
      } else {
        setError('Incorrect PIN. Please try again.');
        setPin('');
      }
    } catch (err: any) {
      setError('Error verifying PIN. Please try again.');
      console.error('PIN verification error:', err);
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader className="text-center">
          <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Lock className="h-8 w-8 text-primary" />
          </div>
          <DialogTitle className="text-center">Enter Access PIN</DialogTitle>
          <DialogDescription className="text-center">
            This page is protected. Please enter the PIN to continue.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-6 py-4">
          <InputOTP
            maxLength={6}
            value={pin}
            onChange={(value) => {
              setPin(value);
              setError('');
            }}
          >
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
              <InputOTPSlot index={3} />
              <InputOTPSlot index={4} />
              <InputOTPSlot index={5} />
            </InputOTPGroup>
          </InputOTP>

          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}

          <div className="flex gap-3 w-full">
            <Button 
              variant="outline" 
              className="flex-1"
              onClick={onCancel}
              disabled={isVerifying}
            >
              Cancel
            </Button>
            <Button 
              className="flex-1 gap-2"
              onClick={handleVerify}
              disabled={pin.length < 4 || isVerifying}
            >
              {isVerifying ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
              ) : (
                <ShieldCheck className="h-4 w-4" />
              )}
              Verify
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
