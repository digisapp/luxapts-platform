-- =========================
-- Building Scraping & Data Sync
-- =========================

-- Track scraping status for each building
CREATE TABLE IF NOT EXISTS public.building_scrape_status (
  building_id UUID PRIMARY KEY REFERENCES public.buildings(id) ON DELETE CASCADE,

  -- Website info
  website_url TEXT,
  scrape_enabled BOOLEAN NOT NULL DEFAULT true,

  -- Amenities scraping (one-time, rarely changes)
  amenities_scraped_at TIMESTAMPTZ,
  amenities_scrape_success BOOLEAN,
  amenities_scrape_error TEXT,

  -- Units scraping (monthly)
  units_scraped_at TIMESTAMPTZ,
  units_scrape_success BOOLEAN,
  units_scrape_error TEXT,
  units_found INTEGER DEFAULT 0,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for finding buildings needing scraping
CREATE INDEX IF NOT EXISTS idx_building_scrape_status_units_scraped
  ON public.building_scrape_status(units_scraped_at);

CREATE INDEX IF NOT EXISTS idx_building_scrape_status_enabled
  ON public.building_scrape_status(scrape_enabled) WHERE scrape_enabled = true;

-- Scraping job log for debugging and monitoring
CREATE TABLE IF NOT EXISTS public.scrape_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type TEXT NOT NULL CHECK (job_type IN ('amenities', 'units', 'full')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),

  -- Scope
  building_id UUID REFERENCES public.buildings(id) ON DELETE SET NULL,
  city_id UUID REFERENCES public.cities(id) ON DELETE SET NULL,

  -- Results
  buildings_processed INTEGER DEFAULT 0,
  buildings_success INTEGER DEFAULT 0,
  buildings_failed INTEGER DEFAULT 0,
  units_found INTEGER DEFAULT 0,
  amenities_found INTEGER DEFAULT 0,

  -- Timing
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Error tracking
  errors JSONB DEFAULT '[]'::JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scrape_jobs_status ON public.scrape_jobs(status);
CREATE INDEX IF NOT EXISTS idx_scrape_jobs_created_at ON public.scrape_jobs(created_at DESC);

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_building_scrape_status_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS building_scrape_status_updated_at ON public.building_scrape_status;
CREATE TRIGGER building_scrape_status_updated_at
  BEFORE UPDATE ON public.building_scrape_status
  FOR EACH ROW
  EXECUTE FUNCTION update_building_scrape_status_updated_at();

-- Initialize scrape status for existing buildings with websites
INSERT INTO public.building_scrape_status (building_id, website_url)
SELECT b.id, b.website_url
FROM public.buildings b
WHERE b.website_url IS NOT NULL
ON CONFLICT (building_id) DO NOTHING;

-- RLS Policies for admin access
ALTER TABLE public.building_scrape_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scrape_jobs ENABLE ROW LEVEL SECURITY;

-- Only admins can manage scrape status
CREATE POLICY "Admins can manage scrape status"
  ON public.building_scrape_status
  FOR ALL
  USING (public.is_admin());

CREATE POLICY "Admins can manage scrape jobs"
  ON public.scrape_jobs
  FOR ALL
  USING (public.is_admin());

-- Anyone can view scrape status (for transparency)
CREATE POLICY "Anyone can view scrape status"
  ON public.building_scrape_status
  FOR SELECT
  USING (true);
