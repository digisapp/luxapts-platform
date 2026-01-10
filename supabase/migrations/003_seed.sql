-- =========================
-- LuxApts Seed Data
-- =========================

-- Insert common amenities
insert into public.amenities (name, category, icon) values
  ('Doorman', 'security', 'shield'),
  ('Concierge', 'security', 'user'),
  ('24/7 Security', 'security', 'lock'),
  ('Package Room', 'security', 'package'),
  ('Gym', 'fitness', 'dumbbell'),
  ('Yoga Studio', 'fitness', 'flower'),
  ('Pool', 'outdoor', 'waves'),
  ('Rooftop Deck', 'outdoor', 'sun'),
  ('Garden', 'outdoor', 'tree'),
  ('BBQ Area', 'outdoor', 'flame'),
  ('Lounge', 'social', 'sofa'),
  ('Co-Working Space', 'social', 'briefcase'),
  ('Game Room', 'social', 'gamepad'),
  ('Movie Theater', 'social', 'film'),
  ('Pet Spa', 'pet', 'paw-print'),
  ('Dog Run', 'pet', 'dog'),
  ('Parking Garage', 'convenience', 'car'),
  ('Bike Storage', 'convenience', 'bike'),
  ('Storage Units', 'convenience', 'box'),
  ('Laundry In-Unit', 'convenience', 'shirt'),
  ('Laundry Room', 'convenience', 'washing-machine'),
  ('EV Charging', 'convenience', 'zap'),
  ('High-Speed Internet', 'tech', 'wifi'),
  ('Smart Home', 'tech', 'smartphone'),
  ('Central AC', 'comfort', 'snowflake'),
  ('Balcony', 'comfort', 'door-open'),
  ('Floor-to-Ceiling Windows', 'comfort', 'maximize'),
  ('Hardwood Floors', 'comfort', 'grid')
on conflict (name) do nothing;

-- Insert major cities
insert into public.cities (name, slug, state, country, center_lat, center_lng) values
  ('New York City', 'nyc', 'NY', 'USA', 40.7128, -74.0060),
  ('Miami', 'miami', 'FL', 'USA', 25.7617, -80.1918),
  ('Los Angeles', 'la', 'CA', 'USA', 34.0522, -118.2437),
  ('Austin', 'austin', 'TX', 'USA', 30.2672, -97.7431),
  ('Chicago', 'chicago', 'IL', 'USA', 41.8781, -87.6298),
  ('San Francisco', 'sf', 'CA', 'USA', 37.7749, -122.4194),
  ('Boston', 'boston', 'MA', 'USA', 42.3601, -71.0589),
  ('Seattle', 'seattle', 'WA', 'USA', 47.6062, -122.3321),
  ('Denver', 'denver', 'CO', 'USA', 39.7392, -104.9903),
  ('Nashville', 'nashville', 'TN', 'USA', 36.1627, -86.7816)
on conflict (slug) do nothing;

-- Insert NYC neighborhoods
insert into public.neighborhoods (city_id, name, slug, center_lat, center_lng)
select c.id, n.name, n.slug, n.lat, n.lng
from public.cities c
cross join (values
  ('Manhattan', 'manhattan', 40.7831, -73.9712),
  ('Midtown', 'midtown', 40.7549, -73.9840),
  ('Upper East Side', 'upper-east-side', 40.7736, -73.9566),
  ('Upper West Side', 'upper-west-side', 40.7870, -73.9754),
  ('Chelsea', 'chelsea', 40.7465, -74.0014),
  ('SoHo', 'soho', 40.7233, -74.0030),
  ('Tribeca', 'tribeca', 40.7163, -74.0086),
  ('Financial District', 'fidi', 40.7075, -74.0089),
  ('East Village', 'east-village', 40.7265, -73.9815),
  ('West Village', 'west-village', 40.7358, -74.0036),
  ('Williamsburg', 'williamsburg', 40.7081, -73.9571),
  ('DUMBO', 'dumbo', 40.7033, -73.9881),
  ('Long Island City', 'lic', 40.7447, -73.9485)
) as n(name, slug, lat, lng)
where c.slug = 'nyc'
on conflict (city_id, slug) do nothing;

-- Insert Miami neighborhoods
insert into public.neighborhoods (city_id, name, slug, center_lat, center_lng)
select c.id, n.name, n.slug, n.lat, n.lng
from public.cities c
cross join (values
  ('Brickell', 'brickell', 25.7617, -80.1918),
  ('Downtown Miami', 'downtown', 25.7743, -80.1937),
  ('Wynwood', 'wynwood', 25.8004, -80.1996),
  ('Miami Beach', 'miami-beach', 25.7907, -80.1300),
  ('South Beach', 'south-beach', 25.7825, -80.1340),
  ('Edgewater', 'edgewater', 25.8103, -80.1864),
  ('Midtown Miami', 'midtown-miami', 25.8052, -80.1950),
  ('Coconut Grove', 'coconut-grove', 25.7270, -80.2425),
  ('Coral Gables', 'coral-gables', 25.7215, -80.2684),
  ('Design District', 'design-district', 25.8126, -80.1926)
) as n(name, slug, lat, lng)
where c.slug = 'miami'
on conflict (city_id, slug) do nothing;

-- Create a manual listing source
insert into public.listing_sources (name, type, notes, status)
values ('Manual Entry', 'manual', 'Manually entered listings', 'active')
on conflict do nothing;
