-- THE DISCORD PDA'S MARKET BOARD: the region whose board a character trades at from Discord. In the game the board is
-- the town the character stands in; from Discord there is no town, so the player chooses a region once and the PDA
-- lists, orders and buys there until they choose another. Any of the world's regions, 0 to 70.
--
--   npx wrangler d1 migrations apply daggerfall-accounts --remote

CREATE TABLE IF NOT EXISTS pda_boards (
  player_id  TEXT NOT NULL,
  char_id    TEXT NOT NULL,
  region     INTEGER NOT NULL CHECK (region >= 0 AND region <= 70),
  at         INTEGER NOT NULL,
  PRIMARY KEY (player_id, char_id),
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);
