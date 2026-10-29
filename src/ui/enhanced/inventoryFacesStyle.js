export const INVENTORY_FACES_CSS = `
@media (min-width: 861px) {
  .pack-shell:not(.paired) .pack-win { width:min(1104px,96vw); height:min(730px,96dvh); }
}
.pack-shell .inventory-doll-column { display:flex; flex-direction:column; gap:10px; min-height:0; width:clamp(190px,22vw,268px); }
.pack-shell .inventory-doll-column .wornmap-doll { position:relative; flex:1 1 0; min-height:0; height:auto; width:100%; aspect-ratio:auto; overflow:hidden; }
.pack-shell .inventory-doll-column .wornmap-doll > img, .pack-shell .inventory-doll-column .wornmap-doll > canvas { object-fit:contain; min-height:0; }
.pack-shell .inventory-faces { display:flex; gap:7px; min-width:0; flex:0 0 68px; height:68px; min-height:68px; max-height:68px; box-sizing:border-box; overflow:hidden; z-index:3; align-items:stretch; padding:3px; border:1px solid #484538; background:linear-gradient(#171b1d,#0a0c0e); box-shadow:inset 0 0 0 1px #08090a; }
.pack-shell .inventory-face-cards { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); grid-template-rows:minmax(0,1fr); min-height:0; gap:6px; flex:1; min-width:0; }
.pack-shell .inventory-face-card, .pack-shell .inventory-face-pages button { position:relative; padding:4px; min-width:0; border:1px solid #7c735a; box-shadow:inset 0 0 0 1px #191b1b,inset 0 2px #aaa08033,0 1px 2px #000; background:linear-gradient(135deg,#292d2e,#111416); color:#d6c799; cursor:pointer; }
.pack-shell .inventory-face-card { padding:2px; overflow:hidden; min-height:0; transition:none; animation:none; transform:none; }
.pack-shell .inventory-face-card[aria-pressed=true] { border-color:#dbb76b; background:radial-gradient(ellipse at center,#5b4c29,#211e16); box-shadow:inset 0 0 0 1px #9a7335,0 0 5px #cfa14b44; }
.pack-shell .inventory-face-card[aria-pressed=true]::after { content:'◆'; position:absolute; bottom:0; right:2px; font-size:8px; color:#f3d58e; text-shadow:0 1px #000; }
.pack-shell .inventory-face-card:hover, .pack-shell .inventory-face-card:focus-visible, .pack-shell .inventory-face-pages button:focus-visible { outline:1px solid #e4ba5b; outline-offset:1px; }
.pack-shell .inventory-face-card canvas { width:100%; height:100%; max-height:58px; object-fit:contain; display:block; image-rendering:auto; transform:scale(1.2); transform-origin:center; }
.pack-shell .inventory-face-pages { display:flex; flex-direction:column; gap:6px; width:26px; }
.pack-shell .inventory-face-pages button { flex:1; font-size:0; transition:none; animation:none; transform:none; display:grid; place-items:center; }
.pack-shell .inventory-face-pages button::before { content:''; width:7px; height:7px; border-top:2px solid #d4bf86; border-left:2px solid #d4bf86; transform:translateY(2px) rotate(45deg); filter:drop-shadow(0 1px #000); }
.pack-shell .inventory-face-pages button:last-child::before { transform:translateY(-2px) rotate(225deg); }
.pack-shell .inventory-face-pages button:hover:not(:disabled) { border-color:#d4b576; background:#383327; }
.pack-shell .inventory-face-pages button:disabled { opacity:.3; cursor:default; }
.pack-shell .inventory-faces-status { font-size:10px; color:#d6c799; align-self:center; }
@media (max-width:600px) { .pack-shell:not(.showdoll) .inventory-doll-column { display:none; } }
`;
