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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action_category: string
          action_name: string
          created_at: string
          details: Json | null
          id: string
          target_module: string | null
          user_name: string | null
        }
        Insert: {
          action_category: string
          action_name: string
          created_at?: string
          details?: Json | null
          id?: string
          target_module?: string | null
          user_name?: string | null
        }
        Update: {
          action_category?: string
          action_name?: string
          created_at?: string
          details?: Json | null
          id?: string
          target_module?: string | null
          user_name?: string | null
        }
        Relationships: []
      }
      members: {
        Row: {
          address: string | null
          created_at: string
          date_of_birth: string | null
          email: string | null
          full_name: string
          id: string
          loyalty_points: number
          member_code: string
          phone: string
          tier_id: string | null
          total_spent: number
        }
        Insert: {
          address?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          full_name: string
          id?: string
          loyalty_points?: number
          member_code: string
          phone: string
          tier_id?: string | null
          total_spent?: number
        }
        Update: {
          address?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          full_name?: string
          id?: string
          loyalty_points?: number
          member_code?: string
          phone?: string
          tier_id?: string | null
          total_spent?: number
        }
        Relationships: [
          {
            foreignKeyName: "members_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "membership_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_tiers: {
        Row: {
          created_at: string
          discount_percentage: number
          id: string
          name: string
          points_multiplier: number
        }
        Insert: {
          created_at?: string
          discount_percentage?: number
          id?: string
          name: string
          points_multiplier?: number
        }
        Update: {
          created_at?: string
          discount_percentage?: number
          id?: string
          name?: string
          points_multiplier?: number
        }
        Relationships: []
      }
      pos_settings: {
        Row: {
          enable_tax: boolean
          footer_text: string | null
          header_text: string | null
          id: number
          paper_size: string
          show_barcode: boolean
          show_logo: boolean
          show_points: boolean
          show_tax_details: boolean
          tax_mode: string
          tax_percentage: number
          updated_at: string
        }
        Insert: {
          enable_tax?: boolean
          footer_text?: string | null
          header_text?: string | null
          id?: number
          paper_size?: string
          show_barcode?: boolean
          show_logo?: boolean
          show_points?: boolean
          show_tax_details?: boolean
          tax_mode?: string
          tax_percentage?: number
          updated_at?: string
        }
        Update: {
          enable_tax?: boolean
          footer_text?: string | null
          header_text?: string | null
          id?: number
          paper_size?: string
          show_barcode?: boolean
          show_logo?: boolean
          show_points?: boolean
          show_tax_details?: boolean
          tax_mode?: string
          tax_percentage?: number
          updated_at?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          barcode: string
          category: string | null
          cost_price: number
          created_at: string
          custom_points: number | null
          ecom_price: number | null
          id: string
          name: string
          point_multiplier: number
          selling_price: number
          stock_quantity: number
        }
        Insert: {
          barcode: string
          category?: string | null
          cost_price?: number
          created_at?: string
          custom_points?: number | null
          ecom_price?: number | null
          id?: string
          name: string
          point_multiplier?: number
          selling_price?: number
          stock_quantity?: number
        }
        Update: {
          barcode?: string
          category?: string | null
          cost_price?: number
          created_at?: string
          custom_points?: number | null
          ecom_price?: number | null
          id?: string
          name?: string
          point_multiplier?: number
          selling_price?: number
          stock_quantity?: number
        }
        Relationships: []
      }
      promotions: {
        Row: {
          created_at: string
          discount_amount: number
          discount_percent: number
          end_date: string | null
          foc_product_id: string | null
          id: string
          is_active: boolean
          min_spend: number
          points_per_dollar: number
          promo_type: string
          start_date: string | null
          tier_rates: Json | null
          title: string
        }
        Insert: {
          created_at?: string
          discount_amount?: number
          discount_percent?: number
          end_date?: string | null
          foc_product_id?: string | null
          id?: string
          is_active?: boolean
          min_spend?: number
          points_per_dollar?: number
          promo_type: string
          start_date?: string | null
          tier_rates?: Json | null
          title: string
        }
        Update: {
          created_at?: string
          discount_amount?: number
          discount_percent?: number
          end_date?: string | null
          foc_product_id?: string | null
          id?: string
          is_active?: boolean
          min_spend?: number
          points_per_dollar?: number
          promo_type?: string
          start_date?: string | null
          tier_rates?: Json | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotions_foc_product_id_fkey"
            columns: ["foc_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          barcode: string | null
          cost_price: number
          created_at: string
          id: string
          po_id: string
          product_id: string | null
          product_name: string | null
          quantity_received: number
          selling_price: number
          subtotal_cost: number
        }
        Insert: {
          barcode?: string | null
          cost_price?: number
          created_at?: string
          id?: string
          po_id: string
          product_id?: string | null
          product_name?: string | null
          quantity_received?: number
          selling_price?: number
          subtotal_cost?: number
        }
        Update: {
          barcode?: string | null
          cost_price?: number
          created_at?: string
          id?: string
          po_id?: string
          product_id?: string | null
          product_name?: string | null
          quantity_received?: number
          selling_price?: number
          subtotal_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          created_at: string
          id: string
          operator_name: string | null
          po_number: string
          supplier_name: string | null
          total_cost: number
          total_items_count: number
        }
        Insert: {
          created_at?: string
          id?: string
          operator_name?: string | null
          po_number: string
          supplier_name?: string | null
          total_cost?: number
          total_items_count?: number
        }
        Update: {
          created_at?: string
          id?: string
          operator_name?: string | null
          po_number?: string
          supplier_name?: string | null
          total_cost?: number
          total_items_count?: number
        }
        Relationships: []
      }
      sale_items: {
        Row: {
          created_at: string
          discount_amount: number
          discount_percent: number
          id: string
          is_return: boolean
          product_id: string | null
          product_name: string
          quantity: number
          sale_id: string
          unit_price: number
        }
        Insert: {
          created_at?: string
          discount_amount?: number
          discount_percent?: number
          id?: string
          is_return?: boolean
          product_id?: string | null
          product_name: string
          quantity?: number
          sale_id: string
          unit_price?: number
        }
        Update: {
          created_at?: string
          discount_amount?: number
          discount_percent?: number
          id?: string
          is_return?: boolean
          product_id?: string | null
          product_name?: string
          quantity?: number
          sale_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          bill_number: string
          cashier_name: string | null
          created_at: string
          discount_amount: number
          id: string
          is_exchange: boolean
          is_refunded: boolean
          member_id: string | null
          original_bill_number: string | null
          payment_type: string
          points_earned: number
          points_redeemed: number
          store_id: string | null
          subtotal_amount: number
          tax_amount: number
          total_amount: number
        }
        Insert: {
          bill_number: string
          cashier_name?: string | null
          created_at?: string
          discount_amount?: number
          id?: string
          is_exchange?: boolean
          is_refunded?: boolean
          member_id?: string | null
          original_bill_number?: string | null
          payment_type?: string
          points_earned?: number
          points_redeemed?: number
          store_id?: string | null
          subtotal_amount?: number
          tax_amount?: number
          total_amount?: number
        }
        Update: {
          bill_number?: string
          cashier_name?: string | null
          created_at?: string
          discount_amount?: number
          id?: string
          is_exchange?: boolean
          is_refunded?: boolean
          member_id?: string | null
          original_bill_number?: string | null
          payment_type?: string
          points_earned?: number
          points_redeemed?: number
          store_id?: string | null
          subtotal_amount?: number
          tax_amount?: number
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
