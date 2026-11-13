-- EXPEDITIONS: revenant errands sent from the Discord PDA, and the Discord game on top of them.
--
--   npx wrangler d1 migrations apply daggerfall-accounts --remote
--
-- exp_errands   the service's own ledger of errands. The save is never written here: an errand the PDA sends waits
--               (`sent`) until the game takes it up (`out`) or refuses it (`refused`); one the game sent is told here
--               (`source` 'game') so the PDA shows who is abroad. `world_at` is the world's minute it set out and `due`
--               the minute it is back, `due_at` that minute's wall second. A recall from the PDA waits (`recall`) until
--               the game calls it home (`recalled`); one never taken up is simply `cancelled`. `back` once its time came
--               and its points were counted. `contract` the day's contract it serves (`contract_day` that UTC day), and
--               `enc_*` its encounter on the road: its kind, when it is met, the choice made, whether it was told.
-- exp_points    the Expedition Points an account earned (a line each, `ref` unique so nothing is paid twice) and spent
--               (a negative line). Points buy the PDA's own looks and titles, nothing in the game.
-- exp_unlocks   the looks and titles an account bought.
-- discord_links gains the PDA frame colour and the title a player chose to show.

CREATE TABLE IF NOT EXISTS exp_errands (
  id            TEXT PRIMARY KEY,
  player_id     TEXT NOT NULL,
  char_id       TEXT NOT NULL,
  companion     TEXT NOT NULL,
  name          TEXT NOT NULL,
  rank          INTEGER NOT NULL DEFAULT 1,
  place         TEXT NOT NULL,
  venture       TEXT NOT NULL,
  seed          INTEGER NOT NULL CHECK (seed >= 0 AND seed <= 4294967295),
  world_at      INTEGER NOT NULL,
  due           INTEGER NOT NULL,
  due_at        INTEGER NOT NULL,
  sent_at       INTEGER NOT NULL,
  source        TEXT NOT NULL CHECK (source IN ('discord', 'game')),
  state         TEXT NOT NULL CHECK (state IN ('sent', 'out', 'refused', 'cancelled', 'recall', 'recalled', 'back')),
  state_at      INTEGER NOT NULL,
  why           TEXT,
  contract      INTEGER,
  contract_day  INTEGER,
  enc_kind      TEXT,
  enc_at        INTEGER,
  enc_choice    INTEGER,
  enc_told      INTEGER NOT NULL DEFAULT 0 CHECK (enc_told IN (0, 1)),
  points        INTEGER NOT NULL DEFAULT 0,
  report        TEXT,
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS exp_errands_char ON exp_errands (player_id, char_id, state);
CREATE INDEX IF NOT EXISTS exp_errands_due ON exp_errands (state, due_at);
CREATE INDEX IF NOT EXISTS exp_errands_enc ON exp_errands (enc_told, enc_at);
CREATE UNIQUE INDEX IF NOT EXISTS exp_errands_seed ON exp_errands (char_id, companion, seed);

CREATE TABLE IF NOT EXISTS exp_points (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id  TEXT NOT NULL,
  amount     INTEGER NOT NULL,
  why        TEXT NOT NULL,
  ref        TEXT NOT NULL,
  at         INTEGER NOT NULL,
  UNIQUE (player_id, ref),
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS exp_unlocks (
  player_id  TEXT NOT NULL,
  key        TEXT NOT NULL,
  at         INTEGER NOT NULL,
  PRIMARY KEY (player_id, key),
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);

ALTER TABLE discord_links ADD COLUMN pda_theme INTEGER;
ALTER TABLE discord_links ADD COLUMN pda_title TEXT;
