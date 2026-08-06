-- Line-level sales facts shared by every analytics surface.
CREATE OR REPLACE VIEW public.v_sale_line_facts
WITH (security_invoker = true) AS
SELECT
  si.id                                        AS line_id,
  si.sale_id,
  s.bill_number,
  s.store_id,
  s.cashier_name,
  s.created_at,
  (s.created_at)::date                         AS sale_day,
  to_char(s.created_at, 'YYYY-MM')             AS sale_month,
  s.payment_type,
  s.is_refunded,
  si.product_id,
  si.product_name,
  si.quantity,
  si.unit_price,
  si.unit_cost,
  si.is_foc,
  si.is_return,
  round((CASE WHEN si.discount_percent > 0
              THEN si.unit_price * si.discount_percent / 100.0
              ELSE si.discount_amount END)::numeric, 2)                    AS unit_discount,
  round((((CASE WHEN si.discount_percent > 0
                THEN si.unit_price * si.discount_percent / 100.0
                ELSE si.discount_amount END) * si.quantity)
         + coalesce(si.coupon_discount, 0))::numeric, 2)                   AS line_discount,
  round((greatest(si.unit_price - (CASE WHEN si.discount_percent > 0
                                        THEN si.unit_price * si.discount_percent / 100.0
                                        ELSE si.discount_amount END), 0) * si.quantity
         - coalesce(si.coupon_discount, 0))::numeric, 2)                   AS line_revenue,
  round((coalesce(si.unit_cost, 0) * si.quantity)::numeric, 2)             AS line_cost
FROM public.sale_items si
JOIN public.sales s ON s.id = si.sale_id;

GRANT SELECT ON public.v_sale_line_facts TO authenticated;
GRANT ALL ON public.v_sale_line_facts TO service_role;

-- Daily totals per shop.
CREATE OR REPLACE VIEW public.v_daily_store_sales
WITH (security_invoker = true) AS
SELECT
  f.sale_day,
  f.sale_month,
  f.store_id,
  count(DISTINCT f.sale_id)                       AS bills,
  round(sum(f.line_revenue), 2)                   AS revenue,
  round(sum(f.line_cost), 2)                      AS cost,
  round(sum(f.line_revenue - f.line_cost), 2)     AS profit,
  round(sum(f.line_discount), 2)                  AS discount,
  round(sum(CASE WHEN f.is_foc THEN f.unit_price * f.quantity ELSE 0 END), 2) AS foc_value,
  round(sum(f.quantity), 2)                       AS units
FROM public.v_sale_line_facts f
GROUP BY f.sale_day, f.sale_month, f.store_id;

GRANT SELECT ON public.v_daily_store_sales TO authenticated;
GRANT ALL ON public.v_daily_store_sales TO service_role;

-- Daily item mix per shop.
CREATE OR REPLACE VIEW public.v_daily_item_sales
WITH (security_invoker = true) AS
SELECT
  f.sale_day,
  f.sale_month,
  f.store_id,
  f.product_id,
  f.product_name,
  round(sum(f.quantity), 2)                       AS units,
  round(sum(f.line_revenue), 2)                   AS revenue,
  round(sum(f.line_cost), 2)                      AS cost,
  round(sum(f.line_revenue - f.line_cost), 2)     AS profit
FROM public.v_sale_line_facts f
GROUP BY f.sale_day, f.sale_month, f.store_id, f.product_id, f.product_name;

GRANT SELECT ON public.v_daily_item_sales TO authenticated;
GRANT ALL ON public.v_daily_item_sales TO service_role;