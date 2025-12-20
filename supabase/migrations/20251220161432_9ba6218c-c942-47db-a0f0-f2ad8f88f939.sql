-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'staff');

-- Create enum for delivery status
CREATE TYPE public.delivery_status AS ENUM ('pending', 'out_for_delivery', 'delivered');

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'staff',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Create categories table
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create inventory_items table
CREATE TABLE public.inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_name TEXT NOT NULL,
  item_code TEXT NOT NULL UNIQUE,
  category_id UUID REFERENCES public.categories(id),
  total_stock INTEGER NOT NULL DEFAULT 0,
  available_stock INTEGER NOT NULL DEFAULT 0,
  supplier TEXT,
  date_received DATE,
  low_stock_threshold INTEGER DEFAULT 10,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create stock_releases table
CREATE TABLE public.stock_releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID REFERENCES public.inventory_items(id) ON DELETE CASCADE NOT NULL,
  boxes_released INTEGER NOT NULL,
  destination TEXT NOT NULL,
  released_by UUID REFERENCES auth.users(id) NOT NULL,
  delivery_status delivery_status NOT NULL DEFAULT 'pending',
  date_released TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  date_delivered TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_releases ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Create function to get user role
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.user_roles
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- Profiles policies
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

-- User roles policies
CREATE POLICY "Users can view their own role"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Categories policies
CREATE POLICY "Authenticated users can view categories"
  ON public.categories FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage categories"
  ON public.categories FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Inventory items policies
CREATE POLICY "Authenticated users can view inventory"
  ON public.inventory_items FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage inventory"
  ON public.inventory_items FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Stock releases policies
CREATE POLICY "Staff can view all releases"
  ON public.stock_releases FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Staff can create releases"
  ON public.stock_releases FOR INSERT
  TO authenticated
  WITH CHECK (released_by = auth.uid());

CREATE POLICY "Staff can update delivery status on their releases"
  ON public.stock_releases FOR UPDATE
  TO authenticated
  USING (released_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage all releases"
  ON public.stock_releases FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data ->> 'full_name');
  
  -- Default role is staff, first user becomes admin
  IF (SELECT COUNT(*) FROM public.user_roles) = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'staff');
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for new user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create function to update available stock when releasing
CREATE OR REPLACE FUNCTION public.update_stock_on_release()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.inventory_items
  SET available_stock = available_stock - NEW.boxes_released,
      updated_at = now()
  WHERE id = NEW.item_id;
  RETURN NEW;
END;
$$;

-- Create trigger for stock release
CREATE TRIGGER on_stock_release
  AFTER INSERT ON public.stock_releases
  FOR EACH ROW EXECUTE FUNCTION public.update_stock_on_release();

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Create triggers for timestamp updates
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_inventory_items_updated_at
  BEFORE UPDATE ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_stock_releases_updated_at
  BEFORE UPDATE ON public.stock_releases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();