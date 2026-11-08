import { getPref, setPref } from '../../systems/uiPrefs.js';

const EN = new Map([
  [
    "Для модификаций на основе Morrowind обязательно подключите 3D-ресурсы в Mods & files.",
    "Connect your Morrowind 3D resources in Mods & files before using these modifications."
  ],
  [
    "Открыть Mods & files",
    "Open Mods & files"
  ],
  [
    "Изменения ресурсов применятся после перезапуска игры.",
    "Resource changes take full effect after restarting the game."
  ],
  [
    "Перезапустить",
    "Restart"
  ],
  [
    "Хранилище ресурсов: ",
    "Resource storage: "
  ],
  [
    "Отображение инвентаря",
    "Inventory appearance"
  ],
  [
    "Сохраняет 2D-персонажа и значки предметов в инвентаре. Модели Morrowind продолжают работать в игровом мире. Paperdoll Enhanced улучшает 2D-персонажа.",
    "Choose a 2D paperdoll or a 3D inventory view. World models stay enabled. Paperdoll Enhanced improves the 2D paperdoll."
  ],
  [
    "Инвентарь: 2D",
    "Inventory: 2D"
  ],
  [
    "Инвентарь: 3D",
    "Inventory: 3D"
  ],
  [
    "Отключить связку",
    "Disable group"
  ],
  [
    "Включить связку",
    "Enable group"
  ],
  [
    "Набор ресурсов неполный. Для отсутствующих компонентов сохраняется прежний резервный источник.",
    "Some resources are missing. The existing fallback remains in use."
  ],
  [
    "СВЯЗАННЫЕ РЕСУРСЫ",
    "LINKED RESOURCES"
  ],
  [
    "подключён",
    "connected"
  ],
  [
    "не подключён",
    "not connected"
  ],
  [
    "Открыть редактор персонажа",
    "Open character editor"
  ],
  [
    "Редактор персонажа и экипировки",
    "Character and equipment editor"
  ],
  [
    "Интеграция и настройка: BLOODBATH",
    "Integration and configuration: BLOODBATH"
  ],
  [
    "Настройка внешности и выбор доступных вариантов брони, оружия и плащей. Недоступный сохранённый вариант заменяется стандартным.",
    "Adjust character appearance and select available equipment looks. Missing saved variants fall back to standard models."
  ],
  [
    "Автор: ",
    "Author: "
  ],
  [
    "Авторы: ",
    "Authors: "
  ],
  [
    "Интеграция: ",
    "Integration: "
  ],
  [
    "Автор уточняется",
    "Author to be confirmed"
  ],
  [
    "Подключены пользователем",
    "User resources connected"
  ],
  [
    "Ресурсы текущей сборки",
    "Current build resources"
  ],
  [
    "файлов: ",
    "files: "
  ],
  [
    "Ресурсы не подключены",
    "No resources connected"
  ],
  [
    "Скачать с Nexus Mods",
    "Download on Nexus Mods"
  ],
  [
    "Выбрать источник заново",
    "Choose source again"
  ],
  [
    "Подключить ресурсы",
    "Connect resources"
  ],
  [
    "Удалить ресурсы",
    "Remove resources"
  ],
  [
    "Обновляет двумерное изображение персонажа и экипировки в инвентаре. Используется при включённом 2D-инвентаре.",
    "Replaces 2D character and equipment artwork in the inventory. Requires 2D inventory mode."
  ],
  [
    "Включён",
    "Enabled"
  ],
  [
    "Отключён",
    "Disabled"
  ],
  [
    "Отключить",
    "Disable"
  ],
  [
    "Включить",
    "Enable"
  ],
  [
    "Найти Paperdoll Enhanced на Nexus Mods",
    "Find Paperdoll Enhanced on Nexus Mods"
  ],
  [
    "Подключить ресурсы (.dfmod)",
    "Connect resources (.dfmod)"
  ],
  [
    "Paperdoll Enhanced и кастомизация работают только при включённом 2D-инвентаре.",
    "Paperdoll Enhanced and paperdoll customization require 2D inventory mode."
  ],
  [
    "Кастомизация paperdoll",
    "Paperdoll customization"
  ],
  [
    "Меняет 2D-облик предметов на карточке персонажа в инвентаре: лицо, броню в пределах её материала, одежду — любую того же типа: верх, полное облачение, низ, обувь, плащ (с учётом поднятого или опущенного капюшона), оружие и щиты в пределах их класса. Облик видите только вы: мир и другие игроки видят прежний. Работает с Paperdoll Enhanced и без него. Выберите предмет в инвентаре — вкладка «2D».",
    "Changes the 2D look of items on the inventory figure: the face, armor within its own material, clothing to any garment of its type: top, full outfit, legs, feet, cloak (matching a raised or lowered hood), weapons and shields within their class. Only you see it: the world and other players keep the original. Works with and without Paperdoll Enhanced. Pick an item in the inventory, tab \"2D\"."
  ],
  [
    "Отключить кастомизацию",
    "Disable customization"
  ],
  [
    "Включить кастомизацию",
    "Enable customization"
  ],
  [
    "Кастомизация 3D",
    "3D customization"
  ],
  [
    "Меняет 3D-модель предметов на вашем персонаже: броню — на любую модель Morrowind её весового класса, одежду и оружие — на модели того же типа, плюс дополнительные облики ниже, если они подключены. Облик видите только вы: другие игроки видят прежнюю модель. Выберите предмет в инвентаре — вкладка «3D».",
    "Changes the 3D model of items on your character: armor to any Morrowind model of its weight class, clothing and weapons to models of the same type, plus the additional looks below when connected. Only you see it: other players keep the original model. Pick an item in the inventory, tab \"3D\"."
  ],
  [
    "Отключить кастомизацию 3D",
    "Disable 3D customization"
  ],
  [
    "Включить кастомизацию 3D",
    "Enable 3D customization"
  ],
  [
    "Анимация плащей: включена",
    "Cloak animation: enabled"
  ],
  [
    "Анимация плащей: выключена",
    "Cloak animation: disabled"
  ],
  [
    "Анимация стандартного плаща: требуется кастомизация 3D. Замена тела не требуется.",
    "Animates the standard cloak. Requires 3D customization; replacement bodies are optional."
  ],
  [
    "Дополнительный внешний вид брони",
    "Additional armor appearances"
  ],
  [
    "Железная броня.",
    "Iron armor."
  ],
  [
    "Дополнительный внешний вид оружия",
    "Additional weapon appearances"
  ],
  [
    "Двуручная стальная секира.",
    "Two-handed steel battleaxe."
  ],
  [
    "Дополнительный внешний вид плащей",
    "Additional cloak appearances"
  ],
  [
    "Волчьи шкуры: коричневая, белая и чёрная. Требуется анимация плащей.",
    "Wolf pelts: brown, white and black. Requires cloak animation."
  ],
  [
    "Требуется группа «Тела и руки»: Better Bodies / Better Hands.",
    "Requires the Bodies and hands group: Better Bodies / Better Hands."
  ],
  [
    "Костёр",
    "Campfire"
  ],
  [
    "Объёмные поленья, угли и пламя с пикселизацией и подгонкой к поверхности. Ресурсы входят в сборку.",
    "Adds 3D logs, embers and flames with pixelation and ground alignment. Included with the build."
  ],
  [
    "Включение и отключение применяется после перезапуска игры.",
    "Enabling or disabling takes effect after restarting the game."
  ],
  [
    "Параметры текстур сохранены. Изменения этого раздела применяются по прежним правилам.",
    "Texture settings retain their existing behavior."
  ],
  [
    "Требуется включённая кастомизация 3D.",
    "Requires enabled 3D customization."
  ],
  [
    "Включите кастомизацию 3D.",
    "Enable 3D customization."
  ],
  [
    "Подключите все ресурсы и включите группу «Тела и руки» (Better Bodies / Better Hands).",
    "Connect all resources and enable Bodies and hands (Better Bodies / Better Hands)."
  ],
  [
    "Включите анимацию плащей.",
    "Enable cloak animation."
  ],
  [
    "Тела зверорас",
    "Beast bodies"
  ],
  [
    "Реакции на попадания",
    "Hit reactions"
  ],
  [
    "Анимации персонажа",
    "Character animations"
  ],
  [
    "Тела и руки",
    "Bodies and hands"
  ],
  [
    "Тела и анимации",
    "Bodies and animations"
  ],
  [
    "Окружение",
    "Environment"
  ],
  [
    "Текстуры",
    "Textures"
  ],
  [
    "Раздел",
    "Section"
  ],
  [
    "Перевод",
    "Language"
  ],
  [
    "Заменяет поддерживаемые реакции на попадания, пошатывания и смерть. Применение определяется сохранённым профилем сборки.",
    "Adds supported hit, stagger and death clips. Applied according to the saved build profile."
  ],
  [
    "Заменяет поддерживаемые движения, стойки и повороты. В этой сборке входит в профиль движения Vanilla.",
    "Provides movement clips used by this build: running, sneaking, turning and movement in a combat stance."
  ],
  [
    "Обновляет анимации оружия, стоек и прыжков от первого лица.",
    "Provides first-person weapon actions, stances and jumps. Directional movement from OpenMW is layered over it."
  ],
  [
    "Добавляет направленные движения от первого и третьего лица. Движения первого лица накладываются поверх ReAnimation.",
    "Adds directional walking, running and sneaking for compatible first- and third-person rigs. Original Lua scripts are not executed."
  ],
  [
    "Заменяет тела и соответствующие текстуры кожи. Также предоставляет геометрию большого пальца для кулака от первого лица.",
    "Replaces body meshes and matching skin textures. Also supplies fist-thumb geometry for the first-person hand integration."
  ],
  [
    "Предоставляет основу рук и текстуры кожи для связки Better Hands.",
    "Replaces first-person hands. This build combines them with Robert’s Bodies arms and Better Bodies fist geometry."
  ],
  [
    "Заменяет кисти от первого лица. В сборке работает совместно с Robert’s Bodies и Better Bodies.",
    "Provides replacement beast-race bodies. Unsupported or missing parts retain their existing fallback."
  ],
  [
    "Предоставляет тела зверорас для выбранного профиля тел.",
    "Optional beast-race resources. Missing resources keep the standard beast models."
  ],
  [
    "Заменяет железные перчатки от первого лица, подгоняя их к форме кистей.",
    "Imported hit reactions use a separate resource group. Existing clip fallback remains available."
  ],
  [
    "Дополнительные ресурсы зверорас. Отсутствие этого пакета сохраняет штатные модели зверорас.",
    "Combines movement and first-person action providers in a fixed order. All required resources must be connected."
  ],
  [
    "Ресурсы реакций применяются по сохранённому профилю. Профиль Vanilla сохраняет прежнее поведение.",
    "Connects body meshes, skin, first-person hands and gauntlets as one tested configuration."
  ]
]);
EN.set("Реакции на попадания, пошатывания и смерть для совместимых моделей. Неподдерживаемые клипы используют прежний источник.","Hit, stagger and death animations for compatible rigs. Unsupported clips retain their existing source.");
EN.set("Бег, скрытность, повороты и движение в боевой стойке. Входит в сохранённый профиль движения сборки.","Running, sneaking, turning and movement in a combat stance. Part of the saved build profile.");
EN.set("Движения оружия, стойки и прыжки от первого лица. Движения OpenMW накладываются поверх этого набора.","First-person weapon actions, stances and jumps. OpenMW movement is layered over this set.");
EN.set("Направленные ходьба, бег и скрытность от первого и третьего лица. Оригинальные Lua-скрипты не выполняются.","Directional walking, running and sneaking in first and third person. Original Lua scripts are not executed.");
EN.set("Модели тел и текстуры кожи. Также предоставляет геометрию большого пальца для кулака от первого лица.","Body meshes and skin textures. Also supplies thumb geometry for first-person fists.");
EN.set("Предплечья и текстуры кожи для рук от первого лица. К этой основе присоединяются кисти Better Hands.","First-person arms and skin textures. Better Hands meshes attach to this base.");
EN.set("Кисти от первого лица. Используются вместе с предплечьями Robert’s Bodies и геометрией кулака Better Bodies.","First-person hands. Uses Robert’s Bodies arms and Better Bodies fist geometry.");
EN.set("Модели тел зверорас. При отсутствии совместимых файлов сохраняются стандартные модели.","Beast-race bodies. Missing compatible files retain standard models.");
EN.set("Железные перчатки от первого лица, подогнанные к улучшенным кистям. Другие перчатки сохраняют прежний вид.","First-person iron gauntlets fitted to improved hands. Other gauntlets retain their existing appearance.");
EN.set("Комплекты брони из TESO 5","Armor sets from TESO 5");
EN.set("Комплекты оружия из TESO 5","Weapon sets from TESO 5");
EN.set("Требуется указать путь к файлам игры Skyrim SE.","Requires the path to your Skyrim SE game files.");
EN.set("Сейчас доступна железная броня.","Currently available: iron armor.");
EN.set("Сейчас доступна двуручная стальная секира.","Currently available: two-handed steel battleaxe.");
EN.set("Тела и руки — Better Bodies / Better Hands","Bodies and hands — Better Bodies / Better Hands");
EN.set("Анимация плащей","Cloak animation");
EN.set("Интеграция: BLOODBATH","Integration: BLOODBATH");
EN.set("Автор: BLOODBATH","Author: BLOODBATH");
EN.set("Тела зверорас","Beast bodies");
EN.set("Реакции на попадания","Hit reactions");
EN.set("Анимации персонажа","Character animations");
EN.set("Тела и руки","Bodies and hands");
EN.set("Тела и анимации","Bodies and animations");
EN.set("Окружение","Environment");
EN.set("Текстуры","Textures");
EN.set("Раздел","Section");
EN.set("Перевод","Language");
EN.set("Дополнительные ресурсы зверорас. Отсутствие этого пакета сохраняет штатные модели зверорас.","Optional beast-race resources. Missing files retain standard beast models.");
EN.set("Ресурсы реакций применяются по сохранённому профилю. Профиль Vanilla сохраняет прежнее поведение.","Reaction resources follow the saved build profile. Vanilla retains the existing behavior.");
EN.set("Единый профиль движения. ReAnimation и OpenMW дополняют друг друга; порядок применения сохраняется.","A fixed movement profile. ReAnimation and OpenMW complement each other in the existing overlay order.");
EN.set("Общая связка тел, кожи, рук и перчаток. Компоненты включаются вместе.","A combined set of bodies, skin, hands and gauntlets. Components are enabled together.");
EN.set("Меняет 2D-облик предметов на карточке персонажа в инвентаре: лицо, броню в пределах её материала, одежду — любую того же типа: верх, полное облачение, низ, обувь, плащ (с учётом поднятого или опущенного капюшона), оружие и щиты в пределах их класса. Облик видите только вы: мир и другие игроки видят прежний. Работает с Paperdoll Enhanced и без него. Выберите предмет в инвентаре — вкладка «2D».","Customize the 2D appearance of items on your inventory paperdoll: face, armor within its material, clothing to any garment of its type: top, full outfit, legs, feet, cloak (with separate hood-up and hood-down cloak looks), weapons and shields within their class. Only you see these changes; the world and other players keep the original appearance. Works with or without Paperdoll Enhanced. Select an inventory item and open the 2D tab.");
EN.set("Меняет 3D-модель предметов на вашем персонаже: броню — на любую модель Morrowind её весового класса, одежду и оружие — на модели того же типа, плюс дополнительные облики ниже, если они подключены. Облик видите только вы: другие игроки видят прежнюю модель. Выберите предмет в инвентаре — вкладка «3D».","Customize 3D equipment on your character: armor can use Morrowind models of the same weight class; clothing and weapons use models of the same type. The additional looks below are available when connected. Only you see these changes; other players keep seeing the original model. Select an inventory item and open the 3D tab.");
EN.set("Выберите 2D-карточку персонажа или 3D-инвентарь. В режиме 2D модели Morrowind продолжают работать в игровом мире, а персонаж и значки предметов в инвентаре остаются двумерными. Paperdoll Enhanced улучшает 2D-карточку.","Choose a 2D paperdoll or a 3D inventory. In 2D mode, Morrowind models remain active in the game world, while the inventory character and item icons stay two-dimensional. Paperdoll Enhanced improves the 2D paperdoll.");
EN.set("Работает без модов · улучшают:","Works without mods · enhanced by:");
EN.set("Перерисовывает 2D-облики в высоком разрешении (женские персонажи)","Repaints the 2D looks in high resolution (female characters)");
EN.set("Better Bodies и Better Hands: броня и одежда сидят на улучшенных телах","Better Bodies and Better Hands: armor and clothing fit the improved bodies");
EN.set("Дополнительные облики","Additional looks");
EN.set("Комплекты ниже добавляют варианты во вкладку 3D","The sets below add choices to the 3D tab");
EN.set("подключено","connected");
EN.set("не подключено","not connected");
EN.set("Работает и без этих дополнений.","Works with or without these enhancements.");
EN.set("Дополнительные улучшения","Optional enhancements");
EN.set("Используется","In use");
EN.set("Не используется","Not in use");
export const emcLanguage = () => getPref('emcLanguage') === 'en' ? 'en' : 'ru';
export const setEmcLanguage = language => setPref('emcLanguage',language === 'en' ? 'en' : 'ru');
export function emcText(value) {
  if (emcLanguage() !== 'en' || typeof value !== 'string') return value;
  if (EN.has(value)) return EN.get(value);
  let text=value;
  for (const [ru,en] of [...EN].sort((a,b)=>b[0].length-a[0].length)) text=text.split(ru).join(en);
  return text;
}
