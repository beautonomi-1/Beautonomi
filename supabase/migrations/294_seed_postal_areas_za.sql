-- Seed postal_areas for South Africa (ZA) so Service Zones Control Plane search and include work.
-- Geometry is simplified placeholder polygons (rough bounds). Replace with real boundary data for production.
-- See docs/SERVICE_ZONES_CONTROL_PLANE.md for loading full datasets.

-- Idempotent: remove only these seeded postal codes so re-run replaces them.
DELETE FROM postal_areas
WHERE country_code = 'ZA'
  AND postal_code IN ('8001','8005','7441','7800','7600','7646','2000','2196','0002','4001','4320');

INSERT INTO postal_areas (country_code, province_name, city_name, town_name, postal_code, geom)
VALUES
  -- Cape Town CBD
  (
    'ZA',
    'Western Cape',
    'Cape Town',
    'City Bowl',
    '8001',
    ST_SetSRID(ST_GeomFromGeoJSON('{"type":"Polygon","coordinates":[[[18.415,-33.918],[18.425,-33.918],[18.425,-33.928],[18.415,-33.928],[18.415,-33.918]]]}'), 4326)
  ),
  -- Woodstock
  (
    'ZA',
    'Western Cape',
    'Cape Town',
    'Woodstock',
    '8005',
    ST_SetSRID(ST_GeomFromGeoJSON('{"type":"Polygon","coordinates":[[[18.440,-33.930],[18.452,-33.930],[18.452,-33.942],[18.440,-33.942],[18.440,-33.930]]]}'), 4326)
  ),
  -- Milnerton
  (
    'ZA',
    'Western Cape',
    'Cape Town',
    'Milnerton',
    '7441',
    ST_SetSRID(ST_GeomFromGeoJSON('{"type":"Polygon","coordinates":[[[18.498,-33.868],[18.522,-33.868],[18.522,-33.892],[18.498,-33.892],[18.498,-33.868]]]}'), 4326)
  ),
  -- Constantia
  (
    'ZA',
    'Western Cape',
    'Cape Town',
    'Constantia',
    '7800',
    ST_SetSRID(ST_GeomFromGeoJSON('{"type":"Polygon","coordinates":[[[18.418,-34.022],[18.452,-34.022],[18.452,-34.048],[18.418,-34.048],[18.418,-34.022]]]}'), 4326)
  ),
  -- Stellenbosch
  (
    'ZA',
    'Western Cape',
    'Stellenbosch',
    'Stellenbosch',
    '7600',
    ST_SetSRID(ST_GeomFromGeoJSON('{"type":"Polygon","coordinates":[[[18.848,-33.928],[18.882,-33.928],[18.882,-33.958],[18.848,-33.958],[18.848,-33.928]]]}'), 4326)
  ),
  -- Paarl
  (
    'ZA',
    'Western Cape',
    'Paarl',
    'Paarl',
    '7646',
    ST_SetSRID(ST_GeomFromGeoJSON('{"type":"Polygon","coordinates":[[[18.968,-33.718],[19.002,-33.718],[19.002,-33.748],[18.968,-33.748],[18.968,-33.718]]]}'), 4326)
  ),
  -- Johannesburg CBD (Gauteng)
  (
    'ZA',
    'Gauteng',
    'Johannesburg',
    'Johannesburg Central',
    '2000',
    ST_SetSRID(ST_GeomFromGeoJSON('{"type":"Polygon","coordinates":[[[28.038,-26.208],[28.058,-26.208],[28.058,-26.228],[28.038,-26.228],[28.038,-26.208]]]}'), 4326)
  ),
  -- Sandton
  (
    'ZA',
    'Gauteng',
    'Johannesburg',
    'Sandton',
    '2196',
    ST_SetSRID(ST_GeomFromGeoJSON('{"type":"Polygon","coordinates":[[[28.048,-26.108],[28.078,-26.108],[28.078,-26.138],[28.048,-26.138],[28.048,-26.108]]]}'), 4326)
  ),
  -- Rosebank
  (
    'ZA',
    'Gauteng',
    'Johannesburg',
    'Rosebank',
    '2196',
    ST_SetSRID(ST_GeomFromGeoJSON('{"type":"Polygon","coordinates":[[[28.038,-26.148],[28.058,-26.148],[28.058,-26.168],[28.038,-26.168],[28.038,-26.148]]]}'), 4326)
  ),
  -- Pretoria (Tshwane)
  (
    'ZA',
    'Gauteng',
    'Pretoria',
    'Pretoria Central',
    '0002',
    ST_SetSRID(ST_GeomFromGeoJSON('{"type":"Polygon","coordinates":[[[28.178,-25.748],[28.208,-25.748],[28.208,-25.778],[28.178,-25.778],[28.178,-25.748]]]}'), 4326)
  ),
  -- Durban (KwaZulu-Natal)
  (
    'ZA',
    'KwaZulu-Natal',
    'Durban',
    'Durban Central',
    '4001',
    ST_SetSRID(ST_GeomFromGeoJSON('{"type":"Polygon","coordinates":[[[31.028,-29.858],[31.058,-29.858],[31.058,-29.888],[31.028,-29.888],[31.028,-29.858]]]}'), 4326)
  ),
  -- Umhlanga
  (
    'ZA',
    'KwaZulu-Natal',
    'Durban',
    'Umhlanga',
    '4320',
    ST_SetSRID(ST_GeomFromGeoJSON('{"type":"Polygon","coordinates":[[[31.078,-29.728],[31.108,-29.728],[31.108,-29.758],[31.078,-29.758],[31.078,-29.728]]]}'), 4326)
  );
