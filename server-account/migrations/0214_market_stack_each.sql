-- A STACK FROM THE PACK LISTED EACH: a piece from the pack may list its stack's every unit (`units` up to the stack),
-- bought a few at a time, its price a unit's. SQLite widens no CHECK in place, so the listings are rebuilt as 0186 rebuilt
-- them - every row carried, every index and trigger made again, a listing's reports kept aside and put back.
--
--   npx wrangler d1 migrations apply daggerfall-accounts --remote

CREATE TABLE IF NOT EXISTS market_reports_keep AS SELECT listing, reporter, at FROM market_reports;

-- A LISTING (0032, 0044; its columns of 0051, 0080, 0106; its triggers of 0137).
CREATE TABLE IF NOT EXISTS market_listings_new (
  id         TEXT PRIMARY KEY,
  seller     TEXT NOT NULL,
  char_id    TEXT NOT NULL,
  region     INTEGER NOT NULL CHECK (region >= 0 AND region <= 70),
  kind       TEXT NOT NULL CHECK (kind IN ('material', 'piece', 'item')),
  material   TEXT,
  provenance TEXT,
  units      INTEGER NOT NULL CHECK (units >= 1 AND units <= 5000),
  own        INTEGER NOT NULL DEFAULT 0 CHECK (own >= 0),
  bought     INTEGER NOT NULL DEFAULT 0 CHECK (bought >= 0),
  price      INTEGER NOT NULL CHECK (price >= 1 AND price <= 1000000),
  wear       INTEGER CHECK (wear IS NULL OR (wear >= 1 AND wear <= 1000)),
  fee        INTEGER NOT NULL CHECK (fee >= 1),
  at         INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  state      TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'sold', 'cancelled', 'expired', 'removed')),
  closed_at  INTEGER,
  returned   INTEGER NOT NULL DEFAULT 0 CHECK (returned IN (0, 1)),
  cancel_rid TEXT,
  rn         TEXT,
  rid        TEXT NOT NULL,
  n          TEXT NOT NULL,
  currency   TEXT NOT NULL DEFAULT 'marks' CHECK (currency IN ('marks', 'gold')),
  item       TEXT,
  board_x    INTEGER,
  board_y    INTEGER,
  vendor_map INTEGER,
  vendor_id  TEXT,
  patron_hour INTEGER,
  UNIQUE (seller, rid),
  -- MARKET-ANY: a piece from the pack is one record for gold alone, its stack one unit, or each its own when listed each
  CHECK ((kind = 'material' AND material IS NOT NULL AND provenance IS NULL AND wear IS NULL AND item IS NULL)
      OR (kind = 'piece' AND provenance IS NOT NULL AND material IS NULL AND wear IS NOT NULL AND units = 1 AND item IS NULL)
      OR (kind = 'item' AND item IS NOT NULL AND material IS NULL AND provenance IS NULL AND wear IS NULL AND units >= 1
        AND currency = 'gold')),
  FOREIGN KEY (seller) REFERENCES players(id) ON DELETE CASCADE
);
INSERT INTO market_listings_new (id, seller, char_id, region, kind, material, provenance, units, own, bought, price, wear, fee, at, expires_at, state, closed_at, returned, cancel_rid, rn, rid, n, currency, item, board_x, board_y, vendor_map, vendor_id, patron_hour)
  SELECT id, seller, char_id, region, kind, material, provenance, units, own, bought, price, wear, fee, at, expires_at, state, closed_at, returned, cancel_rid, rn, rid, n, currency, item, board_x, board_y, vendor_map, vendor_id, patron_hour FROM market_listings;
DROP TABLE market_listings;
ALTER TABLE market_listings_new RENAME TO market_listings;
CREATE INDEX IF NOT EXISTS idx_market_listings_closed ON market_listings (closed_at);
CREATE INDEX IF NOT EXISTS idx_market_open ON market_listings (state, kind, material, price);
CREATE UNIQUE INDEX IF NOT EXISTS idx_market_piece_open ON market_listings (provenance) WHERE state = 'open' AND provenance IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_market_seller ON market_listings (seller, state);
CREATE INDEX IF NOT EXISTS idx_market_vendor ON market_listings (vendor_map, vendor_id, state);
CREATE INDEX IF NOT EXISTS idx_market_vendor_expiry ON market_listings (region, expires_at) WHERE state = 'open' AND vendor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_market_vendor_region ON market_listings (region, at) WHERE state = 'open' AND vendor_id IS NOT NULL;
CREATE TRIGGER IF NOT EXISTS vendor_board_listed AFTER INSERT ON market_listings WHEN NEW.vendor_id IS NOT NULL
BEGIN
  INSERT INTO market_vendor_ver (region, ver) SELECT r, COALESCE((SELECT built FROM market_vendor_boards b WHERE b.region = r), 0) + 1 FROM (SELECT NEW.region AS r) WHERE r IS NOT NULL
    ON CONFLICT (region) DO UPDATE SET ver = ver + 1;
END;
CREATE TRIGGER IF NOT EXISTS vendor_board_listing AFTER UPDATE OF id, kind, region, material, item, own, bought, units, price, fee, wear, at,
  expires_at, state, currency, seller, vendor_map, vendor_id ON market_listings WHEN OLD.vendor_id IS NOT NULL OR NEW.vendor_id IS NOT NULL
BEGIN
  INSERT INTO market_vendor_ver (region, ver) SELECT r, COALESCE((SELECT built FROM market_vendor_boards b WHERE b.region = r), 0) + 1 FROM (SELECT OLD.region AS r UNION SELECT NEW.region) WHERE r IS NOT NULL
    ON CONFLICT (region) DO UPDATE SET ver = ver + 1;
END;
CREATE TRIGGER IF NOT EXISTS vendor_board_unlisted AFTER DELETE ON market_listings WHEN OLD.vendor_id IS NOT NULL
BEGIN
  INSERT INTO market_vendor_ver (region, ver) SELECT r, COALESCE((SELECT built FROM market_vendor_boards b WHERE b.region = r), 0) + 1 FROM (SELECT OLD.region AS r) WHERE r IS NOT NULL
    ON CONFLICT (region) DO UPDATE SET ver = ver + 1;
END;
INSERT OR IGNORE INTO market_reports (listing, reporter, at)
  SELECT k.listing, k.reporter, k.at FROM market_reports_keep k WHERE EXISTS (SELECT 1 FROM market_listings l WHERE l.id = k.listing);
DROP TABLE market_reports_keep;
