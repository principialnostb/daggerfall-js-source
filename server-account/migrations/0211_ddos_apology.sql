-- The attack apology: every registered account standing when this runs holds the gift `ddos` (500 Aurum), a ledger
-- line of its Aurum and a letter naming it. An account made after holds none. The statement is the tool's own
-- (tools/sendServerPost.mjs `--migration ddos`), and test/server/ddos_post.test.js holds the two equal. Each write is
-- keyed, so a second run adds nothing.
UPDATE players SET gifts = trim(gifts || ' ' || 'ddos')
WHERE handle IS NOT NULL AND instr(' ' || gifts || ' ', ' ddos ') = 0;
INSERT OR IGNORE INTO aurum_ledger (account, kind, ref, amount, day, at)
SELECT p.id, 'gift', 'ddos', 500, CAST(strftime('%s', 'now') AS INTEGER) / 86400, CAST(strftime('%s', 'now') AS INTEGER)
FROM players p WHERE p.handle IS NOT NULL;
INSERT OR IGNORE INTO server_post (id, to_id, batch, sender, subject, body, item, sent_at, gift)
SELECT lower(hex(randomblob(12))), p.id, 'ddos-apology', 'The DFO Team', 'Sorry for the attack on our servers', 'Our servers were hit by a DDoS attack. We know it kept many of you from playing, and we are sorry.

As an apology, 500 Aurum is on your account now.

Thank you for sticking with us through it.

With love,
The DFO Team', NULL, CAST(strftime('%s', 'now') AS INTEGER), 'ddos'
FROM players p WHERE p.handle IS NOT NULL;
