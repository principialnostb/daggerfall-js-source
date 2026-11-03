-- The server issues apology: every registered account standing when this runs holds the gift `outage` (200 Aurum), a
-- ledger line of its Aurum and a letter naming it. An account made after holds none. The statement is the tool's own
-- (tools/sendServerPost.mjs `--migration outage`), and test/server/outage_post.test.js holds the two equal. Each write
-- is keyed, so a second run adds nothing.
UPDATE players SET gifts = trim(gifts || ' ' || 'outage')
WHERE handle IS NOT NULL AND instr(' ' || gifts || ' ', ' outage ') = 0;
INSERT OR IGNORE INTO aurum_ledger (account, kind, ref, amount, day, at)
SELECT p.id, 'gift', 'outage', 200, CAST(strftime('%s', 'now') AS INTEGER) / 86400, CAST(strftime('%s', 'now') AS INTEGER)
FROM players p WHERE p.handle IS NOT NULL;
INSERT OR IGNORE INTO server_post (id, to_id, batch, sender, subject, body, item, sent_at, gift)
SELECT lower(hex(randomblob(12))), p.id, 'server-issues-apology', 'The DFO Team', 'Sorry for the server issues', 'We''re sorry for the recent server issues. We know they got in the way of your time in the game.

As an apology, 200 Aurum is on your account now.

Thank you for your patience while we work on it.

With love,
The DFO Team', NULL, CAST(strftime('%s', 'now') AS INTEGER), 'outage'
FROM players p WHERE p.handle IS NOT NULL;
