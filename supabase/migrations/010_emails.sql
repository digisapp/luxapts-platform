-- Emails table for full inbox + sent tracking with AI classification
CREATE TABLE IF NOT EXISTS public.emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  thread_id UUID REFERENCES public.emails(id) ON DELETE SET NULL,
  resend_message_id TEXT,
  from_email TEXT NOT NULL,
  from_name TEXT,
  to_email TEXT NOT NULL,
  to_name TEXT,
  reply_to TEXT,
  cc TEXT,
  bcc TEXT,
  subject TEXT NOT NULL DEFAULT '(no subject)',
  body_html TEXT,
  body_text TEXT,
  status TEXT NOT NULL DEFAULT 'received'
    CHECK (status IN ('received','read','replied','sent','delivered','bounced','failed')),
  sent_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  is_starred BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB DEFAULT '{}'::jsonb,
  headers JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ,
  -- AI columns
  ai_draft_html TEXT,
  ai_draft_text TEXT,
  ai_category TEXT,
  ai_confidence REAL,
  ai_processed_at TIMESTAMPTZ,
  ai_summary TEXT
);

-- Indexes
CREATE INDEX idx_emails_direction ON public.emails(direction);
CREATE INDEX idx_emails_status ON public.emails(status);
CREATE INDEX idx_emails_created_at ON public.emails(created_at DESC);
CREATE INDEX idx_emails_thread_id ON public.emails(thread_id);
CREATE INDEX idx_emails_from_email ON public.emails(from_email);
CREATE INDEX idx_emails_to_email ON public.emails(to_email);
CREATE INDEX idx_emails_resend_message_id ON public.emails(resend_message_id) WHERE resend_message_id IS NOT NULL;
CREATE INDEX idx_emails_lead_id ON public.emails(lead_id);
CREATE INDEX idx_emails_unread ON public.emails(status) WHERE status = 'received';
CREATE INDEX idx_emails_ai_category ON public.emails(ai_category) WHERE ai_category IS NOT NULL;

-- RLS
ALTER TABLE public.emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can select emails"
  ON public.emails FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

CREATE POLICY "Admin can insert emails"
  ON public.emails FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

CREATE POLICY "Admin can update emails"
  ON public.emails FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

CREATE POLICY "Admin can delete emails"
  ON public.emails FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

CREATE POLICY "Service role can manage emails"
  ON public.emails FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
