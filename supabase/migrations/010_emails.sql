-- Emails table for inbox + sent tracking
CREATE TABLE IF NOT EXISTS public.emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'read', 'replied')),
  delivery_status TEXT DEFAULT 'sent' CHECK (delivery_status IN ('sent', 'delivered', 'bounced', 'complained', NULL)),
  from_email TEXT NOT NULL,
  from_name TEXT,
  to_email TEXT NOT NULL,
  to_name TEXT,
  subject TEXT NOT NULL DEFAULT '',
  body_html TEXT NOT NULL DEFAULT '',
  body_text TEXT,
  resend_id TEXT,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  is_starred BOOLEAN NOT NULL DEFAULT false,
  headers JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_emails_thread_id ON public.emails(thread_id);
CREATE INDEX idx_emails_direction ON public.emails(direction);
CREATE INDEX idx_emails_status ON public.emails(status);
CREATE INDEX idx_emails_delivery_status ON public.emails(delivery_status);
CREATE INDEX idx_emails_from_email ON public.emails(from_email);
CREATE INDEX idx_emails_to_email ON public.emails(to_email);
CREATE INDEX idx_emails_created_at ON public.emails(created_at DESC);
CREATE INDEX idx_emails_is_read ON public.emails(is_read) WHERE NOT is_read;
CREATE INDEX idx_emails_lead_id ON public.emails(lead_id);
CREATE INDEX idx_emails_resend_id ON public.emails(resend_id) WHERE resend_id IS NOT NULL;

-- RLS
ALTER TABLE public.emails ENABLE ROW LEVEL SECURITY;

-- Admin-only access
CREATE POLICY "Admin can manage emails"
  ON public.emails
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Service role bypass for webhook inserts
CREATE POLICY "Service role can manage emails"
  ON public.emails
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
