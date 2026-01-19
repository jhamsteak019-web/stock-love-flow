export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      branches: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      collection_items: {
        Row: {
          category: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          favorite_remarks: string | null
          id: string
          is_favorite: boolean
          item_name: string
          notes: string | null
          photo_url: string | null
          quantity: number | null
          status: string | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          favorite_remarks?: string | null
          id?: string
          is_favorite?: boolean
          item_name: string
          notes?: string | null
          photo_url?: string | null
          quantity?: number | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          favorite_remarks?: string | null
          id?: string
          is_favorite?: boolean
          item_name?: string
          notes?: string | null
          photo_url?: string | null
          quantity?: number | null
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      column_settings: {
        Row: {
          id: string
          page_name: string
          settings: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          page_name: string
          settings?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          page_name?: string
          settings?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      containers: {
        Row: {
          branch_id: string | null
          category: string | null
          created_at: string
          created_by: string | null
          date: string
          date_receive_factory: string | null
          deleted_at: string | null
          id: string
          notes: string | null
          out_factory: string | null
          photo_url: string | null
          receive_photo_url: string | null
          remarks: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          date?: string
          date_receive_factory?: string | null
          deleted_at?: string | null
          id?: string
          notes?: string | null
          out_factory?: string | null
          photo_url?: string | null
          receive_photo_url?: string | null
          remarks?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          date?: string
          date_receive_factory?: string | null
          deleted_at?: string | null
          id?: string
          notes?: string | null
          out_factory?: string | null
          photo_url?: string | null
          receive_photo_url?: string | null
          remarks?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "containers_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      imported_items: {
        Row: {
          batch_id: string
          branch: string | null
          branch_id: string | null
          category: string | null
          created_at: string
          deliver_to: string | null
          description: string | null
          file_name: string
          format_type: string | null
          id: string
          imported_by: string
          name: string
          pieces_per_box: number
          price_a: number | null
          qty: number | null
          remarks: string | null
          sheet_no: string | null
          supplier: string | null
          upc: string | null
          year: string | null
        }
        Insert: {
          batch_id?: string
          branch?: string | null
          branch_id?: string | null
          category?: string | null
          created_at?: string
          deliver_to?: string | null
          description?: string | null
          file_name: string
          format_type?: string | null
          id?: string
          imported_by: string
          name: string
          pieces_per_box?: number
          price_a?: number | null
          qty?: number | null
          remarks?: string | null
          sheet_no?: string | null
          supplier?: string | null
          upc?: string | null
          year?: string | null
        }
        Update: {
          batch_id?: string
          branch?: string | null
          branch_id?: string | null
          category?: string | null
          created_at?: string
          deliver_to?: string | null
          description?: string | null
          file_name?: string
          format_type?: string | null
          id?: string
          imported_by?: string
          name?: string
          pieces_per_box?: number
          price_a?: number | null
          qty?: number | null
          remarks?: string | null
          sheet_no?: string | null
          supplier?: string | null
          upc?: string | null
          year?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "imported_items_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          amount: number | null
          available_stock: number
          branch: string | null
          category_id: string | null
          created_at: string
          created_by: string | null
          date_received: string | null
          description: string | null
          id: string
          item_code: string
          item_name: string
          low_stock_threshold: number | null
          pieces_per_box: number
          price: number | null
          restock_location: string | null
          supplier: string | null
          total_stock: number
          upc: string | null
          updated_at: string
          year: string | null
        }
        Insert: {
          amount?: number | null
          available_stock?: number
          branch?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          date_received?: string | null
          description?: string | null
          id?: string
          item_code: string
          item_name: string
          low_stock_threshold?: number | null
          pieces_per_box?: number
          price?: number | null
          restock_location?: string | null
          supplier?: string | null
          total_stock?: number
          upc?: string | null
          updated_at?: string
          year?: string | null
        }
        Update: {
          amount?: number | null
          available_stock?: number
          branch?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          date_received?: string | null
          description?: string | null
          id?: string
          item_code?: string
          item_name?: string
          low_stock_threshold?: number | null
          pieces_per_box?: number
          price?: number | null
          restock_location?: string | null
          supplier?: string | null
          total_stock?: number
          upc?: string | null
          updated_at?: string
          year?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          branch_id: string | null
          color: string
          concern: string
          content: string
          created_at: string
          deleted_at: string | null
          id: string
          is_public: boolean
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          branch_id?: string | null
          color?: string
          concern?: string
          content?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_public?: boolean
          status?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          branch_id?: string | null
          color?: string
          concern?: string
          content?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_public?: boolean
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notes_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_read: boolean
          link: string | null
          message: string
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_read?: boolean
          link?: string | null
          message: string
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_read?: boolean
          link?: string | null
          message?: string
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      repeat_orders: {
        Row: {
          branch_id: string | null
          branch_store: string | null
          category: string | null
          created_at: string
          created_by: string | null
          date_give_store: string | null
          date_give_warehouse: string | null
          date_out_warehouse: string | null
          deleted_at: string | null
          id: string
          photo_url: string | null
          status: string
        }
        Insert: {
          branch_id?: string | null
          branch_store?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          date_give_store?: string | null
          date_give_warehouse?: string | null
          date_out_warehouse?: string | null
          deleted_at?: string | null
          id?: string
          photo_url?: string | null
          status?: string
        }
        Update: {
          branch_id?: string | null
          branch_store?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          date_give_store?: string | null
          date_give_warehouse?: string | null
          date_out_warehouse?: string | null
          deleted_at?: string | null
          id?: string
          photo_url?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "repeat_orders_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          branch_name: string
          category: string
          created_at: string
          created_by: string | null
          dec_2024: number | null
          id: string
          mhb: number | null
          mlp: number | null
          mp: string
          msh: number | null
          mum: number | null
          running_sale: number | null
          sale_date: string
          sales_plan: number | null
          ts: number | null
          updated_at: string
        }
        Insert: {
          branch_name: string
          category: string
          created_at?: string
          created_by?: string | null
          dec_2024?: number | null
          id?: string
          mhb?: number | null
          mlp?: number | null
          mp: string
          msh?: number | null
          mum?: number | null
          running_sale?: number | null
          sale_date: string
          sales_plan?: number | null
          ts?: number | null
          updated_at?: string
        }
        Update: {
          branch_name?: string
          category?: string
          created_at?: string
          created_by?: string | null
          dec_2024?: number | null
          id?: string
          mhb?: number | null
          mlp?: number | null
          mp?: string
          msh?: number | null
          mum?: number | null
          running_sale?: number | null
          sale_date?: string
          sales_plan?: number | null
          ts?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      stock_releases: {
        Row: {
          allocation_bill: string | null
          batch_id: string | null
          boxes_released: number
          branch_id: string | null
          category: string | null
          courier: string | null
          created_at: string
          date_delivered: string | null
          date_released: string
          deleted_at: string | null
          delivery_status: Database["public"]["Enums"]["delivery_status"]
          destination: string
          id: string
          item_id: string | null
          notes: string | null
          photo_status: string | null
          photo_url: string | null
          released_by: string
          set_date: string | null
          total_qty: number | null
          updated_at: string
          waybill_no: string | null
        }
        Insert: {
          allocation_bill?: string | null
          batch_id?: string | null
          boxes_released: number
          branch_id?: string | null
          category?: string | null
          courier?: string | null
          created_at?: string
          date_delivered?: string | null
          date_released?: string
          deleted_at?: string | null
          delivery_status?: Database["public"]["Enums"]["delivery_status"]
          destination: string
          id?: string
          item_id?: string | null
          notes?: string | null
          photo_status?: string | null
          photo_url?: string | null
          released_by: string
          set_date?: string | null
          total_qty?: number | null
          updated_at?: string
          waybill_no?: string | null
        }
        Update: {
          allocation_bill?: string | null
          batch_id?: string | null
          boxes_released?: number
          branch_id?: string | null
          category?: string | null
          courier?: string | null
          created_at?: string
          date_delivered?: string | null
          date_released?: string
          deleted_at?: string | null
          delivery_status?: Database["public"]["Enums"]["delivery_status"]
          destination?: string
          id?: string
          item_id?: string | null
          notes?: string | null
          photo_status?: string | null
          photo_url?: string | null
          released_by?: string
          set_date?: string | null
          total_qty?: number | null
          updated_at?: string
          waybill_no?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_releases_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_releases_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      store_access_tokens: {
        Row: {
          access_token: string
          created_at: string
          id: string
          is_active: boolean
          store_name: string
          updated_at: string
        }
        Insert: {
          access_token?: string
          created_at?: string
          id?: string
          is_active?: boolean
          store_name: string
          updated_at?: string
        }
        Update: {
          access_token?: string
          created_at?: string
          id?: string
          is_active?: boolean
          store_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "staff"
        | "viewer"
        | "pending"
        | "teamleader"
        | "uploader"
        | "oic"
      delivery_status:
        | "pending"
        | "in_transit"
        | "out_for_delivery"
        | "delivered"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "admin",
        "staff",
        "viewer",
        "pending",
        "teamleader",
        "uploader",
        "oic",
      ],
      delivery_status: [
        "pending",
        "in_transit",
        "out_for_delivery",
        "delivered",
      ],
    },
  },
} as const
