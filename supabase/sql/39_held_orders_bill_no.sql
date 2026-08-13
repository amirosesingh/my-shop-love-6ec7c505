-- Held tickets keep the bill number they were issued, so a parked bill still
-- carries its original number after any number of holds and resumes.
alter table public.held_orders
  add column if not exists bill_no text;
