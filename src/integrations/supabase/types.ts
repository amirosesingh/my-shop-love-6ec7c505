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
      drawer_events: {
        Row: {
          approved_by: string | null
          created_at: string
          id: string
          note: string | null
          reason: string
          role: string | null
          shift_id: string | null
          staff_id: string | null
          staff_name: string | null
          store_id: string | null
          terminal_id: string | null
        }
        Insert: {
          approved_by?: string | null
          created_at?: string
          id?: string
          note?: string | null
          reason: string
          role?: string | null
          shift_id?: string | null
          staff_id?: string | null
          staff_name?: string | null
          store_id?: string | null
          terminal_id?: string | null
        }
        Update: {
          approved_by?: string | null
          created_at?: string
          id?: string
          note?: string | null
          reason?: string
          role?: string | null
          shift_id?: string | null
          staff_id?: string | null
          staff_name?: string | null
          store_id?: string | null
          terminal_id?: string | null
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
          company_name: string
          custom_lines: Json
          day_end_time: string
          day_start_time: string
          enable_tax: boolean
          fonts: Json
          footer_text: string | null
          header_text: string | null
          id: number
          max_shift_hours: number
          paper_size: string
          phone: string | null
          qr: Json
          reg_number: string | null
          review_max_discount_pct: number
          review_max_nosale: number
          review_max_refund_value: number
          review_max_refunds: number
          review_max_voids: number
          shift_reminder_minutes: number
          show_barcode: boolean
          show_logo: boolean
          show_points: boolean
          show_tax_details: boolean
          tax_mode: string
          tax_number: string | null
          tax_percentage: number
          updated_at: string
          website: string | null
        }
        Insert: {
          company_name?: string
          custom_lines?: Json
          day_end_time?: string
          day_start_time?: string
          enable_tax?: boolean
          fonts?: Json
          footer_text?: string | null
          header_text?: string | null
          id?: number
          max_shift_hours?: number
          paper_size?: string
          phone?: string | null
          qr?: Json
          reg_number?: string | null
          review_max_discount_pct?: number
          review_max_nosale?: number
          review_max_refund_value?: number
          review_max_refunds?: number
          review_max_voids?: number
          shift_reminder_minutes?: number
          show_barcode?: boolean
          show_logo?: boolean
          show_points?: boolean
          show_tax_details?: boolean
          tax_mode?: string
          tax_number?: string | null
          tax_percentage?: number
          updated_at?: string
          website?: string | null
        }
        Update: {
          company_name?: string
          custom_lines?: Json
          day_end_time?: string
          day_start_time?: string
          enable_tax?: boolean
          fonts?: Json
          footer_text?: string | null
          header_text?: string | null
          id?: number
          max_shift_hours?: number
          paper_size?: string
          phone?: string | null
          qr?: Json
          reg_number?: string | null
          review_max_discount_pct?: number
          review_max_nosale?: number
          review_max_refund_value?: number
          review_max_refunds?: number
          review_max_voids?: number
          shift_reminder_minutes?: number
          show_barcode?: boolean
          show_logo?: boolean
          show_points?: boolean
          show_tax_details?: boolean
          tax_mode?: string
          tax_number?: string | null
          tax_percentage?: number
          updated_at?: string
          website?: string | null
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
          ecom_visible: boolean
          id: string
          name: string
          point_multiplier: number
          reorder_level: number
          selling_price: number
          sku: string | null
          stock_by_store: Json
          stock_quantity: number
          tax_rate: number
          updated_at: string
        }
        Insert: {
          barcode: string
          category?: string | null
          cost_price?: number
          created_at?: string
          custom_points?: number | null
          ecom_price?: number | null
          ecom_visible?: boolean
          id?: string
          name: string
          point_multiplier?: number
          reorder_level?: number
          selling_price?: number
          sku?: string | null
          stock_by_store?: Json
          stock_quantity?: number
          tax_rate?: number
          updated_at?: string
        }
        Update: {
          barcode?: string
          category?: string | null
          cost_price?: number
          created_at?: string
          custom_points?: number | null
          ecom_price?: number | null
          ecom_visible?: boolean
          id?: string
          name?: string
          point_multiplier?: number
          reorder_level?: number
          selling_price?: number
          sku?: string | null
          stock_by_store?: Json
          stock_quantity?: number
          tax_rate?: number
          updated_at?: string
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
          coupon_code: string | null
          coupon_discount: number
          created_at: string
          discount_amount: number
          discount_percent: number
          id: string
          is_foc: boolean
          is_return: boolean
          product_id: string | null
          product_name: string
          promo_id: string | null
          quantity: number
          sale_id: string
          tax_rate: number
          unit_price: number
        }
        Insert: {
          coupon_code?: string | null
          coupon_discount?: number
          created_at?: string
          discount_amount?: number
          discount_percent?: number
          id?: string
          is_foc?: boolean
          is_return?: boolean
          product_id?: string | null
          product_name: string
          promo_id?: string | null
          quantity?: number
          sale_id: string
          tax_rate?: number
          unit_price?: number
        }
        Update: {
          coupon_code?: string | null
          coupon_discount?: number
          created_at?: string
          discount_amount?: number
          discount_percent?: number
          id?: string
          is_foc?: boolean
          is_return?: boolean
          product_id?: string | null
          product_name?: string
          promo_id?: string | null
          quantity?: number
          sale_id?: string
          tax_rate?: number
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
          change_amount: number
          coupon_code: string | null
          coupon_discount: number
          coupon_promo_id: string | null
          coupon_scope: string | null
          created_at: string
          discount_amount: number
          exchange_credit: number
          exchanged_to_bill_number: string | null
          id: string
          is_exchange: boolean
          is_refunded: boolean
          member_id: string | null
          original_bill_number: string | null
          paid_amount: number
          payment_type: string
          payments: Json
          points_earned: number
          points_redeemed: number
          shift_id: string | null
          store_id: string | null
          subtotal_amount: number
          tax_amount: number
          total_amount: number
        }
        Insert: {
          bill_number: string
          cashier_name?: string | null
          change_amount?: number
          coupon_code?: string | null
          coupon_discount?: number
          coupon_promo_id?: string | null
          coupon_scope?: string | null
          created_at?: string
          discount_amount?: number
          exchange_credit?: number
          exchanged_to_bill_number?: string | null
          id?: string
          is_exchange?: boolean
          is_refunded?: boolean
          member_id?: string | null
          original_bill_number?: string | null
          paid_amount?: number
          payment_type?: string
          payments?: Json
          points_earned?: number
          points_redeemed?: number
          shift_id?: string | null
          store_id?: string | null
          subtotal_amount?: number
          tax_amount?: number
          total_amount?: number
        }
        Update: {
          bill_number?: string
          cashier_name?: string | null
          change_amount?: number
          coupon_code?: string | null
          coupon_discount?: number
          coupon_promo_id?: string | null
          coupon_scope?: string | null
          created_at?: string
          discount_amount?: number
          exchange_credit?: number
          exchanged_to_bill_number?: string | null
          id?: string
          is_exchange?: boolean
          is_refunded?: boolean
          member_id?: string | null
          original_bill_number?: string | null
          paid_amount?: number
          payment_type?: string
          payments?: Json
          points_earned?: number
          points_redeemed?: number
          shift_id?: string | null
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
      secure_settings: {
        Row: {
          ciphertext: string
          created_at: string
          hint: string | null
          key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          ciphertext: string
          created_at?: string
          hint?: string | null
          key: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          ciphertext?: string
          created_at?: string
          hint?: string | null
          key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      shifts: {
        Row: {
          closed_at: string | null
          closed_by_name: string | null
          closed_by_role: string | null
          closed_by_staff_id: string | null
          closing_float: number | null
          counted_cash: number | null
          created_at: string
          expected_cash: number | null
          id: string
          note: string
          opened_at: string
          opened_by_name: string
          opened_by_role: string | null
          opened_by_staff_id: string | null
          opening_float: number
          overdue: boolean
          status: string
          store_id: string
          terminal_id: string | null
          terminal_name: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          closed_at?: string | null
          closed_by_name?: string | null
          closed_by_role?: string | null
          closed_by_staff_id?: string | null
          closing_float?: number | null
          counted_cash?: number | null
          created_at?: string
          expected_cash?: number | null
          id?: string
          note?: string
          opened_at?: string
          opened_by_name?: string
          opened_by_role?: string | null
          opened_by_staff_id?: string | null
          opening_float?: number
          overdue?: boolean
          status?: string
          store_id: string
          terminal_id?: string | null
          terminal_name?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          closed_at?: string | null
          closed_by_name?: string | null
          closed_by_role?: string | null
          closed_by_staff_id?: string | null
          closing_float?: number | null
          counted_cash?: number | null
          created_at?: string
          expected_cash?: number | null
          id?: string
          note?: string
          opened_at?: string
          opened_by_name?: string
          opened_by_role?: string | null
          opened_by_staff_id?: string | null
          opening_float?: number
          overdue?: boolean
          status?: string
          store_id?: string
          terminal_id?: string | null
          terminal_name?: string | null
          updated_at?: string
          user_id?: string | null
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
          role: Database["public"]["Enums"]["app_role"]
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "manager" | "staff"
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
      app_role: ["admin", "manager", "staff"],
    },
  },
} as const
