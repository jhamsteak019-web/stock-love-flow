-- Add 'in_transit' value to the delivery_status enum
ALTER TYPE public.delivery_status ADD VALUE IF NOT EXISTS 'in_transit' AFTER 'pending';

-- Allow admins to delete profiles
CREATE POLICY "Admins can delete profiles" 
ON public.profiles 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to update all profiles
CREATE POLICY "Admins can update all profiles" 
ON public.profiles 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to delete stock releases
CREATE POLICY "Admins can delete stock releases" 
ON public.stock_releases 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role));