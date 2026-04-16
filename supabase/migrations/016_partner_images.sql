-- Migration 016: Allow partners to manage images for their own buildings
-- Partners can insert/delete images for buildings where partner_user_id = their user ID

-- Insert: partner can add images to buildings they own
CREATE POLICY "building_images_partner_insert"
  ON building_images
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM buildings
      WHERE buildings.id = building_images.building_id
        AND buildings.partner_user_id = auth.uid()
    )
  );

-- Update: partner can update images (e.g. set primary) for buildings they own
CREATE POLICY "building_images_partner_update"
  ON building_images
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM buildings
      WHERE buildings.id = building_images.building_id
        AND buildings.partner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM buildings
      WHERE buildings.id = building_images.building_id
        AND buildings.partner_user_id = auth.uid()
    )
  );

-- Delete: partner can remove images from buildings they own
CREATE POLICY "building_images_partner_delete"
  ON building_images
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM buildings
      WHERE buildings.id = building_images.building_id
        AND buildings.partner_user_id = auth.uid()
    )
  );

-- Index: speed up partner_user_id lookups on buildings (if not already present)
CREATE INDEX IF NOT EXISTS buildings_partner_user_id_idx ON buildings(partner_user_id);
