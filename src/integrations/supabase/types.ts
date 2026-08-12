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
      activity_events: {
        Row: {
          actor_id: string | null
          actor_name: string | null
          actor_role: string | null
          amount: number | null
          client_event_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          event_type: string
          id: string
          message: string
          meta: Json
          severity: string
          store_id: string | null
          terminal_id: string | null
          terminal_name: string | null
          title: string
          whatsapp_error: string | null
          whatsapp_status: string
        }
        Insert: {
          actor_id?: string | null
          actor_name?: string | null
          actor_role?: string | null
          amount?: number | null
          client_event_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          event_type: string
          id?: string
          message?: string
          meta?: Json
          severity?: string
          store_id?: string | null
          terminal_id?: string | null
          terminal_name?: string | null
          title: string
          whatsapp_error?: string | null
          whatsapp_status?: string
        }
        Update: {
          actor_id?: string | null
          actor_name?: string | null
          actor_role?: string | null
          amount?: number | null
          client_event_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          event_type?: string
          id?: string
          message?: string
          meta?: Json
          severity?: string
          store_id?: string | null
          terminal_id?: string | null
          terminal_name?: string | null
          title?: string
          whatsapp_error?: string | null
          whatsapp_status?: string
        }
        Relationships: []
      }
      app_users: {
        Row: {
          auth_user_id: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          is_active: boolean
          last_login_at: string | null
          permissions: Json
          pin_hash: string
          pin_length: number
          role: Database["public"]["Enums"]["app_role"]
          role_slug: string | null
          store_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string
          email: string
          full_name: string
          id?: string
          is_active?: boolean
          last_login_at?: string | null
          permissions?: Json
          pin_hash?: string
          pin_length?: number
          role?: Database["public"]["Enums"]["app_role"]
          role_slug?: string | null
          store_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          last_login_at?: string | null
          permissions?: Json
          pin_hash?: string
          pin_length?: number
          role?: Database["public"]["Enums"]["app_role"]
          role_slug?: string | null
          store_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
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
      booking_payments: {
        Row: {
          amount: number
          booking_id: string
          cashier: string | null
          created_at: string
          id: string
          method: string
          paid_at: string
        }
        Insert: {
          amount?: number
          booking_id: string
          cashier?: string | null
          created_at?: string
          id?: string
          method?: string
          paid_at?: string
        }
        Update: {
          amount?: number
          booking_id?: string
          cashier?: string | null
          created_at?: string
          id?: string
          method?: string
          paid_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          cashier: string | null
          closed_at: string | null
          created_at: string
          customer_name: string
          customer_phone: string
          discount: number
          dropped_off_at: string | null
          due_date: string | null
          grommet_notes: string | null
          id: string
          job_notes: string | null
          job_status: string
          job_status_at: string | null
          job_status_by: string | null
          lines: Json
          member_id: string | null
          note: string
          notify_whatsapp: boolean
          paid: number
          payment_timing: string | null
          promised_at: string | null
          racket_model: string | null
          ref: string
          sale_receipt_no: string | null
          service_fee: number
          service_name: string | null
          service_type_id: string | null
          shift_id: string | null
          status: string
          store_id: string | null
          string_type: string | null
          subtotal: number
          tax: number
          tension_cross: number | null
          tension_main: number | null
          tension_unit: string
          total: number
          updated_at: string
        }
        Insert: {
          cashier?: string | null
          closed_at?: string | null
          created_at?: string
          customer_name?: string
          customer_phone?: string
          discount?: number
          dropped_off_at?: string | null
          due_date?: string | null
          grommet_notes?: string | null
          id?: string
          job_notes?: string | null
          job_status?: string
          job_status_at?: string | null
          job_status_by?: string | null
          lines?: Json
          member_id?: string | null
          note?: string
          notify_whatsapp?: boolean
          paid?: number
          payment_timing?: string | null
          promised_at?: string | null
          racket_model?: string | null
          ref: string
          sale_receipt_no?: string | null
          service_fee?: number
          service_name?: string | null
          service_type_id?: string | null
          shift_id?: string | null
          status?: string
          store_id?: string | null
          string_type?: string | null
          subtotal?: number
          tax?: number
          tension_cross?: number | null
          tension_main?: number | null
          tension_unit?: string
          total?: number
          updated_at?: string
        }
        Update: {
          cashier?: string | null
          closed_at?: string | null
          created_at?: string
          customer_name?: string
          customer_phone?: string
          discount?: number
          dropped_off_at?: string | null
          due_date?: string | null
          grommet_notes?: string | null
          id?: string
          job_notes?: string | null
          job_status?: string
          job_status_at?: string | null
          job_status_by?: string | null
          lines?: Json
          member_id?: string | null
          note?: string
          notify_whatsapp?: boolean
          paid?: number
          payment_timing?: string | null
          promised_at?: string | null
          racket_model?: string | null
          ref?: string
          sale_receipt_no?: string | null
          service_fee?: number
          service_name?: string | null
          service_type_id?: string | null
          shift_id?: string | null
          status?: string
          store_id?: string | null
          string_type?: string | null
          subtotal?: number
          tax?: number
          tension_cross?: number | null
          tension_main?: number | null
          tension_unit?: string
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      cashiers: {
        Row: {
          created_at: string
          full_name: string
          id: string
          is_active: boolean
          last_login_at: string | null
          permissions: Json
          pin_hash: string
          role_slug: string | null
          store_id: string | null
          updated_at: string
          username: string
        }
        Insert: {
          created_at?: string
          full_name?: string
          id?: string
          is_active?: boolean
          last_login_at?: string | null
          permissions?: Json
          pin_hash: string
          role_slug?: string | null
          store_id?: string | null
          updated_at?: string
          username: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          is_active?: boolean
          last_login_at?: string | null
          permissions?: Json
          pin_hash?: string
          role_slug?: string | null
          store_id?: string | null
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      coupon_campaigns: {
        Row: {
          claims_count: number
          created_at: string
          discount_type: string
          discount_value: number
          expires_at: string | null
          id: string
          is_active: boolean
          is_welcome: boolean
          max_claims: number | null
          max_per_member: number | null
          name: string
          scope: string
          scope_value: string | null
          slug: string
          starts_at: string | null
          updated_at: string
        }
        Insert: {
          claims_count?: number
          created_at?: string
          discount_type?: string
          discount_value?: number
          expires_at?: string | null
          id?: string
          is_active?: boolean
          is_welcome?: boolean
          max_claims?: number | null
          max_per_member?: number | null
          name: string
          scope?: string
          scope_value?: string | null
          slug: string
          starts_at?: string | null
          updated_at?: string
        }
        Update: {
          claims_count?: number
          created_at?: string
          discount_type?: string
          discount_value?: number
          expires_at?: string | null
          id?: string
          is_active?: boolean
          is_welcome?: boolean
          max_claims?: number | null
          max_per_member?: number | null
          name?: string
          scope?: string
          scope_value?: string | null
          slug?: string
          starts_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      coupon_events: {
        Row: {
          campaign_id: string | null
          campaign_name: string | null
          created_at: string
          event_type: string
          id: string
          member_id: string | null
          member_phone: string | null
          note: string | null
          sale_id: string | null
          staff_name: string | null
          staff_role: string | null
          store_id: string | null
          terminal_id: string | null
          voucher_token: string | null
        }
        Insert: {
          campaign_id?: string | null
          campaign_name?: string | null
          created_at?: string
          event_type: string
          id?: string
          member_id?: string | null
          member_phone?: string | null
          note?: string | null
          sale_id?: string | null
          staff_name?: string | null
          staff_role?: string | null
          store_id?: string | null
          terminal_id?: string | null
          voucher_token?: string | null
        }
        Update: {
          campaign_id?: string | null
          campaign_name?: string | null
          created_at?: string
          event_type?: string
          id?: string
          member_id?: string | null
          member_phone?: string | null
          note?: string | null
          sale_id?: string | null
          staff_name?: string | null
          staff_role?: string | null
          store_id?: string | null
          terminal_id?: string | null
          voucher_token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coupon_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "coupon_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_events_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
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
      held_orders: {
        Row: {
          cancelled_from: string | null
          cart_discount: number
          cart_discount_type: string
          coupon: Json | null
          created_at: string
          exchange_ref: string | null
          held_at: string
          held_by: string | null
          id: string
          label: string
          lines: Json
          member_id: string | null
          member_name: string | null
          note: string
          shift_id: string | null
          store_id: string | null
          total: number
          updated_at: string
        }
        Insert: {
          cancelled_from?: string | null
          cart_discount?: number
          cart_discount_type?: string
          coupon?: Json | null
          created_at?: string
          exchange_ref?: string | null
          held_at?: string
          held_by?: string | null
          id?: string
          label?: string
          lines?: Json
          member_id?: string | null
          member_name?: string | null
          note?: string
          shift_id?: string | null
          store_id?: string | null
          total?: number
          updated_at?: string
        }
        Update: {
          cancelled_from?: string | null
          cart_discount?: number
          cart_discount_type?: string
          coupon?: Json | null
          created_at?: string
          exchange_ref?: string | null
          held_at?: string
          held_by?: string | null
          id?: string
          label?: string
          lines?: Json
          member_id?: string | null
          member_name?: string | null
          note?: string
          shift_id?: string | null
          store_id?: string | null
          total?: number
          updated_at?: string
        }
        Relationships: []
      }
      issued_vouchers: {
        Row: {
          campaign_id: string
          disable_reason: string | null
          disabled_at: string | null
          disabled_by: string | null
          expires_at: string | null
          id: string
          issued_at: string
          issued_by: string | null
          issued_source: string
          member_id: string | null
          redeemed_at: string | null
          redeemed_by: string | null
          redeemed_sale_id: string | null
          status: string
          store_id: string | null
          token_slug: string
        }
        Insert: {
          campaign_id: string
          disable_reason?: string | null
          disabled_at?: string | null
          disabled_by?: string | null
          expires_at?: string | null
          id?: string
          issued_at?: string
          issued_by?: string | null
          issued_source?: string
          member_id?: string | null
          redeemed_at?: string | null
          redeemed_by?: string | null
          redeemed_sale_id?: string | null
          status?: string
          store_id?: string | null
          token_slug: string
        }
        Update: {
          campaign_id?: string
          disable_reason?: string | null
          disabled_at?: string | null
          disabled_by?: string | null
          expires_at?: string | null
          id?: string
          issued_at?: string
          issued_by?: string | null
          issued_source?: string
          member_id?: string | null
          redeemed_at?: string | null
          redeemed_by?: string | null
          redeemed_sale_id?: string | null
          status?: string
          store_id?: string | null
          token_slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "issued_vouchers_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "coupon_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issued_vouchers_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
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
          updated_at: string
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
          updated_at?: string
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
          updated_at?: string
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
          updated_at: string
        }
        Insert: {
          created_at?: string
          discount_percentage?: number
          id?: string
          name: string
          points_multiplier?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          discount_percentage?: number
          id?: string
          name?: string
          points_multiplier?: number
          updated_at?: string
        }
        Relationships: []
      }
      pos_settings: {
        Row: {
          booking_slip: Json
          company_name: string
          custom_lines: Json
          date_format: string
          day_end_time: string
          day_start_time: string
          enable_tax: boolean
          fonts: Json
          footer_text: string | null
          header_text: string | null
          id: number
          integration_settings: Json
          max_shift_hours: number
          notification_settings: Json
          paper_size: string
          phone: string | null
          qr: Json
          reg_number: string | null
          region_country: string
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
          time_format: string
          time_zone: string
          ui_visibility: Json
          updated_at: string
          website: string | null
        }
        Insert: {
          booking_slip?: Json
          company_name?: string
          custom_lines?: Json
          date_format?: string
          day_end_time?: string
          day_start_time?: string
          enable_tax?: boolean
          fonts?: Json
          footer_text?: string | null
          header_text?: string | null
          id?: number
          integration_settings?: Json
          max_shift_hours?: number
          notification_settings?: Json
          paper_size?: string
          phone?: string | null
          qr?: Json
          reg_number?: string | null
          region_country?: string
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
          time_format?: string
          time_zone?: string
          ui_visibility?: Json
          updated_at?: string
          website?: string | null
        }
        Update: {
          booking_slip?: Json
          company_name?: string
          custom_lines?: Json
          date_format?: string
          day_end_time?: string
          day_start_time?: string
          enable_tax?: boolean
          fonts?: Json
          footer_text?: string | null
          header_text?: string | null
          id?: number
          integration_settings?: Json
          max_shift_hours?: number
          notification_settings?: Json
          paper_size?: string
          phone?: string | null
          qr?: Json
          reg_number?: string | null
          region_country?: string
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
          time_format?: string
          time_zone?: string
          ui_visibility?: Json
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      product_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          parent_id: string | null
          sort: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          parent_id?: string | null
          sort?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          parent_id?: string | null
          sort?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          archived_at: string | null
          barcode: string
          barcode_aliases: string[]
          category: string | null
          cost_price: number
          created_at: string
          custom_points: number | null
          ecom_price: number | null
          ecom_visible: boolean
          id: string
          is_archived: boolean
          landing_pct: number | null
          name: string
          packs: Json
          point_multiplier: number
          reorder_level: number
          selling_price: number
          sku: string | null
          stock_by_store: Json
          stock_quantity: number
          sub_category: string | null
          tax_rate: number
          unit: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          barcode: string
          barcode_aliases?: string[]
          category?: string | null
          cost_price?: number
          created_at?: string
          custom_points?: number | null
          ecom_price?: number | null
          ecom_visible?: boolean
          id?: string
          is_archived?: boolean
          landing_pct?: number | null
          name: string
          packs?: Json
          point_multiplier?: number
          reorder_level?: number
          selling_price?: number
          sku?: string | null
          stock_by_store?: Json
          stock_quantity?: number
          sub_category?: string | null
          tax_rate?: number
          unit?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          barcode?: string
          barcode_aliases?: string[]
          category?: string | null
          cost_price?: number
          created_at?: string
          custom_points?: number | null
          ecom_price?: number | null
          ecom_visible?: boolean
          id?: string
          is_archived?: boolean
          landing_pct?: number | null
          name?: string
          packs?: Json
          point_multiplier?: number
          reorder_level?: number
          selling_price?: number
          sku?: string | null
          stock_by_store?: Json
          stock_quantity?: number
          sub_category?: string | null
          tax_rate?: number
          unit?: string | null
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
          updated_at: string
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
          updated_at?: string
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
          updated_at?: string
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
      public_flags: {
        Row: {
          enabled: boolean
          key: string
          updated_at: string
        }
        Insert: {
          enabled?: boolean
          key: string
          updated_at?: string
        }
        Update: {
          enabled?: boolean
          key?: string
          updated_at?: string
        }
        Relationships: []
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
          sku: string | null
          subtotal_cost: number
          updated_at: string
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
          sku?: string | null
          subtotal_cost?: number
          updated_at?: string
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
          sku?: string | null
          subtotal_cost?: number
          updated_at?: string
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
          invoice_date: string | null
          invoice_entry_date: string | null
          operator_name: string | null
          po_number: string
          store_code: string | null
          store_id: string | null
          supplier_id: string | null
          supplier_name: string | null
          total_cost: number
          total_items_count: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          invoice_date?: string | null
          invoice_entry_date?: string | null
          operator_name?: string | null
          po_number: string
          store_code?: string | null
          store_id?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          total_cost?: number
          total_items_count?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          invoice_date?: string | null
          invoice_entry_date?: string | null
          operator_name?: string | null
          po_number?: string
          store_code?: string | null
          store_id?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          total_cost?: number
          total_items_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
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
          unit_cost: number
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
          unit_cost?: number
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
          unit_cost?: number
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
          client_transaction_id: string | null
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
          client_transaction_id?: string | null
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
          client_transaction_id?: string | null
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
      security_findings: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          created_at: string
          deployment_ref: string | null
          detail: string
          fingerprint: string
          first_seen_at: string
          id: string
          last_seen_at: string
          resolved_at: string | null
          severity: string
          source: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
          deployment_ref?: string | null
          detail?: string
          fingerprint: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          resolved_at?: string | null
          severity?: string
          source: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
          deployment_ref?: string | null
          detail?: string
          fingerprint?: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          resolved_at?: string | null
          severity?: string
          source?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      shift_sessions: {
        Row: {
          created_at: string
          id: string
          role: string | null
          shift_id: string | null
          signed_in_at: string
          signed_out_at: string | null
          staff_id: string | null
          staff_name: string
          store_id: string
          terminal_id: string | null
          terminal_name: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: string | null
          shift_id?: string | null
          signed_in_at?: string
          signed_out_at?: string | null
          staff_id?: string | null
          staff_name: string
          store_id: string
          terminal_id?: string | null
          terminal_name?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string | null
          shift_id?: string | null
          signed_in_at?: string
          signed_out_at?: string | null
          staff_id?: string | null
          staff_name?: string
          store_id?: string
          terminal_id?: string | null
          terminal_name?: string | null
          updated_at?: string
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
      sku_audit: {
        Row: {
          created_at: string
          id: string
          previous_sku: string | null
          product_id: string | null
          product_name: string | null
          role: string | null
          sku: string
          source: string
          staff_id: string | null
          staff_name: string | null
          store_id: string | null
          store_name: string | null
          terminal_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          previous_sku?: string | null
          product_id?: string | null
          product_name?: string | null
          role?: string | null
          sku: string
          source?: string
          staff_id?: string | null
          staff_name?: string | null
          store_id?: string | null
          store_name?: string | null
          terminal_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          previous_sku?: string | null
          product_id?: string | null
          product_name?: string | null
          role?: string | null
          sku?: string
          source?: string
          staff_id?: string | null
          staff_name?: string | null
          store_id?: string | null
          store_name?: string | null
          terminal_id?: string | null
        }
        Relationships: []
      }
      staff_roles: {
        Row: {
          base_level: string
          created_at: string
          is_core: boolean
          name: string
          permissions: Json
          slug: string
          updated_at: string
        }
        Insert: {
          base_level?: string
          created_at?: string
          is_core?: boolean
          name: string
          permissions?: Json
          slug: string
          updated_at?: string
        }
        Update: {
          base_level?: string
          created_at?: string
          is_core?: boolean
          name?: string
          permissions?: Json
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      stock_adjustments: {
        Row: {
          barcode: string | null
          cost_impact: number
          created_at: string
          delta: number
          id: string
          note: string
          previous_stock: number
          product_id: string | null
          product_name: string | null
          reason: string
          role: string | null
          sku: string | null
          staff_id: string | null
          staff_name: string | null
          store_id: string | null
          terminal_id: string | null
          updated_stock: number
        }
        Insert: {
          barcode?: string | null
          cost_impact?: number
          created_at?: string
          delta?: number
          id?: string
          note?: string
          previous_stock?: number
          product_id?: string | null
          product_name?: string | null
          reason?: string
          role?: string | null
          sku?: string | null
          staff_id?: string | null
          staff_name?: string | null
          store_id?: string | null
          terminal_id?: string | null
          updated_stock?: number
        }
        Update: {
          barcode?: string | null
          cost_impact?: number
          created_at?: string
          delta?: number
          id?: string
          note?: string
          previous_stock?: number
          product_id?: string | null
          product_name?: string | null
          reason?: string
          role?: string | null
          sku?: string | null
          staff_id?: string | null
          staff_name?: string | null
          store_id?: string | null
          terminal_id?: string | null
          updated_stock?: number
        }
        Relationships: [
          {
            foreignKeyName: "stock_adjustments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_transfer_items: {
        Row: {
          barcode: string | null
          created_at: string
          id: string
          product_id: string | null
          product_name: string | null
          quantity: number
          quantity_received: number
          sku: string | null
          transfer_id: string
          unit_cost: number
        }
        Insert: {
          barcode?: string | null
          created_at?: string
          id?: string
          product_id?: string | null
          product_name?: string | null
          quantity?: number
          quantity_received?: number
          sku?: string | null
          transfer_id: string
          unit_cost?: number
        }
        Update: {
          barcode?: string | null
          created_at?: string
          id?: string
          product_id?: string | null
          product_name?: string | null
          quantity?: number
          quantity_received?: number
          sku?: string | null
          transfer_id?: string
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "stock_transfer_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfer_items_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "stock_transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_transfers: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          from_group_id: string | null
          from_store_id: string
          from_store_name: string | null
          id: string
          kind: string
          note: string
          received_at: string | null
          received_by: string | null
          ref: string
          rejected_reason: string | null
          status: string
          to_group_id: string | null
          to_store_id: string
          to_store_name: string | null
          transfer_scope: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          from_group_id?: string | null
          from_store_id: string
          from_store_name?: string | null
          id?: string
          kind?: string
          note?: string
          received_at?: string | null
          received_by?: string | null
          ref: string
          rejected_reason?: string | null
          status?: string
          to_group_id?: string | null
          to_store_id: string
          to_store_name?: string | null
          transfer_scope?: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          from_group_id?: string | null
          from_store_id?: string
          from_store_name?: string | null
          id?: string
          kind?: string
          note?: string
          received_at?: string | null
          received_by?: string | null
          ref?: string
          rejected_reason?: string | null
          status?: string
          to_group_id?: string | null
          to_store_id?: string
          to_store_name?: string | null
          transfer_scope?: string
          updated_at?: string
        }
        Relationships: []
      }
      stores: {
        Row: {
          address: string | null
          code: string
          created_at: string
          group_id: string | null
          id: string
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          code: string
          created_at?: string
          group_id?: string | null
          id: string
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          code?: string
          created_at?: string
          group_id?: string | null
          id?: string
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          address: string | null
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string | null
          tax_number: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          tax_number?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          tax_number?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      system_audit_logs: {
        Row: {
          action_type: string
          actor_id: string | null
          actor_name: string | null
          actor_role: string | null
          created_at: string
          entity_affected: string | null
          entity_id: string | null
          id: string
          ip_address: string | null
          new_value: Json | null
          note: string | null
          old_value: Json | null
          store_id: string | null
          terminal_id: string | null
        }
        Insert: {
          action_type: string
          actor_id?: string | null
          actor_name?: string | null
          actor_role?: string | null
          created_at?: string
          entity_affected?: string | null
          entity_id?: string | null
          id?: string
          ip_address?: string | null
          new_value?: Json | null
          note?: string | null
          old_value?: Json | null
          store_id?: string | null
          terminal_id?: string | null
        }
        Update: {
          action_type?: string
          actor_id?: string | null
          actor_name?: string | null
          actor_role?: string | null
          created_at?: string
          entity_affected?: string | null
          entity_id?: string | null
          id?: string
          ip_address?: string | null
          new_value?: Json | null
          note?: string | null
          old_value?: Json | null
          store_id?: string | null
          terminal_id?: string | null
        }
        Relationships: []
      }
      terminal_tokens: {
        Row: {
          activated_at: string | null
          claimed_at: string | null
          claimed_by_device: string | null
          created_at: string
          device_name: string
          id: string
          last_seen_at: string | null
          location_id: string | null
          location_name: string | null
          platform: string
          reissued_at: string | null
          replaced_by: string | null
          revoked_at: string | null
          status: string
        }
        Insert: {
          activated_at?: string | null
          claimed_at?: string | null
          claimed_by_device?: string | null
          created_at?: string
          device_name: string
          id?: string
          last_seen_at?: string | null
          location_id?: string | null
          location_name?: string | null
          platform?: string
          reissued_at?: string | null
          replaced_by?: string | null
          revoked_at?: string | null
          status?: string
        }
        Update: {
          activated_at?: string | null
          claimed_at?: string | null
          claimed_by_device?: string | null
          created_at?: string
          device_name?: string
          id?: string
          last_seen_at?: string | null
          location_id?: string | null
          location_name?: string | null
          platform?: string
          reissued_at?: string | null
          replaced_by?: string | null
          revoked_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "terminal_tokens_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      uom_units: {
        Row: {
          allow_decimal: boolean
          code: string
          created_at: string
          id: string
          name: string
          sort: number
          updated_at: string
        }
        Insert: {
          allow_decimal?: boolean
          code: string
          created_at?: string
          id?: string
          name: string
          sort?: number
          updated_at?: string
        }
        Update: {
          allow_decimal?: boolean
          code?: string
          created_at?: string
          id?: string
          name?: string
          sort?: number
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
      whatsapp_queue: {
        Row: {
          body: string
          created_at: string
          error: string | null
          id: string
          phone_number_id: string
          queued_at: string
          recipient: string
          reference: string | null
          sent_at: string | null
          status: string
          store_id: string | null
          updated_at: string
        }
        Insert: {
          body?: string
          created_at?: string
          error?: string | null
          id?: string
          phone_number_id?: string
          queued_at?: string
          recipient: string
          reference?: string | null
          sent_at?: string | null
          status?: string
          store_id?: string | null
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          error?: string | null
          id?: string
          phone_number_id?: string
          queued_at?: string
          recipient?: string
          reference?: string | null
          sent_at?: string | null
          status?: string
          store_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_daily_item_sales: {
        Row: {
          cost: number | null
          product_id: string | null
          product_name: string | null
          profit: number | null
          revenue: number | null
          sale_day: string | null
          sale_month: string | null
          store_id: string | null
          units: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      v_daily_store_sales: {
        Row: {
          bills: number | null
          cost: number | null
          discount: number | null
          foc_value: number | null
          profit: number | null
          revenue: number | null
          sale_day: string | null
          sale_month: string | null
          store_id: string | null
          units: number | null
        }
        Relationships: []
      }
      v_sale_line_facts: {
        Row: {
          bill_number: string | null
          cashier_name: string | null
          created_at: string | null
          is_foc: boolean | null
          is_refunded: boolean | null
          is_return: boolean | null
          line_cost: number | null
          line_discount: number | null
          line_id: string | null
          line_revenue: number | null
          payment_type: string | null
          product_id: string | null
          product_name: string | null
          quantity: number | null
          sale_day: string | null
          sale_id: string | null
          sale_month: string | null
          store_id: string | null
          unit_cost: number | null
          unit_discount: number | null
          unit_price: number | null
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
    }
    Functions: {
      campaign_is_live: {
        Args: { _c: Database["public"]["Tables"]["coupon_campaigns"]["Row"] }
        Returns: boolean
      }
      coupon_claim: {
        Args: {
          _email?: string
          _full_name?: string
          _phone: string
          _slug: string
        }
        Returns: string
      }
      coupon_issue_manual: {
        Args: {
          _expires_at?: string
          _full_name?: string
          _ignore_limit?: boolean
          _phone: string
          _role?: string
          _slug: string
          _staff?: string
          _store?: string
        }
        Returns: string
      }
      coupon_log: {
        Args: {
          _campaign: Database["public"]["Tables"]["coupon_campaigns"]["Row"]
          _member?: string
          _note?: string
          _phone?: string
          _role?: string
          _sale?: string
          _staff?: string
          _store?: string
          _terminal?: string
          _token?: string
          _type: string
        }
        Returns: undefined
      }
      current_app_user: {
        Args: never
        Returns: {
          email: string
          full_name: string
          id: string
          is_active: boolean
          permissions: Json
          role: Database["public"]["Enums"]["app_role"]
          store_id: string
          user_id: string
        }[]
      }
      delete_cashier: { Args: { p_id: string }; Returns: undefined }
      delete_terminal_user: { Args: { p_user_id: string }; Returns: undefined }
      has_perm: { Args: { _flag: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_app_supervisor: { Args: never; Returns: boolean }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      is_staff_now: { Args: never; Returns: boolean }
      is_supervisor_now: { Args: never; Returns: boolean }
      legacy_cashiers_for_migration: {
        Args: never
        Returns: {
          full_name: string
          is_active: boolean
          pin_hash: string
          role_slug: string
          store_id: string
          username: string
        }[]
      }
      list_app_users: {
        Args: never
        Returns: {
          auth_user_id: string
          created_at: string
          email: string
          full_name: string
          has_pin: boolean
          id: string
          is_active: boolean
          last_login_at: string
          permissions: Json
          pin_length: number
          role: Database["public"]["Enums"]["app_role"]
          role_slug: string
          store_id: string
          user_id: string
        }[]
      }
      list_cashiers: {
        Args: never
        Returns: {
          created_at: string
          full_name: string
          id: string
          is_active: boolean
          last_login_at: string
          permissions: Json
          store_id: string
          username: string
        }[]
      }
      member_join: {
        Args: { _email?: string; _full_name: string; _phone: string }
        Returns: string
      }
      member_welcome_claim: {
        Args: { _email?: string; _full_name: string; _phone: string }
        Returns: string
      }
      normalize_phone: { Args: { _phone: string }; Returns: string }
      security_report_findings: {
        Args: { _deployment_ref: string; _findings: Json; _source: string }
        Returns: Json
      }
      security_selfcheck: { Args: never; Returns: Json }
      security_set_finding_status: {
        Args: { _by?: string; _id: string; _status: string }
        Returns: undefined
      }
      set_app_user_permissions: {
        Args: { p_permissions: Json; p_user_id: string }
        Returns: undefined
      }
      set_app_user_profile: {
        Args: {
          p_full_name: string
          p_is_active: boolean
          p_role: Database["public"]["Enums"]["app_role"]
          p_store_id: string
          p_user_id: string
        }
        Returns: undefined
      }
      set_cashier_permissions: {
        Args: { p_id: string; p_permissions: Json }
        Returns: undefined
      }
      set_terminal_active: {
        Args: { p_active: boolean; p_user_id: string }
        Returns: undefined
      }
      shift_active_for_branch: {
        Args: { p_store_id: string }
        Returns: {
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
        SetofOptions: {
          from: "*"
          to: "shifts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      shift_open: {
        Args: {
          p_id: string
          p_opened_by_name: string
          p_opened_by_role?: string
          p_opened_by_staff_id?: string
          p_opening_float?: number
          p_store_id: string
          p_terminal_id?: string
          p_terminal_name?: string
          p_user_id?: string
        }
        Returns: {
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
        SetofOptions: {
          from: "*"
          to: "shifts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      staff_account_adopt_legacy: {
        Args: { p_username: string }
        Returns: undefined
      }
      staff_account_delete_profile: {
        Args: { p_auth_user_id: string; p_user_id: string }
        Returns: undefined
      }
      staff_account_set_active: {
        Args: { p_active: boolean; p_user_id: string }
        Returns: undefined
      }
      staff_account_set_pin: {
        Args: { p_pin: string; p_pin_length?: number; p_user_id: string }
        Returns: undefined
      }
      staff_account_upsert: {
        Args: {
          p_auth_user_id: string
          p_email: string
          p_full_name: string
          p_is_active: boolean
          p_permissions?: Json
          p_pin: string
          p_pin_length: number
          p_role: Database["public"]["Enums"]["app_role"]
          p_role_slug: string
          p_store_id: string
          p_user_id: string
        }
        Returns: undefined
      }
      staff_role_delete: { Args: { _slug: string }; Returns: undefined }
      staff_role_save: {
        Args: {
          _base_level: string
          _name: string
          _permissions: Json
          _slug: string
        }
        Returns: undefined
      }
      stock_transfer_receive: {
        Args: {
          p_deduct_source?: boolean
          p_received_by?: string
          p_transfer_id: string
        }
        Returns: undefined
      }
      store_visible: { Args: { _store_id: string }; Returns: boolean }
      terminal_staff_list: {
        Args: { p_store_id?: string }
        Returns: {
          full_name: string
          kind: string
          pin_length: number
          role_slug: string
          store_id: string
          user_id: string
        }[]
      }
      terminal_token_claim: {
        Args: { p_device?: string; p_token_id: string }
        Returns: boolean
      }
      terminal_token_heartbeat: {
        Args: { p_activate?: boolean; p_token_id: string }
        Returns: undefined
      }
      terminal_token_status: {
        Args: { p_token_id: string }
        Returns: {
          location_id: string
          location_name: string
          status: string
        }[]
      }
      upsert_cashier: {
        Args: {
          p_full_name: string
          p_id: string
          p_is_active: boolean
          p_pin: string
          p_store_id: string
          p_username: string
        }
        Returns: string
      }
      upsert_terminal_user: {
        Args: {
          p_email: string
          p_full_name: string
          p_password: string
          p_pin: string
          p_role: Database["public"]["Enums"]["app_role"]
          p_store_id: string
          p_user_id: string
        }
        Returns: undefined
      }
      user_cluster_id: { Args: never; Returns: string }
      user_has_store_access: { Args: { _store_id: string }; Returns: boolean }
      user_store_id: { Args: never; Returns: string }
      verify_cashier_pin: {
        Args: { p_pin: string; p_username: string }
        Returns: {
          full_name: string
          id: string
          permissions: Json
          store_id: string
          username: string
        }[]
      }
      verify_terminal_pin: {
        Args: { p_pin: string; p_user_id: string }
        Returns: {
          email: string
          full_name: string
          role: Database["public"]["Enums"]["app_role"]
          store_id: string
          user_id: string
        }[]
      }
      voucher_by_token: {
        Args: { _token: string }
        Returns: {
          campaign: Json
          member_code: string
          member_name: string
          voucher: Json
        }[]
      }
      voucher_redeem: {
        Args: {
          _sale_id?: string
          _staff?: string
          _store_id?: string
          _token: string
        }
        Returns: {
          campaign_id: string
          disable_reason: string | null
          disabled_at: string | null
          disabled_by: string | null
          expires_at: string | null
          id: string
          issued_at: string
          issued_by: string | null
          issued_source: string
          member_id: string | null
          redeemed_at: string | null
          redeemed_by: string | null
          redeemed_sale_id: string | null
          status: string
          store_id: string | null
          token_slug: string
        }
        SetofOptions: {
          from: "*"
          to: "issued_vouchers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      voucher_set_status: {
        Args: {
          _reason?: string
          _role?: string
          _staff?: string
          _status: string
          _store?: string
          _token: string
        }
        Returns: {
          campaign_id: string
          disable_reason: string | null
          disabled_at: string | null
          disabled_by: string | null
          expires_at: string | null
          id: string
          issued_at: string
          issued_by: string | null
          issued_source: string
          member_id: string | null
          redeemed_at: string | null
          redeemed_by: string | null
          redeemed_sale_id: string | null
          status: string
          store_id: string | null
          token_slug: string
        }
        SetofOptions: {
          from: "*"
          to: "issued_vouchers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      voucher_token: { Args: never; Returns: string }
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
