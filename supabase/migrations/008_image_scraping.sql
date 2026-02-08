-- =========================
-- Image Scraping Tracking
-- =========================
-- Add image scraping fields to building_scrape_status

ALTER TABLE public.building_scrape_status
  ADD COLUMN IF NOT EXISTS images_scraped_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS images_scrape_success BOOLEAN,
  ADD COLUMN IF NOT EXISTS images_scrape_error TEXT,
  ADD COLUMN IF NOT EXISTS images_found INTEGER DEFAULT 0;

-- Update the scrape_jobs job_type check to include 'images'
ALTER TABLE public.scrape_jobs
  DROP CONSTRAINT IF EXISTS scrape_jobs_job_type_check;

ALTER TABLE public.scrape_jobs
  ADD CONSTRAINT scrape_jobs_job_type_check
  CHECK (job_type IN ('amenities', 'units', 'images', 'full'));

-- Add images_found column to scrape_jobs if not exists
ALTER TABLE public.scrape_jobs
  ADD COLUMN IF NOT EXISTS images_found INTEGER DEFAULT 0;

-- Index for finding buildings needing image scraping
CREATE INDEX IF NOT EXISTS idx_building_scrape_status_images_scraped
  ON public.building_scrape_status(images_scraped_at);
