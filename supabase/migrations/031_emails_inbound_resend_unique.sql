-- One stored row per received message. Resend (Svix) delivers at least once,
-- and two concurrent deliveries of the same email both pass the
-- check-then-insert dedup in storeInboundEmail, each drawing its own AI
-- classification and, with auto-reply on, its own reply. The service treats
-- the unique violation (23505) as "already have it". Falls back to a plain
-- index if duplicates already exist, so the migration never fails.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'emails_inbound_resend_unique') THEN
    NULL;
  ELSIF EXISTS (
    SELECT 1 FROM public.emails
     WHERE direction = 'inbound' AND resend_message_id IS NOT NULL
     GROUP BY resend_message_id HAVING count(*) > 1
  ) THEN
    RAISE NOTICE 'duplicate inbound resend_message_id rows exist; creating a non-unique index';
    CREATE INDEX emails_inbound_resend_unique ON public.emails(resend_message_id)
      WHERE direction = 'inbound' AND resend_message_id IS NOT NULL;
  ELSE
    CREATE UNIQUE INDEX emails_inbound_resend_unique ON public.emails(resend_message_id)
      WHERE direction = 'inbound' AND resend_message_id IS NOT NULL;
  END IF;
END $$;
