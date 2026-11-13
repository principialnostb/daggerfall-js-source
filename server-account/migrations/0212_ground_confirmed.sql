-- THE CONFIRMED GROUND, KEPT AS IT IS CONFIRMED (server-account/src/groundConfirmed.js).
-- A pixel is confirmed once, by the first answer three accounts give (nodeLaw witnessedFact), and stays confirmed. So the
-- day's Motherlodes pick and the held map's tiles read this table, never every pixel report ever filed.
CREATE TABLE IF NOT EXISTS ground_confirmed (
  key    TEXT PRIMARY KEY,
  report TEXT NOT NULL,
  at     INTEGER NOT NULL
);

-- A PIXEL REPORT INSERTED: its answer's third account (by second, then account) confirms the pixel at that second. A
-- pixel already kept stays as it is: the first answer to be confirmed stands.
CREATE TRIGGER IF NOT EXISTS ground_confirmed_in AFTER INSERT ON world_witness WHEN NEW.kind = 'pixel'
BEGIN
  INSERT OR IGNORE INTO ground_confirmed (key, report, at)
    SELECT NEW.key, NEW.report, third FROM (
      SELECT (SELECT at FROM world_witness WHERE kind = 'pixel' AND key = NEW.key AND report = NEW.report
        ORDER BY at, account LIMIT 1 OFFSET 2) AS third)
    WHERE third IS NOT NULL;
END;

-- THE REPORTS FILED BEFORE THIS TABLE, read into it a page a minute by the clock (cron.js `ground-fill`), never in one
-- statement: `after` is the last pixel key read. A database with no pixel report yet has nothing to read.
CREATE TABLE IF NOT EXISTS ground_confirmed_fill (
  id    INTEGER PRIMARY KEY CHECK (id = 1),
  after TEXT NOT NULL,
  done  INTEGER NOT NULL
);
INSERT OR IGNORE INTO ground_confirmed_fill (id, after, done)
  SELECT 1, '', NOT EXISTS (SELECT 1 FROM world_witness WHERE kind = 'pixel');
