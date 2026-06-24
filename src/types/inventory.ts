export type UserRole = 'admin' | 'staff' | 'viewer' | 'pending' | 'teamleader' | 'uploader' | 'oic' | 'hr' | 'encoder' | 'assistant';

export type DeliveryStatus = 'pending' | 'in_transit' | 'out_for_delivery' | 'delivered';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  branch_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserRoleRecord {
  id: string;
  user_id: string;
  role: UserRole;
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  created_at: string;
}

export interface InventoryItem {
  id: string;
  item_name: string;
  item_code: string;
  category_id: string | null;
  total_stock: number;
  available_stock: number;
  price: number;
  amount: number;
  supplier: string | null;
  date_received: string | null;
  low_stock_threshold: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  year: string | null;
  upc: string | null;
  description: string | null;
  branch: string | null;
  pieces_per_box: number;
  category?: Category;
}

export interface StockRelease {
  id: string;
  item_id: string;
  boxes_released: number;
  destination: string;
  courier: string | null;
  allocation_bill: string | null;
  released_by: string;
  delivery_status: DeliveryStatus;
  date_released: string;
  date_delivered: string | null;
  deleted_at: string | null;
  notes: string | null;
  batch_id: string | null;
  category: string | null;
  waybill_no: string | null;
  set_date: string | null;
  total_qty: number | null;
  amount: number | null;
  photo_url: string | null;
  photo_status: string | null;
  branch_id: string | null;
  created_at: string;
  updated_at: string;
  action_status?: string | null;
  product_code?: string | null;
  product_description?: string | null;
  unit_price?: number | null;
  import_created_at?: string | null;
  inventory_item?: InventoryItem;
  profile?: Profile;
}

export interface AllocationBill {
  batch_id: string;
  destination: string;
  courier: string | null;
  allocation_bill: string | null;
  date_released: string;
  delivery_status: DeliveryStatus;
  items: StockRelease[];
}

export interface ExcelImportRow {
  item_name: string;
  item_code: string;
  category: string;
  total_stock: number;
  supplier: string;
  date_received: string;
}

export interface DashboardStats {
  totalItems: number;
  totalStock: number;
  lowStockItems: number;
  pendingDeliveries: number;
  inTransitDeliveries: number;
  deliveredCount: number;
}
