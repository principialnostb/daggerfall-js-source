import { BODY_MORPH_FIELDS, getBodyMorphs, setBodyMorph, getUnderwearEnabled, setUnderwearEnabled, getBodyHairEnabled, setBodyHairEnabled, getAppearanceIdentity, setAppearanceIdentity } from '../characters/bodyMorphs.js';

const GROUPS = [
  { id: 'all', title: 'Общие пропорции', description: 'Масштаб и общий силуэт', keys: ['height', 'bodyWidth', 'bodyFullness'] },
  { id: 'chest', title: 'Плечи и грудь', description: 'Ширина плечевого пояса, грудной клетки и форма груди', keys: ['shoulderWidth', 'ribcageWidth', 'breastSize', 'breastProjection'] },
  { id: 'torso', title: 'Талия и живот', description: 'Ширина талии и объём живота', keys: ['waistWidth', 'abdomenVolume'] },
  { id: 'hips', title: 'Таз и ягодицы', description: 'Ширина таза и объём/выступ ягодиц', keys: ['hipWidth', 'buttockSize', 'buttockProjection'] },
  { id: 'arms', title: 'Руки', description: 'Толщина и длина рук', keys: ['armThickness', 'armLength'] },
  { id: 'legs', title: 'Ноги', description: 'Толщина бёдер и голеней, длина ног и расстояние между ними', keys: ['thighThickness', 'calfThickness', 'legLength', 'legGap'] },
  { id: 'head', title: 'Голова', description: 'Масштаб головы', keys: ['headScale'] },
];
const labelByKey = new Map(BODY_MORPH_FIELDS.map(([key, label]) => [key, label]));
// User-observed effects on the current mesh. Labels describe the visible result,
// not the control's legacy/internal name.
const diagnosticLabels = new Map([
  ['height', 'Высота туловища'],
  ['bodyWidth', 'Ширина тела'],
  ['bodyFullness', 'Толщина тела (вид сбоку)'],
  ['shoulderWidth', 'Ширина верхней части корпуса'],
  ['ribcageWidth', 'Ширина нижней части корпуса'],
  ['breastSize', 'Выпуклость живота'],
  ['breastProjection', 'Выступ живота вперёд'],
  ['waistWidth', 'Ширина паховой области и бёдер у паха'],
  ['abdomenVolume', 'Деформация живота, ягодиц и паховой зоны'],
  ['hipWidth', 'Ширина таза (эффект не обнаружен)'],
  ['buttockSize', 'Форма нижней части ягодиц (слабый эффект)'],
  ['buttockProjection', 'Выступ ягодиц назад (почти незаметно)'],
  ['headScale', 'Размер головы'],
  ['armThickness', 'Ширина рук (вид спереди)'],
  ['armLength', 'Длина рук (эффект не обнаружен)'],
  ['thighThickness', 'Расстояние между коленями: бёдра'],
  ['calfThickness', 'Расстояние между коленями: голени'],
  ['legLength', 'Длина голеней'],
  ['legGap', 'Расстояние между коленями и ступнями'],
]);
const clamp = (n) => Math.max(-1, Math.min(1, n));

const STYLE = `
#mw-appearance-editor{--mw-bg:#181b18;--mw-panel:#222722;--mw-panel-raised:#2b312b;--mw-line:#465047;--mw-text:#e4e9df;--mw-muted:#aeb9aa;--mw-accent:#8ea77b;--mw-accent-strong:#c6dcae;position:fixed;inset:0;z-index:10050;display:flex;align-items:center;justify-content:center;padding:clamp(10px,2vw,28px);background:rgba(7,9,7,.82);color:var(--mw-text);font:14px/1.45 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
#mw-appearance-editor *{box-sizing:border-box}
#mw-appearance-editor button,#mw-appearance-editor input{font:inherit}
#mw-appearance-editor .mw-editor-shell{width:min(1440px,100%);height:min(940px,94vh);min-height:480px;display:grid;grid-template-rows:auto minmax(0,1fr);overflow:hidden;background:var(--mw-bg);border:2px solid #53644f;outline:1px solid #303a30;box-shadow:0 0 0 4px #100f0b,0 24px 80px #000d}
#mw-appearance-editor .mw-topbar{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:17px 22px;border-bottom:1px solid var(--mw-line);background:linear-gradient(#303831,#252b25 55%,#1f241f)}
#mw-appearance-editor .mw-brand{display:flex;align-items:center;gap:13px;min-width:0}
#mw-appearance-editor .mw-mark{display:grid;place-items:center;width:38px;height:38px;flex:0 0 38px;border:1px solid #586854;border-radius:0;color:var(--mw-accent-strong);font-size:24px;background:#1a2019;box-shadow:inset 0 0 0 3px #303a2d}
#mw-appearance-editor .mw-title{font-size:18px;font-weight:750;letter-spacing:.01em}
#mw-appearance-editor .mw-subtitle{margin-top:2px;color:var(--mw-muted);font-size:12px}
#mw-appearance-editor .mw-top-actions{display:flex;align-items:center;gap:12px}
#mw-appearance-editor .mw-state{display:inline-flex;align-items:center;gap:7px;padding:6px 10px;border:1px solid #475342;border-radius:999px;color:#c7d3b9;background:#293126;font-size:11px;white-space:nowrap}
#mw-appearance-editor .mw-state:before{content:"";width:6px;height:6px;border-radius:50%;background:#a8c58a;box-shadow:0 0 8px #a8c58a66}
#mw-appearance-editor .mw-main{display:grid;grid-template-columns:minmax(0,1.02fr) minmax(440px,.98fr);min-height:0}
#mw-appearance-editor .mw-preview-side{position:relative;display:grid;grid-template-rows:auto minmax(0,1fr) auto;min-height:0;padding:18px;background:radial-gradient(ellipse at 50% 38%,#30392f 0,#222921 42%,#171b17 78%)}
#mw-appearance-editor .mw-preview-head{display:flex;justify-content:space-between;align-items:start;gap:12px;padding:0 4px 10px}
#mw-appearance-editor .mw-section-title{font-size:13px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:#e3dfd1}
#mw-appearance-editor .mw-section-note{font-size:12px;color:var(--mw-muted);margin-top:3px}
#mw-appearance-editor .mw-canvas-wrap{position:relative;min-height:0;overflow:hidden;border:1px solid #4c584b;border-radius:0;background:radial-gradient(ellipse at 50% 40%,#3a4437 0,#252d25 46%,#171b17 82%)}
#mw-appearance-editor canvas{display:block;width:100%;height:100%;touch-action:none;cursor:grab}
#mw-appearance-editor canvas:active{cursor:grabbing}
#mw-appearance-editor .mw-preview-tools{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 2px 0}
#mw-appearance-editor .mw-tool-group{display:flex;align-items:center;gap:6px}
#mw-appearance-editor .mw-zoom-value{min-width:48px;text-align:center;color:#d9e3d3;font-size:12px;font-variant-numeric:tabular-nums}
#mw-appearance-editor .mw-hint{max-width:50%;text-align:right;color:var(--mw-muted);font-size:11px}
#mw-appearance-editor .mw-controls{display:flex;flex-direction:column;min-height:0;overflow:hidden;border-left:1px solid var(--mw-line);background:#1b201b}
#mw-appearance-editor .mw-controls-head{padding:13px 16px 11px;border-bottom:1px solid var(--mw-line)}
#mw-appearance-editor .mw-controls-head h2{font-size:20px;line-height:1.2;margin:0;font-weight:750}
#mw-appearance-editor .mw-controls-head p{font-size:11px;line-height:1.35;color:var(--mw-muted);margin:5px 0 9px}
#mw-appearance-editor .mw-identity-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 8px}
#mw-appearance-editor .mw-choice-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:9px}
#mw-appearance-editor .mw-choice-group{min-width:0;padding:9px;border:1px solid var(--mw-line);background:#1d221d}
#mw-appearance-editor .mw-choice-title{margin:0 0 7px;color:var(--mw-accent-strong);font-size:12px;font-weight:750;letter-spacing:.04em;text-transform:uppercase}
#mw-appearance-editor .mw-choice-group .mw-underwear{display:grid;grid-template-columns:58px minmax(0,1fr);align-items:center;gap:6px;min-width:0;margin:0;padding:0}
#mw-appearance-editor .mw-choice-group .mw-underwear span{font-size:11px;white-space:nowrap}
#mw-appearance-editor .mw-choice-group select{width:100%;max-width:100%;min-width:0;margin:0!important;padding:7px!important;font-size:12px!important}
#mw-appearance-editor .mw-identity-grid .mw-underwear{display:grid;grid-template-columns:58px minmax(0,1fr);align-items:center;gap:6px;min-width:0;margin:0;padding:6px 8px}
#mw-appearance-editor .mw-identity-grid .mw-underwear span{font-size:11px;white-space:nowrap}
#mw-appearance-editor .mw-identity-grid select{width:100%;max-width:100%;min-width:0;margin:0!important;padding:6px!important;font-size:12px!important}
#mw-appearance-editor .mw-options-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 8px;margin-top:8px}
#mw-appearance-editor .mw-options-grid .mw-underwear{align-items:flex-start;min-width:0;margin:0;padding:7px 8px;gap:7px}
#mw-appearance-editor .mw-options-grid .mw-underwear span{min-width:0;font-size:11px;line-height:1.3}
#mw-appearance-editor .mw-options-grid .mw-underwear small{font-size:10px;line-height:1.3}
#mw-appearance-editor .mw-control-list{min-height:0;overflow:auto;padding:15px 18px 20px;scrollbar-color:#59604f transparent;scrollbar-width:thin}#mw-appearance-editor .mw-zone-nav{display:flex;flex-wrap:wrap;gap:5px;padding:10px 14px;border-bottom:1px solid #394239;background:#202620}#mw-appearance-editor .mw-zone-btn{min-height:29px;padding:5px 8px;font-size:11px;font-weight:600;color:#c6d2c1;background:#252d25;border-color:#3f4c3e}#mw-appearance-editor .mw-zone-btn.active{background:#52664a;color:#f1f7eb;border-color:#9ab48a;box-shadow:inset 0 -2px #c5dcb5}#mw-appearance-editor .mw-group[hidden]{display:none}#mw-appearance-editor .mw-underwear{display:flex;align-items:center;gap:10px;margin-top:12px;padding:10px 12px;border:1px solid #465047;background:#202620;color:#dfe7dc;font-size:12px}#mw-appearance-editor .mw-underwear input{width:16px;height:16px;accent-color:#8ea77b}#mw-appearance-editor .mw-underwear small{display:block;color:#aeb9aa;font-size:11px;margin-top:2px}
#mw-appearance-editor .mw-group{margin:0 0 12px;padding:0;border:1px solid var(--mw-line);border-radius:0;background:#252c25;overflow:hidden}
#mw-appearance-editor .mw-group-head{padding:11px 13px;border-bottom:1px solid #363d32;background:#2c342c}
#mw-appearance-editor .mw-group-title{font-size:13px;font-weight:700;color:#dce6d6}
#mw-appearance-editor .mw-group-note{margin-top:2px;font-size:11px;color:var(--mw-muted)}
#mw-appearance-editor .mw-group-fields{padding:6px 13px 9px}
#mw-appearance-editor .mw-slider-row{display:grid;grid-template-columns:minmax(105px,1fr) minmax(80px,1.25fr) 42px;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #34392f}
#mw-appearance-editor .mw-slider-row:last-child{border-bottom:0}
#mw-appearance-editor .mw-slider-label{font-size:12px;color:#e2e2d8}
#mw-appearance-editor input[type=range]{appearance:none;width:100%;margin:0;cursor:pointer;height:7px;border:1px solid #4d5b4b;background:linear-gradient(90deg,#8ea77b 0%,#8ea77b var(--range-fill,50%),#303830 var(--range-fill,50%),#303830 100%);outline:none}#mw-appearance-editor input[type=range]::-webkit-slider-thumb{appearance:none;width:12px;height:17px;border:1px solid #c8d9bc;background:linear-gradient(#d3e3c8,#7f9a6b);box-shadow:0 1px 3px #0008}#mw-appearance-editor input[type=range]::-moz-range-thumb{width:12px;height:17px;border:1px solid #c8d9bc;border-radius:0;background:linear-gradient(#d3e3c8,#7f9a6b);box-shadow:0 1px 3px #0008}
#mw-appearance-editor output{color:var(--mw-accent-strong);font-size:11px;text-align:right;font-variant-numeric:tabular-nums}
#mw-appearance-editor .mw-footer{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:13px 18px;border-top:1px solid var(--mw-line);background:#1a201a}
#mw-appearance-editor .mw-footer-note{color:var(--mw-muted);font-size:11px}
#mw-appearance-editor .mw-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:34px;padding:7px 11px;border:1px solid #4c594a;border-radius:0;background:linear-gradient(#333c33,#252d25);color:#dfe7dc;font-size:12px;font-weight:650;cursor:pointer;transition:background .15s,border-color .15s,transform .15s}
#mw-appearance-editor .mw-btn:hover{background:#3a4839;border-color:#8ea77b}
#mw-appearance-editor .mw-btn:active{transform:translateY(1px)}
#mw-appearance-editor .mw-btn-primary{border-color:#a6c392;background:linear-gradient(#c4d9b4,#78986a);color:#172017}
#mw-appearance-editor .mw-btn-primary:hover{background:#ddc18a;border-color:#ddc18a}
#mw-appearance-editor .mw-btn-icon{width:34px;padding:0;font-size:17px}
#mw-appearance-editor .mw-close{width:34px;height:34px;padding:0;border-radius:8px;font-size:19px}
#mw-appearance-editor .mw-status-message{position:absolute;left:18px;right:18px;top:50%;transform:translateY(-50%);text-align:center;padding:18px;color:#deded3;font-size:13px;pointer-events:none}
@media(max-width:850px){#mw-appearance-editor .mw-editor-shell{height:96vh}#mw-appearance-editor .mw-main{grid-template-columns:minmax(0,1fr) minmax(310px,.9fr)}#mw-appearance-editor .mw-preview-side{padding:12px}#mw-appearance-editor .mw-controls-head{padding:15px}#mw-appearance-editor .mw-control-list{padding:10px}#mw-appearance-editor .mw-slider-row{grid-template-columns:95px minmax(60px,1fr) 36px;gap:7px}}
#mw-appearance-editor .mw-identity-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
@media(max-width:650px){#mw-appearance-editor .mw-identity-grid{grid-template-columns:1fr}#mw-appearance-editor .mw-choice-grid{grid-template-columns:1fr}#mw-appearance-editor .mw-options-grid{grid-template-columns:1fr}#mw-appearance-editor{padding:0}#mw-appearance-editor .mw-editor-shell{width:100%;height:100dvh;min-height:0;border-radius:0;border:0}#mw-appearance-editor .mw-topbar{padding:12px 14px}#mw-appearance-editor .mw-title{font-size:16px}#mw-appearance-editor .mw-subtitle{font-size:11px}#mw-appearance-editor .mw-state{display:none}#mw-appearance-editor .mw-main{grid-template-columns:1fr;grid-template-rows:minmax(230px,.85fr) minmax(0,1.15fr)}#mw-appearance-editor .mw-preview-side{padding:10px;grid-template-rows:auto minmax(0,1fr) auto}#mw-appearance-editor .mw-preview-head{padding-bottom:6px}#mw-appearance-editor .mw-preview-tools{padding-top:7px}#mw-appearance-editor .mw-controls{border-left:0;border-top:1px solid var(--mw-line)}#mw-appearance-editor .mw-controls-head{padding:12px 15px}#mw-appearance-editor .mw-controls-head h2{font-size:17px}#mw-appearance-editor .mw-control-list{padding:9px 12px}#mw-appearance-editor .mw-group{margin-bottom:8px}#mw-appearance-editor .mw-footer{padding:10px 12px}#mw-appearance-editor .mw-footer-note{display:none}#mw-appearance-editor .mw-hint{max-width:46%;font-size:10px}}
/* Shared visual language with the game's enhanced menu and inventory: charcoal panels, brass focus, square bevels. */
#mw-appearance-editor{--mw-bg:#17191c;--mw-panel:#202328;--mw-panel-raised:#292d33;--mw-line:#454a52;--mw-text:#e8e1d2;--mw-muted:#aaa79f;--mw-accent:#b99a5b;--mw-accent-strong:#e1c783;background:rgba(4,5,7,.86);font-family:Georgia,'Times New Roman',serif}
#mw-appearance-editor .mw-editor-shell{background:var(--mw-bg);border:1px solid #8c7548;outline:1px solid #29251d;box-shadow:0 0 0 3px #090a0c,0 24px 80px #000e}
#mw-appearance-editor .mw-topbar{background:linear-gradient(#303238,#24272c 55%,#1b1d21);border-bottom:1px solid #786541}
#mw-appearance-editor .mw-mark{border:1px solid #8b754a;color:#e1c783;background:#17191d;box-shadow:inset 0 0 0 2px #393127}
#mw-appearance-editor .mw-state{border-color:#5e5038;border-radius:2px;color:#e1d2ad;background:#28251f}
#mw-appearance-editor .mw-state:before{background:#c7a45c;box-shadow:0 0 7px #c7a45c55}
#mw-appearance-editor .mw-advanced-toggle{display:flex;width:calc(100% - 28px);margin:12px 14px 8px;min-height:42px;justify-content:space-between;padding:10px 13px;border-color:#8c7548;background:linear-gradient(#343237,#25262b);color:#e1c783;text-align:left;font-size:13px}
#mw-appearance-editor .mw-advanced-toggle[aria-expanded="true"]{background:#332e24;border-color:#d0ad62}
#mw-appearance-editor .mw-advanced-panel{min-height:0;overflow:auto;border-top:1px solid #49443a}
#mw-appearance-editor .mw-advanced-panel[hidden]{display:none}
#mw-appearance-editor .mw-advanced-note{margin:10px 14px 0;padding:9px 11px;border-left:3px solid #c3a15d;background:#28251f;color:#d4c7a7;font-size:11px;line-height:1.45}
#mw-appearance-editor .mw-identity-grid .mw-underwear{background:#24262a;border-color:#45413a}
#mw-appearance-editor .mw-identity-grid select{background:#17191e!important;color:#e9e4d9!important;border:1px solid #62513a!important;border-radius:2px}
#mw-appearance-editor .mw-preview-side{background:radial-gradient(ellipse at 50% 38%,#34373b 0,#25282d 45%,#17191c 82%)}
#mw-appearance-editor .mw-section-title{color:#e1c783;letter-spacing:.08em}
#mw-appearance-editor .mw-canvas-wrap{border:1px solid #66583e;border-radius:2px;background:radial-gradient(ellipse at 50% 40%,#35383d 0,#25282d 48%,#17191c 82%)}
#mw-appearance-editor .mw-controls{border-left:1px solid #45413a;background:#1b1d21}
#mw-appearance-editor .mw-controls-head{border-bottom:1px solid #49443a}
#mw-appearance-editor .mw-controls-head h2{color:#e8e1d2;font-family:Georgia,'Times New Roman',serif;font-weight:700}
#mw-appearance-editor .mw-zone-btn{color:#d3c8ad;background:#25272b;border-color:#4b463b;border-radius:2px}
#mw-appearance-editor .mw-zone-btn.active{background:#51452e;color:#fff0c8;border-color:#c5a35c;box-shadow:inset 0 -2px #d8b96f}
#mw-appearance-editor .mw-underwear{border-color:#514939;background:#24241f;color:#e8e1d2}
#mw-appearance-editor .mw-group{border-color:#45413a;border-radius:2px;background:#222429}
#mw-appearance-editor .mw-group-head{border-bottom-color:#49443a;background:#2b2d32}
#mw-appearance-editor .mw-group-title{color:#e1c783}
#mw-appearance-editor .mw-slider-row{border-bottom-color:#383a3f}
#mw-appearance-editor .mw-slider-label{color:#e2ddd2}
#mw-appearance-editor input[type=range]{border-color:#5b513d;background:linear-gradient(90deg,#b99a5b 0%,#b99a5b var(--range-fill,50%),#303238 var(--range-fill,50%),#303238 100%)}
#mw-appearance-editor input[type=range]::-webkit-slider-thumb{border-color:#e2c783;background:linear-gradient(#f0d99c,#a98543);box-shadow:0 1px 3px #0009}
#mw-appearance-editor input[type=range]::-moz-range-thumb{border-color:#e2c783;border-radius:1px;background:linear-gradient(#f0d99c,#a98543);box-shadow:0 1px 3px #0009}
#mw-appearance-editor .mw-footer{border-top-color:#45413a;background:#191b1f}
#mw-appearance-editor .mw-btn{border-color:#62563e;border-radius:2px;background:linear-gradient(#37383b,#25272b);color:#e7dfcf;font-family:Georgia,'Times New Roman',serif}
#mw-appearance-editor .mw-btn:hover{background:#454039;border-color:#c2a15d}
#mw-appearance-editor .mw-btn-primary{border-color:#d3b46a;background:linear-gradient(#e2c982,#a78342);color:#1b1914}
#mw-appearance-editor .mw-btn-primary:hover{background:linear-gradient(#f0dba0,#c29d53);border-color:#f0dba0}
#mw-appearance-editor .mw-close{border-radius:2px}
#mw-appearance-editor .mw-status-message{color:#e8e1d2}

/* Final palette pass: match the in-game ESC settings panel and carry the brass
   accent through interactive controls, not only the frame and headings. */
#mw-appearance-editor input[type=range]{
  border-color:#62563e;
  background:linear-gradient(90deg,#c3a15d 0%,#c3a15d var(--range-fill,50%),#303035 var(--range-fill,50%),#303035 100%);
  height:8px;
}
#mw-appearance-editor input[type=range]::-webkit-slider-thumb{
  width:15px;height:19px;border:1px solid #f0d99b;
  background:linear-gradient(#f3dda0,#a78343);
  box-shadow:0 0 0 2px #1c1d20,0 1px 5px #000a;
}
#mw-appearance-editor input[type=range]::-moz-range-thumb{
  width:15px;height:19px;border:1px solid #f0d99b;border-radius:0;
  background:linear-gradient(#f3dda0,#a78343);
  box-shadow:0 0 0 2px #1c1d20,0 1px 5px #000a;
}
#mw-appearance-editor .mw-group-head{background:linear-gradient(#303035,#27282d)}
#mw-appearance-editor .mw-group-title{color:#e1c783}
#mw-appearance-editor .mw-slider-row:focus-within{background:#302b22}
#mw-appearance-editor .mw-slider-row:focus-within .mw-slider-label{color:#fff0c8}
#mw-appearance-editor .mw-btn{font-family:Georgia,'Times New Roman',serif;letter-spacing:.01em}
#mw-appearance-editor .mw-btn-primary{border-color:#e0c47c;background:linear-gradient(#e0c47c,#a78649);color:#1b1b1d}
#mw-appearance-editor .mw-btn-primary:hover{background:linear-gradient(#f0d99b,#c19b53);border-color:#f0d99b}
#mw-appearance-editor .mw-underwear input{accent-color:#c3a15d}
#mw-appearance-editor .mw-preview-tools .mw-btn{border-color:#5d523d}
#mw-appearance-editor .mw-zoom-value{color:#e1c783}

/* Enhanced skin tokens (src/ui/enhanced/enhancedStyle.js): keep this editor
   in the same blue-black / stone / bone / brass family as the shipped menu. */
#mw-appearance-editor{
  --mw-bg:#0e1013;--mw-panel:#171b21;--mw-panel-raised:#2b323b;
  --mw-line:#39414b;--mw-text:#e9e4d9;--mw-muted:#9a9486;
  --mw-accent:#c08a3e;--mw-accent-strong:#e9c17d;
  font-family:'Barlow Semi Condensed',system-ui,-apple-system,'Segoe UI',sans-serif;
  background:rgba(5,7,10,.88);color:var(--mw-text)
}
#mw-appearance-editor .mw-editor-shell{background:#0e1013;border-color:#62513a;outline-color:#2b323b;box-shadow:0 0 0 3px #080a0d,0 24px 80px #000d}
#mw-appearance-editor .mw-topbar{border-bottom-color:#39414b;background:linear-gradient(#222831,#171b21 72%,#13161b)}
#mw-appearance-editor .mw-mark{border-color:#655137;color:#e9c17d;background:#11151a;box-shadow:inset 0 0 0 2px #2b323b}
#mw-appearance-editor .mw-title{font-family:'Cormorant',Georgia,serif;font-weight:600;letter-spacing:.025em}
#mw-appearance-editor .mw-subtitle,#mw-appearance-editor .mw-section-note,#mw-appearance-editor .mw-group-note,#mw-appearance-editor .mw-footer-note{color:#9a9486}
#mw-appearance-editor .mw-state{border-color:#514632;border-radius:2px;color:#d9c8a8;background:#1c2025}
#mw-appearance-editor .mw-state:before{background:#c08a3e;box-shadow:0 0 7px #c08a3e55}
#mw-appearance-editor .mw-preview-side{background:radial-gradient(ellipse at 50% 38%,#29313a 0,#1a2028 46%,#0e1013 84%)}
#mw-appearance-editor .mw-section-title{color:#e9c17d;font-family:'Barlow Semi Condensed',system-ui,sans-serif;letter-spacing:.1em}
#mw-appearance-editor .mw-canvas-wrap{border-color:#514632;background:radial-gradient(ellipse at 50% 40%,#2b323b 0,#1a2028 48%,#0e1013 84%)}
#mw-appearance-editor .mw-controls{border-left-color:#39414b;background:#14181e}
#mw-appearance-editor .mw-controls-head{border-bottom-color:#39414b}
#mw-appearance-editor .mw-controls-head h2{color:#e9e4d9;font-family:'Cormorant',Georgia,serif;font-weight:600}
#mw-appearance-editor .mw-zone-nav{border-bottom-color:#303843;background:#171b21}
#mw-appearance-editor .mw-zone-btn{color:#c9c4b8;background:#1c222a;border-color:#39414b;border-radius:2px}
#mw-appearance-editor .mw-zone-btn.active{background:#463823;color:#fff0d0;border-color:#c08a3e;box-shadow:inset 0 -2px #c08a3e}
#mw-appearance-editor .mw-underwear{border-color:#39414b;background:#1b2027;color:#e9e4d9}
#mw-appearance-editor .mw-underwear input{accent-color:#c08a3e}
#mw-appearance-editor .mw-group{border-color:#39414b;border-radius:2px;background:#171b21}
#mw-appearance-editor .mw-group-head{border-bottom-color:#39414b;background:linear-gradient(#252c35,#1c222a)}
#mw-appearance-editor .mw-group-title{color:#e9c17d}
#mw-appearance-editor .mw-slider-row{border-bottom-color:#2b323b}
#mw-appearance-editor .mw-slider-label{color:#e9e4d9}
#mw-appearance-editor .mw-slider-row:focus-within{background:#25241f}
#mw-appearance-editor .mw-slider-row:focus-within .mw-slider-label{color:#fff0d0}
#mw-appearance-editor input[type=range]{border-color:#62513a;background:linear-gradient(90deg,#c08a3e 0%,#c08a3e var(--range-fill,50%),#2b323b var(--range-fill,50%),#2b323b 100%)}
#mw-appearance-editor input[type=range]::-webkit-slider-thumb{border-color:#f0cf91;background:linear-gradient(#f1d39b,#a96d2d);box-shadow:0 0 0 2px #14181e,0 1px 5px #000a}
#mw-appearance-editor input[type=range]::-moz-range-thumb{border-color:#f0cf91;background:linear-gradient(#f1d39b,#a96d2d);box-shadow:0 0 0 2px #14181e,0 1px 5px #000a}
#mw-appearance-editor output,#mw-appearance-editor .mw-zoom-value{color:#e9c17d}
#mw-appearance-editor .mw-footer{border-top-color:#39414b;background:#11151a}
#mw-appearance-editor .mw-btn{border-color:#514632;border-radius:2px;background:linear-gradient(#2b323b,#1b2027);color:#e9e4d9;font-family:'Barlow Semi Condensed',system-ui,sans-serif;letter-spacing:.025em}
#mw-appearance-editor .mw-btn:hover{background:#343b44;border-color:#c08a3e}
#mw-appearance-editor .mw-btn-primary{border-color:#d29a4b;background:linear-gradient(#d9a451,#a66d2f);color:#15110b}
#mw-appearance-editor .mw-btn-primary:hover{background:linear-gradient(#edbd69,#c08a3e);border-color:#f0cf91}
#mw-appearance-editor .mw-close{border-radius:2px}
#mw-appearance-editor .mw-status-message{color:#e9e4d9}

@media(prefers-reduced-motion:reduce){#mw-appearance-editor .mw-btn{transition:none}}
`;

/** APPLY-NOW: does the editor's pick differ from the saved identity the live body wears? A missing head/hair is the
 *  race's default, and a missing sex is the entity's own - compared as null. */
export function identityChanged(saved, next) {
  const norm = (v) => ({
    race: String(v?.race || '').toLowerCase(), faceIndex: Number(v?.faceIndex) | 0,
    female: typeof v?.female === 'boolean' ? v.female : null, headId: v?.headId || null, hairId: v?.hairId || null,
  });
  const a = norm(saved), b = norm(next);
  return a.race !== b.race || a.faceIndex !== b.faceIndex || a.female !== b.female || a.headId !== b.headId || a.hairId !== b.hairId;
}

export function openAppearanceEditor({ fpArm, onClose = () => {} } = {}) {
  if (typeof document === 'undefined' || !document.body) return null;
  document.getElementById('mw-appearance-editor')?.remove();

  let yaw = 0, zoom = 1, frame = 0, morphPreviewTimer = 0, previewRetryTimer = 0, previewBuildAttempts = 0, closed = false, previewRig = null, previewBuildPending = false, previewRebuildRequested = false, previewError = '';
  const initialIdentity = fpArm?.builtFor?.() || {};
  const savedIdentity = getAppearanceIdentity();
  let selectedRace = String(savedIdentity?.race || initialIdentity.race || 'nord').toLowerCase();
  let selectedFemale = typeof savedIdentity?.female === 'boolean' ? savedIdentity.female : !!initialIdentity.female;
  let selectedFace = Math.max(0, Math.min(9, Number(savedIdentity?.faceIndex ?? initialIdentity.faceIndex) || 0));
  let selectedHead = savedIdentity?.headId || null;
  let selectedHair = savedIdentity?.hairId || null;
  let choicesRequest = 0, appearanceAuditLogged = false;
  const root = document.createElement('div');
  root.id = 'mw-appearance-editor';
  const style = document.createElement('style');
  style.textContent = STYLE;
  root.append(style);

  const shell = document.createElement('section');
  shell.className = 'mw-editor-shell';
  const topbar = document.createElement('header');
  topbar.className = 'mw-topbar';
  topbar.innerHTML = '<div class="mw-brand"><div class="mw-mark" aria-hidden="true">✦</div><div><div class="mw-title">Редактор внешности</div><div class="mw-subtitle">Morrowind · персональная настройка персонажа</div></div></div><div class="mw-top-actions"><span class="mw-state">Отдельный предпросмотр · без экипировки</span></div>';
  const closeBtn = makeButton('×', false, 'mw-close');
  closeBtn.setAttribute('aria-label', 'Закрыть редактор');
  closeBtn.title = 'Закрыть';
  closeBtn.addEventListener('click', close);
  topbar.querySelector('.mw-top-actions').append(closeBtn);

  const main = document.createElement('div');
  main.className = 'mw-main';
  const previewSide = document.createElement('section');
  previewSide.className = 'mw-preview-side';
  const previewHead = document.createElement('div');
  previewHead.className = 'mw-preview-head';
  previewHead.innerHTML = '<div><div class="mw-section-title">Предпросмотр модели</div><div class="mw-section-note">Раса, пол, лицо и причёска сохраняются после нажатия «Готово»</div></div>';
  const canvasWrap = document.createElement('div');
  canvasWrap.className = 'mw-canvas-wrap';
  const preview = document.createElement('canvas');
  preview.width = 900; preview.height = 1080;
  preview.setAttribute('aria-label', '3D-предпросмотр персонажа');
  const statusMessage = document.createElement('div');
  statusMessage.className = 'mw-status-message';
  statusMessage.textContent = 'Загрузка отдельной модели…';
  canvasWrap.append(preview, statusMessage);

  const previewTools = document.createElement('div');
  previewTools.className = 'mw-preview-tools';
  const toolGroup = document.createElement('div');
  toolGroup.className = 'mw-tool-group';
  const zoomOut = makeButton('−', false, 'mw-btn-icon'); zoomOut.setAttribute('aria-label', 'Отдалить модель');
  const zoomLabel = document.createElement('span'); zoomLabel.className = 'mw-zoom-value';
  const zoomIn = makeButton('+', false, 'mw-btn-icon'); zoomIn.setAttribute('aria-label', 'Приблизить модель');
  const zoomReset = makeButton('Сбросить вид');
  const previewHint = document.createElement('div'); previewHint.className = 'mw-hint';
  const setZoom = (next) => { zoom = Math.max(0.6, Math.min(2.4, next)); zoomLabel.textContent = Math.round(zoom * 100) + '%'; drawPreview(); };
  zoomOut.addEventListener('click', () => setZoom(zoom - 0.15));
  zoomIn.addEventListener('click', () => setZoom(zoom + 0.15));
  zoomReset.addEventListener('click', () => { yaw = 0; setZoom(1); drawPreview(); });
  preview.addEventListener('wheel', (e) => { e.preventDefault(); setZoom(zoom + (e.deltaY < 0 ? 0.1 : -0.1)); }, { passive: false });
  toolGroup.append(zoomOut, zoomLabel, zoomIn);
  previewTools.append(toolGroup, zoomReset, previewHint);

  const controls = document.createElement('section');
  controls.className = 'mw-controls';
  const controlsHead = document.createElement('div');
  controlsHead.className = 'mw-controls-head';
  controlsHead.innerHTML = '<h2>Внешность персонажа</h2><p>Выберите пол и расу, затем настройте лицо и причёску. Редактор пропорций тела доступен отдельно в расширенных параметрах и пока находится в разработке.</p>';
  const identityGrid = document.createElement('div'); identityGrid.className = 'mw-identity-grid';
  const sexRow = document.createElement('label'); sexRow.className = 'mw-underwear';
  const sexLabel = document.createElement('span'); sexLabel.textContent = 'Пол';
  const sexSelect = document.createElement('select'); sexSelect.setAttribute('aria-label', 'Пол персонажа');
  sexSelect.style.cssText = 'background:#171b21;color:#e9e4d9;border:1px solid #62513a;padding:7px;font:inherit';
  for (const [value, label] of [['male', 'Мужской'], ['female', 'Женский']]) {
    const option = document.createElement('option'); option.value = value; option.textContent = label; sexSelect.append(option);
  }
  sexSelect.value = selectedFemale ? 'female' : 'male';
  sexRow.append(sexLabel, sexSelect);
  const raceRow = document.createElement('label'); raceRow.className = 'mw-underwear';
  const raceLabel = document.createElement('span'); raceLabel.textContent = 'Раса';
  const raceSelect = document.createElement('select'); raceSelect.setAttribute('aria-label', 'Раса персонажа');
  raceSelect.style.cssText = sexSelect.style.cssText;
  const raceOptions = [
    ['breton','Бретон'],['dark elf','Тёмный эльф'],['high elf','Высокий эльф'],['imperial','Имперец'],
    ['nord','Норд'],['orc','Орк'],['redguard','Редгард'],['wood elf','Лесной эльф'],
    ['argonian','Аргонианин'],['khajiit','Каджит'],
  ];
  for (const [value,label] of raceOptions) { const option=document.createElement('option'); option.value=value; option.textContent=label; raceSelect.append(option); }
  if (![...raceSelect.options].some(o=>o.value===selectedRace)) {
    const compact = selectedRace.replace(/[^a-z]/g,'');
    const matched = raceOptions.find(([value])=>value.replace(/[^a-z]/g,'')===compact);
    selectedRace = matched?.[0] || 'nord';
  }
  raceSelect.value = selectedRace;
  raceRow.append(raceLabel, raceSelect);
  const faceRow = document.createElement('label'); faceRow.className = 'mw-underwear';
  const faceLabel = document.createElement('span'); faceLabel.textContent = 'Лицо';
  const headSelect = document.createElement('select'); headSelect.setAttribute('aria-label', 'Модель лица');
  headSelect.style.cssText = sexSelect.style.cssText;
  faceRow.append(faceLabel, headSelect);
  const hairRow = document.createElement('label'); hairRow.className = 'mw-underwear';
  const hairLabel = document.createElement('span'); hairLabel.textContent = 'Причёска';
  const hairSelect = document.createElement('select'); hairSelect.setAttribute('aria-label', 'Модель причёски');
  hairSelect.style.cssText = sexSelect.style.cssText;
  hairRow.append(hairLabel, hairSelect);
  // Keep all four identity selectors in the same compact grid and use the same
  // label/select treatment for face and hair as for race and sex.
  identityGrid.append(sexRow, raceRow, faceRow, hairRow);
  const optionsGrid = document.createElement('div'); optionsGrid.className = 'mw-options-grid';
  const underwearRow = document.createElement('label'); underwearRow.className = 'mw-underwear';
  const underwearToggle = document.createElement('input'); underwearToggle.type = 'checkbox'; underwearToggle.checked = getUnderwearEnabled();
  const underwearCopy = document.createElement('span'); underwearCopy.innerHTML = '<strong>Нижнее бельё</strong><small>Выключено — голая модель; включено — вариант тела с бельём.</small>';
  underwearRow.append(underwearToggle, underwearCopy);
  const bodyHairRow = document.createElement('label'); bodyHairRow.className = 'mw-underwear';
  const bodyHairToggle = document.createElement('input'); bodyHairToggle.type = 'checkbox'; bodyHairToggle.checked = getBodyHairEnabled(); bodyHairToggle.disabled = underwearToggle.checked;
  const bodyHairCopy = document.createElement('span'); bodyHairCopy.innerHTML = '<strong>Волосы на теле</strong><small>Для голой модели; отключите нижнее бельё. Нужен High Resolution Better Body Female Textures.</small>';
  bodyHairRow.append(bodyHairToggle, bodyHairCopy);
  optionsGrid.append(underwearRow, bodyHairRow);
  controlsHead.append(identityGrid, optionsGrid);
  bodyHairToggle.addEventListener('change', async () => {
    setBodyHairEnabled(bodyHairToggle.checked);
    statusMessage.style.display = 'block'; statusMessage.textContent = 'Пересборка текстур модели…';
    if (previewBuildPending) previewRebuildRequested = true;
    previewRig?.unload?.(); previewRig = null; previewError = '';
    try {
      if (typeof fpArm?.refreshBodyVariant === 'function') {
        const refreshed = await fpArm.refreshBodyVariant();
        if (refreshed?.ok === false && !refreshed?.queued) {
          previewError = refreshed.error || 'Не удалось обновить текстуру игрового персонажа.';
        }
      }
      await buildPreviewRig();
    } catch (error) { previewError = String(error?.message || error); }
    drawPreview();
  });
  const rebuildRacePreview = () => {
    previewRig?.unload?.(); previewRig = null; previewError = '';
    statusMessage.style.display = 'block'; statusMessage.textContent = 'Загрузка выбранных моделей лица и причёски…';
    if (previewBuildPending) previewRebuildRequested = true;
    else void buildPreviewRig();
    window.dispatchEvent(new CustomEvent('mw-appearance-race-preview-change', { detail: {
      race: selectedRace, female: selectedFemale, faceIndex: selectedFace, headId: selectedHead, hairId: selectedHair,
    } }));
  };
  const fillModelSelect = (select, items, selectedId, emptyLabel) => {
    select.replaceChildren();
    if (!items.length) {
      const option = document.createElement('option'); option.value = ''; option.textContent = emptyLabel; select.append(option);
      select.disabled = true; return '';
    }
    select.disabled = false;
    for (const [index, item] of items.entries()) {
      const option = document.createElement('option'); option.value = item.id;
      option.textContent = (select === headSelect ? 'Лицо ' : 'Причёска ') + (index + 1);
      select.append(option);
    }
    const chosen = items.some((item) => item.id === selectedId) ? selectedId : items[0].id;
    select.value = chosen;
    return chosen;
  };
  async function refreshAppearanceChoices({ rebuild = true } = {}) {
    const request = ++choicesRequest;
    if (typeof fpArm?.getAppearanceChoices !== 'function') {
      previewError = 'Список моделей лица и причёсок недоступен.';
      drawPreview();
      return;
    }
    statusMessage.style.display = 'block'; statusMessage.textContent = 'Поиск доступных моделей…';
    try {
      const result = await fpArm.getAppearanceChoices({ race: selectedRace, female: selectedFemale, faceIndex: selectedFace });
      if (closed || request !== choicesRequest) return;
      if (!result?.ok) throw new Error(result?.error || 'Не удалось получить список моделей.');
      if (!appearanceAuditLogged && Array.isArray(result.audit)) {
        appearanceAuditLogged = true;
        const duplicates = result.audit.reduce((sum, pool) => sum + pool.duplicateHeads + pool.duplicateHairs, 0);
        console.info('[Appearance editor] race/sex head-hair pool audit', {
          combinations: result.audit.length, duplicateModelEntriesRemoved: duplicates, pools: result.audit,
        });
      }
      selectedHead = fillModelSelect(headSelect, result.heads || [], selectedHead || result.selected?.headId, 'Нет доступных моделей лица');
      selectedHair = fillModelSelect(hairSelect, result.hairs || [], selectedHair || result.selected?.hairId, 'Нет доступных моделей причёсок');
      if (rebuild) rebuildRacePreview();
    } catch (error) {
      if (closed || request !== choicesRequest) return;
      previewError = String(error?.message || error);
      statusMessage.textContent = 'Ошибка списка моделей: ' + previewError;
      drawPreview();
    }
  }
  // Identity controls are draft-only; the live player changes only on «Готово».
  raceSelect.addEventListener('change', () => {
    selectedRace = raceSelect.value; selectedHead = null; selectedHair = null;
    void refreshAppearanceChoices();
  });
  sexSelect.addEventListener('change', () => {
    selectedFemale = sexSelect.value === 'female'; selectedHead = null; selectedHair = null;
    void refreshAppearanceChoices();
  });
  headSelect.addEventListener('change', () => { selectedHead = headSelect.value || null; rebuildRacePreview(); });
  hairSelect.addEventListener('change', () => { selectedHair = hairSelect.value || null; rebuildRacePreview(); });
  underwearToggle.addEventListener('change', async () => {
    bodyHairToggle.disabled = underwearToggle.checked;
    setUnderwearEnabled(underwearToggle.checked);
    statusMessage.style.display = 'block'; statusMessage.textContent = 'Пересборка модели…';
    // If the first preview build is still loading, queue a second build after
    // it settles. Otherwise the checkbox could persist the new value while
    // leaving the already-started underwear model on screen.
    if (previewBuildPending) previewRebuildRequested = true;
    previewRig?.unload?.(); previewRig = null; previewError = '';
    try {
      // The preference selects the NIF only when an actor is built. Rebuild the
      // live game rig as well as the editor-owned preview; otherwise the checkbox
      // changes storage/preview but leaves the in-game body mesh untouched.
      if (typeof fpArm?.refreshBodyVariant === 'function') {
        const refreshed = await fpArm.refreshBodyVariant();
        if (refreshed?.ok === false && !refreshed?.queued) {
          previewError = refreshed.error || 'Не удалось обновить модель персонажа в игре.';
        }
      }
      await buildPreviewRig();
    } catch (error) { previewError = String(error?.message || error); }
    drawPreview();
  });
  const advancedToggle = makeButton('＋  Расширенные параметры тела', false, 'mw-advanced-toggle');
  advancedToggle.setAttribute('aria-expanded', 'false');
  advancedToggle.setAttribute('aria-controls', 'mw-advanced-body-panel');
  const advancedNote = document.createElement('p');
  advancedNote.className = 'mw-advanced-note';
  advancedNote.textContent = 'Функция находится в разработке. Эффекты ползунков изучены не полностью и могут деформировать модель.';
  const advancedPanel = document.createElement('section');
  advancedPanel.id = 'mw-advanced-body-panel';
  advancedPanel.className = 'mw-advanced-panel';
  advancedPanel.hidden = true;
  advancedToggle.addEventListener('click', () => {
    const expanded = advancedToggle.getAttribute('aria-expanded') !== 'true';
    advancedToggle.setAttribute('aria-expanded', String(expanded));
    advancedToggle.textContent = (expanded ? '−' : '＋') + '  Расширенные параметры тела';
    advancedPanel.hidden = !expanded;
  });
  const zoneNav = document.createElement('nav'); zoneNav.className = 'mw-zone-nav'; zoneNav.setAttribute('aria-label', 'Выбор группы частей тела');
  const controlList = document.createElement('div'); controlList.className = 'mw-control-list';
  const inputs = new Map();
  const outputs = new Map();
  const initial = getBodyMorphs();
  // Body sliders are draft state, just like race/face. Do not mutate the live
  // actor or persistent settings until the user confirms with Done.
  let draftMorphs = { ...initial };
  let activeZone = 'all';
  const zoneButtons = new Map();
  for (const zone of GROUPS) {
    const button = makeButton(zone.id === 'all' ? 'Все параметры' : zone.title);
    button.classList.add('mw-zone-btn');
    button.classList.toggle('active', zone.id === activeZone);
    button.setAttribute('aria-pressed', zone.id === activeZone ? 'true' : 'false');
    button.addEventListener('click', () => {
      activeZone = zone.id;
      for (const [id, item] of zoneButtons) {
        item.classList.toggle('active', id === activeZone);
        item.setAttribute('aria-pressed', id === activeZone ? 'true' : 'false');
      }
      for (const item of controlList.querySelectorAll('.mw-group')) item.hidden = activeZone === 'all' ? false : item.dataset.zone !== activeZone;
    });
    zoneButtons.set(zone.id, button); zoneNav.append(button);
  }

  for (const groupInfo of GROUPS) {
    const group = document.createElement('section'); group.className = 'mw-group'; group.dataset.zone = groupInfo.id; group.hidden = false;
    const groupHead = document.createElement('div'); groupHead.className = 'mw-group-head';
    const groupTitle = document.createElement('div'); groupTitle.className = 'mw-group-title'; groupTitle.textContent = groupInfo.title;
    const groupNote = document.createElement('div'); groupNote.className = 'mw-group-note'; groupNote.textContent = groupInfo.description;
    groupHead.append(groupTitle, groupNote);
    const fields = document.createElement('div'); fields.className = 'mw-group-fields';
    for (const key of groupInfo.keys) {
      const row = document.createElement('label'); row.className = 'mw-slider-row';
      const name = document.createElement('span'); name.className = 'mw-slider-label'; name.textContent = diagnosticLabels.get(key) || labelByKey.get(key) || key;
      const input = document.createElement('input');
      input.type = 'range'; input.min = '-1'; input.max = '1'; input.step = '0.01'; input.value = String(initial[key] ?? 0);
      input.style.setProperty('--range-fill', (((Number(input.value) + 1) / 2) * 100) + '%');
      input.setAttribute('aria-label', name.textContent);
      const output = document.createElement('output'); output.textContent = formatValue(Number(input.value));
      input.addEventListener('input', () => {
        const value = clamp(Number(input.value));
        draftMorphs[key] = value;
        output.textContent = formatValue(value);
        input.style.setProperty('--range-fill', (((value + 1) / 2) * 100) + '%');
        drawPreview();
      });
      inputs.set(key, input); outputs.set(key, output);
      row.append(name, input, output); fields.append(row);
    }
    group.append(groupHead, fields); controlList.append(group);
  }

  const footer = document.createElement('footer'); footer.className = 'mw-footer';
  const footerNote = document.createElement('div'); footerNote.className = 'mw-footer-note'; footerNote.textContent = 'Изменения внешности применяются после нажатия «Готово»';
  const footerActions = document.createElement('div'); footerActions.className = 'mw-tool-group';
  const reset = makeButton('Сбросить параметры');
  reset.addEventListener('click', () => {
    draftMorphs = Object.fromEntries(BODY_MORPH_FIELDS.map(([key]) => [key, 0]));
    for (const [key, input] of inputs) {
      input.value = String(draftMorphs[key] ?? 0);
      outputs.get(key).textContent = formatValue(Number(input.value));
      input.style.setProperty('--range-fill', (((Number(input.value) + 1) / 2) * 100) + '%');
    }
    drawPreview();
  });
  const done = makeButton('Готово', true, 'mw-btn-primary');
  done.addEventListener('click', async () => {
    done.disabled = true;
    const previousLabel = done.textContent;
    done.textContent = 'Применение…';
    try {
      const identity = { race: selectedRace, female: selectedFemale, faceIndex: selectedFace, headId: selectedHead, hairId: selectedHair };
      // The race/sex choice is a DISPLAY override: the gameplay entity's race
      // and gender stay untouched. The live body wears it all the same - every
      // player rig build reads the saved identity (fpArm build, playerAppearance)
      // - so a changed identity rebuilds the body NOW (APPLY-NOW), not at the
      // next equip. Not awaited: the old body stands until the new one is
      // ready, and the rig's subscribers repaint the pack's figure then.
      // Commit body morphs only after confirmation. The preview used draftMorphs
      // directly, so cancelling the editor leaves the live character untouched.
      for (const [key] of BODY_MORPH_FIELDS) setBodyMorph(key, draftMorphs[key] ?? 0);
      window.dispatchEvent(new CustomEvent('mw-body-morph-change', { detail: { ...draftMorphs } }));
      if (identityChanged(getAppearanceIdentity(), identity) && typeof fpArm?.applyAppearanceIdentity === 'function') {
        void fpArm.applyAppearanceIdentity(identity).catch((err) => console.warn('[appearance] live rebuild failed:', err?.message ?? err));
      } else setAppearanceIdentity(identity);
      // Notify the paperdoll/inventory art pipeline. This is a visual override
      // only; the live gameplay entity's race and gender remain untouched.
      window.dispatchEvent(new CustomEvent('mw-appearance-identity-change', { detail: identity }));
      close();
    } catch (error) {
      previewError = String(error?.message || error);
      statusMessage.style.display = 'block';
      statusMessage.textContent = 'Не удалось применить внешность: ' + previewError;
      done.disabled = false;
      done.textContent = previousLabel;
      drawPreview();
    }
  });
  footerActions.append(reset, done); footer.append(footerNote, footerActions);

  advancedPanel.append(advancedNote, zoneNav, controlList);
  previewSide.append(previewHead, canvasWrap, previewTools);
  controls.append(controlsHead, advancedToggle, advancedPanel, footer);
  main.append(previewSide, controls);
  shell.append(topbar, main); root.append(shell);
  root.addEventListener('click', (e) => { if (e.target === root) close(); });
  const keydown = (e) => { if (e.key === 'Escape') close(); };
  window.addEventListener('keydown', keydown);
  document.body.append(root);
  const resizeObserver = typeof ResizeObserver === 'function'
    ? new ResizeObserver(() => {
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; drawPreview(); });
    })
    : null;
  resizeObserver?.observe(preview);
  drawPreview();
  void refreshAppearanceChoices({ rebuild: false }).then(() => buildPreviewRig());

  let drag = null;
  let suppressPreviewClick = false;
  preview.addEventListener('pointerdown', (e) => {
    suppressPreviewClick = false;
    drag = { x: e.clientX, y: e.clientY, yaw };
    preview.setPointerCapture?.(e.pointerId);
    preview.style.cursor = 'grabbing';
  });
  preview.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (Math.abs(e.clientX - drag.x) > 4 || Math.abs(e.clientY - drag.y) > 4) suppressPreviewClick = true;
    yaw = drag.yaw + (e.clientX - drag.x) * 0.018;
    if (frame) return;
    frame = requestAnimationFrame(() => { frame = 0; drawPreview(); });
  });
  const release = () => { drag = null; preview.style.cursor = 'grab'; };
  preview.addEventListener('pointerup', release);
  preview.addEventListener('pointercancel', release);


  // Morphs are applied during poseAssembly, but a preview rig can retain
  // assembled/cached mesh state across frames. Rebuild once the user pauses
  // slider input so the displayed geometry is guaranteed to use the latest
  // saved proportions without rebuilding on every pointer event.
  function schedulePreviewRigRebuild() {
    if (morphPreviewTimer) window.clearTimeout(morphPreviewTimer);
    morphPreviewTimer = window.setTimeout(() => {
      morphPreviewTimer = 0;
      if (closed) return;
      previewRig?.unload?.();
      previewRig = null;
      previewError = '';
      statusMessage.style.display = 'block';
      statusMessage.textContent = 'Обновление пропорций модели…';
      void buildPreviewRig();
    }, 180);
  }

  async function buildPreviewRig() {
    if (closed || previewRig || !fpArm?.createAppearancePreviewRig) {
      if (!fpArm?.createAppearancePreviewRig) { previewError = 'Отдельная 3D-сборка недоступна для этого игрового рига.'; drawPreview(); }
      return;
    }
    if (previewBuildPending) {
      previewRebuildRequested = true;
      return;
    }
    // This build starts after any previous one has settled and therefore
    // reads the latest saved underwear choice through betterBodiesAssetUrls.
    previewRebuildRequested = false;
    previewBuildPending = true;
    try {
      const result = await fpArm.createAppearancePreviewRig({ race: selectedRace, female: selectedFemale, faceIndex: selectedFace, headId: selectedHead, hairId: selectedHair });
      if (closed || previewRebuildRequested) {
        result?.rig?.unload?.();
      } else if (result?.ok && result.rig) {
        previewRig = result.rig;
        previewBuildAttempts = 0;
        if (previewRetryTimer) window.clearTimeout(previewRetryTimer);
        previewRetryTimer = 0;
        previewError = '';
      } else {
        const reason = String(result?.error || '');
        // The editor may open before the initial player rig/renderer is ready.
        // Retry transient readiness failures instead of leaving a blank preview
        // until the player changes a slider or selects another race.
        const transient = /has not finished building|not ready|renderer|already building/i.test(reason);
        if (transient && previewBuildAttempts < 12) {
          previewBuildAttempts++;
          previewError = '';
          if (previewRetryTimer) window.clearTimeout(previewRetryTimer);
          previewRetryTimer = window.setTimeout(() => {
            previewRetryTimer = 0;
            if (!closed && !previewRig) void buildPreviewRig();
          }, 250);
        } else {
          previewError = result?.error || 'Не удалось собрать отдельную модель.';
        }
      }
    } catch (error) {
      const message = String(error?.message || error);
      if (!previewRebuildRequested && previewBuildAttempts < 12 && /not ready|renderer|building/i.test(message)) {
        previewBuildAttempts++;
        previewError = '';
        if (previewRetryTimer) window.clearTimeout(previewRetryTimer);
        previewRetryTimer = window.setTimeout(() => {
          previewRetryTimer = 0;
          if (!closed && !previewRig) void buildPreviewRig();
        }, 250);
      } else if (!previewRebuildRequested) {
        previewError = message;
      }
    } finally {
      previewBuildPending = false;
      if (previewRebuildRequested && !closed) {
        previewRebuildRequested = false;
        if (previewRetryTimer) window.clearTimeout(previewRetryTimer);
        previewRetryTimer = 0;
        previewRig?.unload?.(); previewRig = null; previewError = '';
        void buildPreviewRig();
      } else {
        drawPreview();
      }
    }
  }

  function drawPreview() {
    if (closed) return;
    if (!previewRig) {
      statusMessage.style.display = 'block';
      statusMessage.textContent = previewError || 'Собирается отдельная 3D-модель из игровых ресурсов…';
      previewHint.textContent = previewError ? 'Предпросмотр недоступен' : 'Загрузка ресурсов';
      return;
    }
    try {
      const image = previewRig.figure({ yaw, height: Math.min(1024, Math.max(640, Math.round(preview.height * 0.95))), force: true, neutral: true, bodyProportions: draftMorphs });
      const ctx = preview.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, preview.width, preview.height);
      if (!image?.data) {
        statusMessage.style.display = 'block';
        statusMessage.textContent = 'Модель собрана, но изображение недоступно.';
        previewHint.textContent = 'Ошибка отображения';
        return;
      }
      statusMessage.style.display = 'none';
      const imageCanvas = document.createElement('canvas');
      imageCanvas.width = image.width; imageCanvas.height = image.height;
      const imageCtx = imageCanvas.getContext('2d');
      if (!imageCtx) return;
      imageCtx.putImageData(new ImageData(image.data, image.width, image.height), 0, 0);
      const scale = Math.min((preview.width * .98) / image.width, (preview.height * .98) / image.height) * zoom;
      const dw = image.width * scale, dh = image.height * scale;
      ctx.drawImage(imageCanvas, (preview.width - dw) / 2, (preview.height - dh) / 2, dw, dh);
      previewHint.textContent = 'Без экипировки · нейтральная стойка';
    } catch (error) {
      statusMessage.style.display = 'block';
      statusMessage.textContent = 'Ошибка предпросмотра: ' + String(error?.message || error);
      previewHint.textContent = 'Ошибка отображения';
    }
  }

  function close() {
    if (closed) return;
    closed = true;
    if (frame) cancelAnimationFrame(frame);
    if (morphPreviewTimer) window.clearTimeout(morphPreviewTimer);
    if (previewRetryTimer) window.clearTimeout(previewRetryTimer);
    morphPreviewTimer = 0;
    previewRetryTimer = 0;
    resizeObserver?.disconnect?.();
    previewRig?.unload?.(); previewRig = null;
    window.removeEventListener('keydown', keydown);
    root.remove(); onClose();
  }
  return { close };
}

function formatValue(value) {
  const percent = Math.round(clamp(Number(value) || 0) * 100);
  return (percent > 0 ? '+' : '') + percent + '%';
}

function makeButton(text, primary = false, extraClass = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = text;
  button.className = 'mw-btn' + (primary ? ' mw-btn-primary' : '') + (extraClass ? ' ' + extraClass : '');
  return button;
}
