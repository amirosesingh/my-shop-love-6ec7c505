-- Deleting a product must not be blocked by its history.
-- Sales, purchase lines, transfers and adjustments all keep their own copy of
-- the product name / barcode, so the link is simply cleared instead of
-- refusing the delete. Nothing is dropped and no history rows are removed.

alter table public.sale_items
  drop constraint if exists sale_items_product_id_fkey,
  add constraint sale_items_product_id_fkey
    foreign key (product_id) references public.products(id) on delete set null;

alter table public.purchase_order_items
  drop constraint if exists purchase_order_items_product_id_fkey,
  add constraint purchase_order_items_product_id_fkey
    foreign key (product_id) references public.products(id) on delete set null;

alter table public.stock_transfer_items
  drop constraint if exists stock_transfer_items_product_id_fkey,
  add constraint stock_transfer_items_product_id_fkey
    foreign key (product_id) references public.products(id) on delete set null;

alter table public.stock_adjustments
  drop constraint if exists stock_adjustments_product_id_fkey,
  add constraint stock_adjustments_product_id_fkey
    foreign key (product_id) references public.products(id) on delete set null;

-- A promotion's free gift disappears with the product rather than blocking it.
alter table public.promotions
  drop constraint if exists promotions_foc_product_id_fkey,
  add constraint promotions_foc_product_id_fkey
    foreign key (foc_product_id) references public.products(id) on delete set null;
