-- THE DISCORD PDA: a game account linked to a Discord user, the one-time codes that link them, the bot's own settings
-- kept between deploys, and the outbox of direct messages the minute clock sends.
--
--   npx wrangler d1 migrations apply daggerfall-accounts --remote
--
-- discord_links       one Discord user to one registered account, both unique. `dm` is a bit for each kind of direct
--                     message the player wants (pdaNotices.js NOTICE_KINDS); `dm_channel` the DM channel Discord made;
--                     `dm_dead` set once Discord refuses to deliver to that user. `profile_open` lets other members see the
--                     player's card from the Apps menu. `char_id` the realm character the PDA acts as, NULL for the one
--                     played last. The `*_seen` marks say how far each notice kind has been told.
-- discord_link_codes  a code the game shows, typed into Discord within ten minutes. Kept as its hash. One live code an
--                     account; asking again replaces it.
-- discord_state       the bot's own settings found or made at run time: the server, the Terminal's channel and message.
-- discord_notices     a direct message waiting to go, or gone. One a user, kind and subject (`ref`), so a notice is
--                     never sent twice. `claimed_at` holds it for the one clock firing sending it.
-- discord_reminders   the world events a player asked to be told of before they begin.

CREATE TABLE IF NOT EXISTS discord_links (
  discord_id    TEXT PRIMARY KEY,
  player_id     TEXT NOT NULL UNIQUE,
  discord_name  TEXT NOT NULL DEFAULT '',
  linked_at     INTEGER NOT NULL,
  dm            INTEGER NOT NULL DEFAULT 0,
  dm_channel    TEXT,
  dm_dead       INTEGER NOT NULL DEFAULT 0 CHECK (dm_dead IN (0, 1)),
  profile_open  INTEGER NOT NULL DEFAULT 0 CHECK (profile_open IN (0, 1)),
  char_id       TEXT,
  mail_seen     INTEGER NOT NULL DEFAULT 0,
  post_seen     INTEGER NOT NULL DEFAULT 0,
  sale_seen     INTEGER NOT NULL DEFAULT 0,
  invite_seen   INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS discord_link_codes (
  code_hash   TEXT PRIMARY KEY,
  player_id   TEXT NOT NULL UNIQUE,
  made_at     INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS discord_link_codes_expiry ON discord_link_codes (expires_at);

CREATE TABLE IF NOT EXISTS discord_state (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL,
  at     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS discord_notices (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  discord_id  TEXT NOT NULL,
  kind        TEXT NOT NULL,
  ref         TEXT NOT NULL,
  card        TEXT NOT NULL,
  made_at     INTEGER NOT NULL,
  sent_at     INTEGER,
  tries       INTEGER NOT NULL DEFAULT 0,
  claimed_at  INTEGER,
  UNIQUE (discord_id, kind, ref)
);
CREATE INDEX IF NOT EXISTS discord_notices_due ON discord_notices (sent_at, made_at);

CREATE TABLE IF NOT EXISTS discord_reminders (
  discord_id  TEXT NOT NULL,
  family      TEXT NOT NULL,
  at          INTEGER NOT NULL,
  PRIMARY KEY (discord_id, family)
);
