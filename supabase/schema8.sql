-- WhatsApp bill delivery settings (idempotent; safe to re-run).
alter table public.pos_settings
  add column if not exists whatsapp_settings jsonb not null default '{}'::jsonb;

update public.pos_settings
   set whatsapp_settings = coalesce(nullif(whatsapp_settings, '{}'::jsonb), jsonb_build_object(
        'enabled', false,
        'phoneNumberId', '',
        'format', 'summary',
        'autoSendOnSale', false,
        'autoSendOnBooking', false,
        'countryCode', '+1',
        'greeting', 'Thanks for shopping with us!',
        'signoff', 'Keep this message as your digital receipt.'
      ))
 where id = 1;

notify pgrst, 'reload schema';
