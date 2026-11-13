-- The journal's Activity: the Courier's Cabinet and the Eltheric Ocean.
--
-- players.discord_wares   the cabinet's wares the account holds, ids space-separated (src/net/discordShopLaw.js).
--                         Bought with Seals; the Seals ledger is exp_points (0218), one line an earning or a spend.
-- sea_captains            a character at sea in the journal: its ship as read from the save when it set sail, where it
--                         is (a world pixel, or a course from one to another), its hurts, and what it is doing.
-- sea_battles             a fight between two captains (or a captain and a raider the service sails): its rounds,
--                         the orders given, and how it ended.
-- sea_log                 each captain's log: what happened, in a line, for the journal and the Seals it paid.

ALTER TABLE players ADD COLUMN discord_wares TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS sea_captains (
  char_id     TEXT PRIMARY KEY,
  player_id   TEXT NOT NULL,
  name        TEXT NOT NULL,
  ship        TEXT NOT NULL,
  x           REAL NOT NULL,
  y           REAL NOT NULL,
  to_x        REAL,
  to_y        REAL,
  set_at      INTEGER NOT NULL DEFAULT 0,
  speed       REAL NOT NULL DEFAULT 0,
  hull        INTEGER NOT NULL,
  sail        INTEGER NOT NULL,
  crew        INTEGER NOT NULL,
  stores      INTEGER NOT NULL DEFAULT 0,
  barrels     INTEGER NOT NULL DEFAULT 0,
  loads       TEXT NOT NULL DEFAULT '',
  state       TEXT NOT NULL DEFAULT 'sea',
  isle        TEXT,
  ix          INTEGER,
  iy          INTEGER,
  battle      TEXT,
  wins        INTEGER NOT NULL DEFAULT 0,
  losses      INTEGER NOT NULL DEFAULT 0,
  seen_at     INTEGER NOT NULL,
  hurt_at     INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS sea_captains_player ON sea_captains (player_id);
CREATE INDEX IF NOT EXISTS sea_captains_near ON sea_captains (x, y);
CREATE INDEX IF NOT EXISTS sea_captains_seen ON sea_captains (seen_at);

CREATE TABLE IF NOT EXISTS sea_battles (
  id          TEXT PRIMARY KEY,
  a           TEXT NOT NULL,
  b           TEXT NOT NULL,
  foe         TEXT,
  round       INTEGER NOT NULL DEFAULT 1,
  state       TEXT NOT NULL,
  orders_a    TEXT,
  orders_b    TEXT,
  due_at      INTEGER NOT NULL,
  began_at    INTEGER NOT NULL,
  ended_at    INTEGER,
  winner      TEXT,
  seed        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sea_battles_open ON sea_battles (ended_at, due_at);

CREATE TABLE IF NOT EXISTS sea_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  char_id     TEXT NOT NULL,
  at          INTEGER NOT NULL,
  kind        TEXT NOT NULL,
  words       TEXT NOT NULL,
  seals       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS sea_log_char ON sea_log (char_id, at);
