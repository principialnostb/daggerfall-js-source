// @ts-check
// The Courier's Cabinet: the journal's page of cosmetics for the game, bought with Seals (src/net/discordShopLaw.js).
// A ware is the account's the moment it is bought: the game reads it off `players.discord_wares` as it reads the
// shop's, and a letter in the game's mailbox says so. The spend is one guarded batch: the Seals leave the ledger only
// while the balance holds them and only once a ware, and the ware is written only beside its spend.
import { frame, refusalScreen } from './pdaFrame.js';
import { text, section, button, STYLE, divider, md, picture } from './pdaUi.js';
import { artUrl } from './journalArt.js';
import { SEAL_WARES, SEAL_KINDS, SEALS_WORD, sealWareOf, sealPrice, holdsWare, withWare, discordWareIds } from '../../src/net/discordShopLaw.js';
import { POST_SENDER } from '../../src/net/postLaw.js';
import { sealsOf } from './seaJournal.js';

/** How each kind is named on the page, and what it is in the game. */
export const KIND_WORDS = Object.freeze({
  aura: { label: 'Auras', what: 'A glow around your character that nearby players can see.' },
  title: { label: 'Titles', what: 'Shown next to your name.' },
  glyph: { label: 'Badges', what: 'A small icon next to your name.' },
  icon: { label: 'Portraits', what: 'The picture on your profile card.' },
  armory: { label: 'Tidebound set', what: 'Aura Armory pieces you wear.' },
});
const grouped = (/** @type {number} */ n) => n.toLocaleString('en-US');
/** The wax each kind's seal is pressed in on a ware's close-up. */
const KIND_WAX = Object.freeze({ aura: 'teal', title: 'gold', glyph: 'red', icon: 'blue', armory: 'violet' });
/** A ware's seal, drawn by the service: its first letter in its kind's wax; none where no picture can be signed. */
const sealOf = (/** @type {any} */ who, /** @type {any} */ w) => {
  const url = artUrl(who.env, who.origin, 'seal', { l: w.name.replace(/^The /, '').slice(0, 1), w: /** @type {Record<string, string>} */ (KIND_WAX)[w.kind] ?? 'red' });
  return url ? [picture(url, `${w.name}: a wax seal`)] : [];
};

/** The account row the cabinet reads: what it holds. @param {any} db @param {string} id */
const rowOf = (db, id) => db.prepare('SELECT id, discord_wares FROM players WHERE id = ?1').bind(id).first();

/** The cabinet's front: the Seals held, and each kind with what of it is held. @param {any} who */
async function front(who) {
  const [seals, row] = await Promise.all([sealsOf(who.ctx.db, who.player.id), rowOf(who.ctx.db, who.player.id)]);
  const parts = [
    text(`**${SEALS_WORD}:** ${grouped(seals)}\n-# Earn Seals by playing in Discord: at sea and on expeditions. Seals cannot be bought or traded.`),
    divider(),
    ...SEAL_KINDS.map((k) => {
      const of = SEAL_WARES.filter((w) => w.kind === k);
      const held = of.filter((w) => holdsWare(row, w.id)).length;
      const kw = /** @type {Record<string, { label: string, what: string }>} */ (KIND_WORDS)[k];
      return section([`**${kw.label}** · you own ${held} of ${of.length}`, `-# ${kw.what}`], button('Browse', `pda:cabinet:kind:${k}`));
    }),
    divider(),
    text('-# All items are cosmetic and give no power. They unlock for all your characters, and a letter arrives in your mailbox in the game.'),
  ];
  return frame(who, 'cabinet', parts, { actions: [button('Journal looks', 'pda:exp:shop')] });
}

/** One kind's wares: each one's look and price, or that it is yours. @param {any} who @param {string} kind */
async function kindPage(who, kind) {
  if (!SEAL_KINDS.includes(kind)) return front(who);
  const [seals, row] = await Promise.all([sealsOf(who.ctx.db, who.player.id), rowOf(who.ctx.db, who.player.id)]);
  const kw = /** @type {Record<string, { label: string, what: string }>} */ (KIND_WORDS)[kind];
  const wares = SEAL_WARES.filter((w) => w.kind === kind);
  const parts = [
    text(`### ${kw.label}\n-# ${kw.what} You hold ${grouped(seals)} ${SEALS_WORD}.`),
    ...wares.map((w) => {
      const price = sealPrice(row, w.id);
      const owned = price === null;
      return section(
        [`**${md(w.name, 60)}** · ${owned ? 'owned' : `${grouped(price)} ${SEALS_WORD}${price < w.seals ? ` (reduced from ${grouped(w.seals)} for pieces you own)` : ''}`}`, `-# ${w.look}`],
        owned ? button('Owned', `pda:cabinet:held:${w.id}`, { disabled: true }) : button(price > seals ? 'Need more Seals' : 'View', `pda:cabinet:ware:${w.id}`, { style: price > seals ? STYLE.SECONDARY : STYLE.PRIMARY }),
      );
    }),
  ];
  return frame(who, 'cabinet', parts, { title: kw.label, actions: [button('The Cabinet', 'pda:cabinet')] });
}

/** A ware close up, with the press that buys it. @param {any} who @param {string} id */
async function warePage(who, id) {
  const w = sealWareOf(id);
  if (!w) return front(who);
  const [seals, row] = await Promise.all([sealsOf(who.ctx.db, who.player.id), rowOf(who.ctx.db, who.player.id)]);
  const price = sealPrice(row, id);
  if (price === null) return kindPage(who, w.kind);
  const short = price > seals;
  return frame(
    who,
    'cabinet',
    [
      ...sealOf(who, w),
      text(`### ${md(w.name, 60)}\n${w.look}\n\n**Price:** ${grouped(price)} ${SEALS_WORD} · **You have:** ${grouped(seals)}`),
      text(short ? `-# You need ${grouped(price - seals)} more ${SEALS_WORD}.` : '-# It unlocks for all your characters right away.'),
    ],
    {
      title: w.name,
      actions: [...(short ? [] : [button(`Buy for ${grouped(price)} ${SEALS_WORD}`, `pda:cabinet:buy:${w.id}`, { style: STYLE.SUCCESS })]), button('Back', `pda:cabinet:kind:${w.kind}`)],
    },
  );
}

/**
 * A ware bought: the Seals spent once and only while held, the ware written beside its spend, and a letter posted.
 * Answers the ware, or why not (`gone`, `owned`, `seals`, `busy`).
 * @param {{ db: any, nowS: number }} ctx @param {string} playerId @param {string} id
 */
export async function buyWare(ctx, playerId, id) {
  const w = sealWareOf(id);
  if (!w) return { error: 'gone' };
  const row = await rowOf(ctx.db, playerId);
  if (!row) return { error: 'gone' };
  const price = sealPrice(row, id);
  if (price === null) return { error: 'owned' };
  const was = String(row.discord_wares ?? '');
  const next = withWare(was, id);
  const ref = `cabinet:${id}`;
  // the ware first, and only over the row as it was read, while the balance holds the price and this ware was never
  // paid for; the spend only beside it. The batch is one transaction, so neither stands without the other.
  const r = await ctx.db.batch([
    ctx.db
      .prepare(
        `UPDATE players SET discord_wares = ?2 WHERE id = ?1 AND discord_wares = ?3
           AND (SELECT COALESCE(SUM(amount), 0) FROM exp_points WHERE player_id = ?1) >= ?4
           AND NOT EXISTS (SELECT 1 FROM exp_points WHERE player_id = ?1 AND ref = ?5)`,
      )
      .bind(playerId, next, was, price, ref),
    ctx.db
      .prepare("INSERT INTO exp_points (player_id, amount, why, ref, at) SELECT ?1, ?2, 'cabinet', ?3, ?4 WHERE changes() = 1")
      .bind(playerId, -price, ref, ctx.nowS),
  ]);
  if (Number(r?.[0]?.meta?.changes) !== 1) {
    const now = await rowOf(ctx.db, playerId);
    if (discordWareIds(now).includes(id)) return { error: 'owned' };
    // the row moved under the purchase (another ware at the same moment): nothing was spent, and it is asked again
    return { error: String(now?.discord_wares ?? '') === was ? 'seals' : 'busy' };
  }
  await ctx.db
    .prepare('INSERT OR IGNORE INTO server_post (id, to_id, batch, sender, subject, body, item, sent_at) VALUES (lower(hex(randomblob(12))), ?1, ?2, ?3, ?4, ?5, NULL, ?6)')
    .bind(
      playerId,
      `cabinet:${playerId}:${id}`,
      POST_SENDER,
      `From the Courier: ${w.name}`.slice(0, 80),
      `You bought ${w.name} in the Courier’s Cabinet for ${price} ${SEALS_WORD}. ${w.look} Equip it from your account card.`.slice(0, 1200),
      ctx.nowS,
    )
    .run();
  return { ok: true, ware: w, price };
}

/**
 * The Cabinet as the journal's Activity draws it: the Seals held, each kind, and every ware with its seal's picture,
 * its price for this account (null when held whole) and whether it is held. Buying is the router's press, as in Discord.
 * @param {any} who
 */
export async function cabinetOf(who) {
  const [seals, row] = await Promise.all([sealsOf(who.ctx.db, who.player.id), rowOf(who.ctx.db, who.player.id)]);
  return {
    seals,
    word: SEALS_WORD,
    // the name a title or a glyph is shown with: the character's own
    name: String(who.character?.name ?? '').slice(0, 40) || null,
    kinds: SEAL_KINDS.map((k) => ({ key: k, ...(/** @type {Record<string, { label: string, what: string }>} */ (KIND_WORDS)[k]) })),
    wares: SEAL_WARES.map((w) => {
      const price = sealPrice(row, w.id);
      const art = sealOf(who, w)[0]?.items?.[0]?.media?.url ?? null;
      return { id: w.id, kind: w.kind, name: w.name, look: w.look, seals: w.seals, price, held: price === null, art, set: w.codes.length > 1 };
    }),
  };
}

/** The refusals, in the cabinet's words. */
const REFUSE = Object.freeze({
  seals: `You do not have enough ${SEALS_WORD}.`,
  owned: 'You already own that.',
  busy: 'Another purchase happened at the same time. Try again.',
  gone: 'That item is not in the Cabinet.',
});

export const cabinetPda = {
  key: 'cabinet',
  /** @param {any} who */
  screen: (who) => front(who),
  acts: {
    /** @param {any} who @param {string[]} args */
    kind: (who, args) => kindPage(who, String(args[0] ?? '')),
    /** @param {any} who @param {string[]} args */
    ware: (who, args) => warePage(who, String(args[0] ?? '')),
    /** @param {any} who @param {string[]} args */
    held: (who, args) => warePage(who, String(args[0] ?? '')),
    /** @param {any} who @param {string[]} args */
    async buy(who, args) {
      const r = await buyWare(who.ctx, who.player.id, String(args[0] ?? ''));
      if ('error' in r) return refusalScreen(who, /** @type {Record<string, string>} */ (REFUSE)[r.error] ?? REFUSE.gone, 'cabinet');
      return frame(
        who,
        'cabinet',
        [...sealOf(who, r.ware), text(`### You bought ${md(r.ware.name, 60)}\n${r.ware.look}\n\n-# You spent ${r.price} ${SEALS_WORD}. Check your mailbox in the game, then equip it from your account card.`)],
        { title: 'Purchased', actions: [button('The Cabinet', 'pda:cabinet', { style: STYLE.PRIMARY }), button(KIND_WORDS[r.ware.kind].label, `pda:cabinet:kind:${r.ware.kind}`)] },
      );
    },
  },
};
