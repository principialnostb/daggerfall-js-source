-- A REGION'S WITNESSED GROUND FOR A UTC DAY (professions.js regionGround): the kinds of ground the writs are drawn
-- over, each climate once with whether any pixel of it is confirmed. Kept by the day's first scan, so every isolate
-- reads one row instead of scanning the region's pixel reports again.
CREATE TABLE IF NOT EXISTS region_ground_days (
  day    INTEGER NOT NULL,
  region INTEGER NOT NULL,
  ground TEXT NOT NULL,
  PRIMARY KEY (day, region)
);
