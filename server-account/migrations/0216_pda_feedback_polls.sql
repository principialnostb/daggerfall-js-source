-- THE DISCORD PDA'S FEEDBACK AND POLLS: a player's idea, balance note or other word to the team, each with its card in
-- the staff's channel; and the polls the developers open, with one vote an account.
--
--   npx wrangler d1 migrations apply daggerfall-accounts --remote
--
-- pda_feedback     what a player sent. `status` is the staff's answer: new, seen, planned, done or declined, with who
--                  set it and when. Bugs and exploits never come here: they are private reports (private_reports).
-- pda_polls        a poll: its question, two to ten options as a JSON list, when it closes, who may vote ('linked' any
--                  registered account, 'played' one with an online character), and its final counts once closed.
-- pda_poll_votes   one vote an account a poll; a vote changed is the same row.
--
-- Both cards share their columns: `card_channel` and `card_id` the Discord message, `card_dirty` 1 when it must be
-- drawn again (2 while one isolate draws it, from `card_claim_at`), `card_drawn_at` the last draw, `card_tries` the
-- draws Discord refused in a row.

CREATE TABLE IF NOT EXISTS pda_feedback (
  id             TEXT PRIMARY KEY,
  player_id      TEXT NOT NULL,
  kind           TEXT NOT NULL CHECK (kind IN ('idea', 'balance', 'other')),
  title          TEXT NOT NULL CHECK (length(title) BETWEEN 3 AND 80),
  body           TEXT NOT NULL CHECK (length(body) BETWEEN 10 AND 1500),
  status         TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'seen', 'planned', 'done', 'declined')),
  made_at        INTEGER NOT NULL,
  status_at      INTEGER,
  status_by      TEXT,
  card_channel   TEXT,
  card_id        TEXT,
  card_dirty     INTEGER NOT NULL DEFAULT 1 CHECK (card_dirty IN (0, 1, 2)),
  card_claim_at  INTEGER NOT NULL DEFAULT 0,
  card_drawn_at  INTEGER NOT NULL DEFAULT 0,
  card_tries     INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS pda_feedback_player ON pda_feedback (player_id, made_at);
CREATE INDEX IF NOT EXISTS pda_feedback_status ON pda_feedback (status, made_at);
CREATE INDEX IF NOT EXISTS pda_feedback_dirty ON pda_feedback (card_dirty, made_at) WHERE card_dirty != 0;

CREATE TABLE IF NOT EXISTS pda_polls (
  id               TEXT PRIMARY KEY,
  question         TEXT NOT NULL CHECK (length(question) BETWEEN 3 AND 200),
  options          TEXT NOT NULL CHECK (json_valid(options)),
  made_by          TEXT NOT NULL,
  made_by_name     TEXT NOT NULL,
  made_at          INTEGER NOT NULL,
  closes_at        INTEGER NOT NULL,
  closed_at        INTEGER,
  eligible         TEXT NOT NULL DEFAULT 'linked' CHECK (eligible IN ('linked', 'played')),
  tallies          TEXT CHECK (tallies IS NULL OR json_valid(tallies)),
  announced        INTEGER NOT NULL DEFAULT 0 CHECK (announced IN (0, 1)),
  announce_cursor  INTEGER NOT NULL DEFAULT 0,
  card_channel     TEXT,
  card_id          TEXT,
  card_dirty       INTEGER NOT NULL DEFAULT 1 CHECK (card_dirty IN (0, 1, 2)),
  card_claim_at    INTEGER NOT NULL DEFAULT 0,
  card_drawn_at    INTEGER NOT NULL DEFAULT 0,
  card_tries       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS pda_polls_open ON pda_polls (closed_at, closes_at);
CREATE INDEX IF NOT EXISTS pda_polls_dirty ON pda_polls (card_dirty, made_at) WHERE card_dirty != 0;

CREATE TABLE IF NOT EXISTS pda_poll_votes (
  poll_id    TEXT NOT NULL,
  player_id  TEXT NOT NULL,
  choice     INTEGER NOT NULL CHECK (choice >= 0 AND choice < 10),
  at         INTEGER NOT NULL,
  PRIMARY KEY (poll_id, player_id),
  FOREIGN KEY (poll_id) REFERENCES pda_polls(id) ON DELETE CASCADE,
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS pda_poll_votes_choice ON pda_poll_votes (poll_id, choice);
