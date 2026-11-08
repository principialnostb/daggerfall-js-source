import { emcText } from './emcLanguage.js';
import { textureIntro } from './texturePresentation.js';
import { animatedCloaksRequirement, extraAppearanceRequirements } from '../../systems/extraAppearance.js';
import { setPaperdollCustomization } from '../../systems/helmetPaperdollLooks.js';
import { invalidatePaperDoll } from '../paperDoll.js';
import { setInventory2D } from './inventoryPresentation.js';
import { MOD_PACKS, MOD_GROUPS } from '../../systems/enhancedModCatalog.js';
import { noteModPresentationChanged, modPackState, modGroupReady, modGroupEnabled, setModGroupEnabled, attachModFolder, removeModResources, resourceError, resourcesChanged } from '../../systems/enhancedModResources.js';
import { getPref, setPref } from '../../systems/uiPrefs.js';
import { attachedDfmods, setDfmodEnabled } from '../../systems/dfmodTextures.js';
const node=(tag,cls,text)=>{
  const n=document.createElement(tag);if(cls)n.className=cls;
  if(text && /^(Автор|Авторы|Интеграция)/.test(text)){
    n.classList.add('emc-credits');
    for(const part of text.split(' · ')){
      const span=document.createElement('span');span.className=part.includes('Интеграция')?'emc-integrator':'emc-author';span.textContent=emcText(part);n.append(span);
    }
  }else if(text)n.textContent=emcText(text);
  return n;
};
// Optional enhancements are informative; missing enhancements never lock customization.
function boosts(items){
  const box=node('aside','emc-boosts');
  box.append(node('p','meta emc-boosts-lead','Работает и без этих дополнений.'));
  const list=node('ul','emc-boost-list');
  for(const [on,label,hint] of items){
    const item=node('li',`emc-chip${on?' on':''}`);
    item.append(node('span','emc-boost-name',`${on?'✓':'–'} ${emcText(label)}`),node('span','emc-boost-state',on?'Используется':'Не используется'));
    item.title=emcText(hint);
    list.append(item);
  }
  box.append(node('div','emc-badge','Дополнительные улучшения'),list);
  return box;
}
function requirements(items){
  const list=node('ul','emc-readiness');
  for(const [ready,label] of items)list.append(node('li',ready?'emc-ready':'emc-missing',`${ready?'✓':'✕'} ${label}`));
  return list;
}
function button(label,run){const b=node('button','act',label);b.type='button';b.classList.add(/Удалить/.test(label)?'emc-remove':/Отключить|выключена/.test(label)?'emc-disable':/Включить|включена/.test(label)?'emc-enable':'emc-connect');b.onclick=async()=>{b.disabled=true;try{await run();}catch(error){const message=node('p','meta emc-error',String(error?.message||error));b.closest('.card')?.append(message);}finally{b.disabled=false;}};return b;}
function link(label,url){const a=node('a','act',label);a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;}
export function enhancedModCatalog({ section, render, openFiles, textureNodes, paperdollAttach, paperdollRemove, restart, rebuild, editAppearance }) {
  const page=node('div','emc-catalog');
  const intro=node('div','card emc-intro');
  intro.append(node('h3',null,'Enhanced Mod Compatibility'),node('p','meta','Для модификаций на основе Morrowind обязательно подключите 3D-ресурсы в Mods & files.'),button('Открыть Mods & files',openFiles));
  if(resourcesChanged)intro.append(node('p','meta emc-pending','Изменения ресурсов применятся после перезапуска игры.'),button('Перезапустить',restart));
  if(resourceError)intro.append(node('p','meta emc-error','Хранилище ресурсов: '+resourceError));
  page.append(intro);
  if(section==='bodies'){
    const inventory=node('div','card');
    inventory.append(node('h3',null,'Отображение инвентаря'),node('p','meta','Выберите 2D-карточку персонажа или 3D-инвентарь. В режиме 2D модели Morrowind продолжают работать в игровом мире, а персонаж и значки предметов в инвентаре остаются двумерными. Paperdoll Enhanced улучшает 2D-карточку.'),button(getPref('morrowindThirdPersonOnly')?'Инвентарь: 2D':'Инвентарь: 3D',()=>{setInventory2D(!getPref('morrowindThirdPersonOnly'));render();}));
    page.append(inventory);
    for(const group of MOD_GROUPS){
      const box=node('section','card emc-group');
      const packs=MOD_PACKS.filter(p=>p.group===group.id);
      const available=packs.every(p=>modPackState(p.id).count>0);
      const toggle=button(modGroupEnabled(group.id)?'Отключить связку':'Включить связку',async()=>{setModGroupEnabled(group.id,!modGroupEnabled(group.id));await rebuild();render();});
      toggle.disabled=!available;
      toggle.setAttribute('aria-pressed',String(modGroupEnabled(group.id)));
      if (!available) box.append(node('p','meta','Набор ресурсов неполный. Для отсутствующих компонентов сохраняется прежний резервный источник.'));
      box.append(node('div','emc-badge','СВЯЗАННЫЕ РЕСУРСЫ'),node('h3',null,group.title),node('p','meta',group.description),toggle);
      const readiness=node('ul','emc-readiness');
      for(const pack of packs){
        const connected=modPackState(pack.id).connected;
        const item=node('li',connected?'emc-ready':'emc-missing',`${connected?'✓':'✕'} ${pack.title} — ${connected?'подключён':'не подключён'}`);
        readiness.append(item);
      }
      box.append(readiness);
      if(group.id==='bodies'){
        const editor=node('div','card');
        const open=button('Открыть редактор персонажа',editAppearance);
        open.disabled=!available || !modGroupEnabled('bodies');
        editor.append(node('h3',null,'Редактор персонажа и экипировки'),node('p','meta','Интеграция и настройка: BLOODBATH'),node('p','meta','Настройка внешности и выбор доступных вариантов брони, оружия и плащей. Недоступный сохранённый вариант заменяется стандартным.'),open);
        box.append(editor);
      }


      for(const pack of packs){
        const card=node('div','card emc-pack'); const state=modPackState(pack.id);
        card.append(node('h3',null,pack.title),node('p','meta',pack.author?'Автор: '+pack.author+' · Интеграция: BLOODBATH':'Интеграция: BLOODBATH · Автор уточняется'),node('p','meta',pack.description));
        card.append(node('p','meta emc-status',state.count?`${state.imported?'Подключены пользователем':'Ресурсы текущей сборки'} · файлов: ${state.count}`:'Ресурсы не подключены'));
        const actions=node('div','acts');
        if(!state.connected && pack.nexus)actions.append(link('Скачать с Nexus Mods',pack.nexus));
        actions.append(button(state.connected?'Выбрать источник заново':'Подключить ресурсы',()=>new Promise(resolve=>{
          const input=node('input');input.type='file';input.multiple=true;input.webkitdirectory=true;
          input.oncancel=()=>resolve();
          input.onchange=async()=>{try{if(input.files?.length)await attachModFolder(pack.id,[...input.files]);render();resolve();}catch(error){card.append(node('p','meta emc-error',String(error?.message||error)));resolve();}};input.click();
        })));
        if(state.connected)actions.append(button('Удалить ресурсы',async()=>{await removeModResources(pack.id);render();}));
        card.append(actions);box.append(card);
      }
      page.append(box);
    }
    const paper=node('fieldset','card');
    const twoD = getPref('morrowindThirdPersonOnly') === true;
    paper.disabled = !twoD;
    paper.append(node('h3',null,'Paperdoll Enhanced'),node('p','meta','Авторы: Bacharinak, Jodzie, TheCausedMarlin · Интеграция: BLOODBATH'),node('p','meta','Обновляет двумерное изображение персонажа и экипировки в инвентаре. Используется при включённом 2D-инвентаре.'));
    const attached=attachedDfmods().filter(m=>/paperdoll.*enhanced/i.test(m.title));
    for(const mod of attached){paper.append(node('p','meta',`${mod.title} · ${mod.enabled?'Включён':'Отключён'}`),button(mod.enabled?'Отключить':'Включить',()=>{setDfmodEnabled(mod.key,!mod.enabled);render();}),...(!mod.shipped ? [button('Выбрать источник заново',paperdollAttach),button('Удалить ресурсы',()=>paperdollRemove(mod))] : []));}
    if(!attached.length)paper.append(link('Найти Paperdoll Enhanced на Nexus Mods','https://www.nexusmods.com/daggerfallunity/search/?gsearch=Paperdoll%20Enhanced&gsearchtype=mods'),button('Подключить ресурсы (.dfmod)',paperdollAttach));
    inventory.append(requirements([[twoD,'Инвентарь: 2D']]),paper);
    const custom=node('fieldset','card'); custom.disabled=!twoD;
    custom.append(node('h3',null,'Кастомизация paperdoll'),node('p','meta','Автор: BLOODBATH'),node('p','meta','Меняет 2D-облик предметов на карточке персонажа в инвентаре: лицо, броню в пределах её материала, одежду — любую того же типа: верх, полное облачение, низ, обувь, плащ (с учётом поднятого или опущенного капюшона), оружие и щиты в пределах их класса. Облик видите только вы: мир и другие игроки видят прежний. Работает с Paperdoll Enhanced и без него. Выберите предмет в инвентаре — вкладка «2D».'),boosts([[attachedDfmods().some((m)=>/paperdoll.*enhanced/i.test(m.title)&&m.enabled),'Paperdoll Enhanced','Перерисовывает 2D-облики в высоком разрешении (женские персонажи)']]),button(getPref('paperdollCustomization')!==false?'Отключить кастомизацию':'Включить кастомизацию',()=>{setPaperdollCustomization(getPref('paperdollCustomization')===false);invalidatePaperDoll();render();}));
    inventory.append(custom);
    const models=node('div','card');
    models.append(node('h3',null,'Кастомизация 3D'),node('p','meta','Автор: BLOODBATH'),node('p','meta','Меняет 3D-модель предметов на вашем персонаже: броню — на любую модель Morrowind её весового класса, одежду и оружие — на модели того же типа, плюс дополнительные облики ниже, если они подключены. Облик видите только вы: другие игроки видят прежнюю модель. Выберите предмет в инвентаре — вкладка «3D».'),boosts([[modGroupReady('bodies')&&modGroupEnabled('bodies'),'Тела и руки','Better Bodies и Better Hands: броня и одежда сидят на улучшенных телах'],[[['armor','extraArmorLooks'],['weapon','extraWeaponLooks'],['cloak','extraCloakLooks']].some(([k,pref])=>getPref(pref)!==false&&!extraAppearanceRequirements(k).length),'Дополнительные облики','Комплекты ниже добавляют варианты во вкладку 3D']]),button(getPref('modelCustomization')===true?'Отключить кастомизацию 3D':'Включить кастомизацию 3D',async()=>{setPref('modelCustomization',getPref('modelCustomization')!==true);noteModPresentationChanged();await rebuild();render();}));
    inventory.append(models);
    const animation=button(modGroupEnabled('cloak-animation')?'Анимация плащей: включена':'Анимация плащей: выключена',async()=>{setModGroupEnabled('cloak-animation',!modGroupEnabled('cloak-animation'));await rebuild();render();});
    animation.disabled=!!animatedCloaksRequirement();
    models.append(animation,node('p','meta','Анимация стандартного плаща: требуется кастомизация 3D. Замена тела не требуется.'));
    models.append(requirements([[getPref('modelCustomization')===true,'Кастомизация 3D']]));
    for(const [key,title,contents] of [
      ['extraArmorLooks','Комплекты брони из TESO 5','Сейчас доступна железная броня.'],
      ['extraWeaponLooks','Комплекты оружия из TESO 5','Сейчас доступна двуручная стальная секира.'],
      ['extraCloakLooks','Дополнительный внешний вид плащей','Волчьи шкуры: коричневая, белая и чёрная. Требуется анимация плащей.'],
    ]){
      const row=node('div','emc-extra');
      const toggle=button(getPref(key)!==false?'Отключить':'Включить',async()=>{setPref(key,getPref(key)===false);noteModPresentationChanged();await rebuild();render();});
      const kind={extraArmorLooks:'armor',extraWeaponLooks:'weapon',extraCloakLooks:'cloak'}[key];
      const missing=extraAppearanceRequirements(kind);
      toggle.disabled=missing.length>0;
      row.append(node('h4',null,title),node('p','meta',contents),toggle);
      if(kind==='armor' || kind==='weapon')row.append(node('p','meta emc-source-note','Требуется указать путь к файлам игры Skyrim SE.'));
      row.append(requirements([[getPref('modelCustomization')===true,'Кастомизация 3D'],[modGroupReady('bodies'),'Тела и руки — Better Bodies / Better Hands'],...(kind==='cloak'?[[!animatedCloaksRequirement() && modGroupEnabled('cloak-animation'),'Анимация плащей']]:[])]));
      models.append(row);
    }


    if(!twoD)for(const anchor of paper.querySelectorAll('a')){anchor.removeAttribute('href');anchor.setAttribute('aria-disabled','true');}

  } else if(section==='environment'){
    const camp=node('div','card');
    camp.append(node('h3',null,'Костёр'),node('p','meta','Автор: BLOODBATH'),node('p','meta','Объёмные поленья, угли и пламя с пикселизацией и подгонкой к поверхности. Ресурсы входят в сборку.'),button(getPref('enhancedCampfire')!==false?'Отключить':'Включить',()=>{setPref('enhancedCampfire',getPref('enhancedCampfire')===false);render();}));
    camp.append(node('p','meta','Включение и отключение применяется после перезапуска игры.'));
    page.append(camp);
  } else {
    page.append(textureIntro(),...textureNodes());
  }
  return page;
}
