import { dungeonChainRecords } from '../world/dungeonChainModel.js';
import { dungeonRemainsRecords } from '../world/dungeonRemainsModel.js';
import { treasurePreviewRecords } from '../world/treasureModel.js';
import { dungeonFurnishingRecords } from '../world/dungeonFurnishings.js';
import { dungeonCaveRecords } from '../world/dungeonCaveProps.js';
import { RANDOM_TREASURE_ARCHIVE } from '../systems/loot/lootDataTables.js';
import { violetSarcophagusShells } from '../world/dungeonSarcophagus.js';
import { classicDungeonPropGroups } from './dungeonClassicPropCatalog.js';

export const isVioletSarcophagusPreview = id => id?.startsWith('arch3d:') && violetSarcophagusShells.has(Number(id.slice(7)));

const labels = {
  chain: 'Одиночная цепь', 'chain-pair': 'Двойная цепь', 'chain-staggered': 'Цепи разной длины',
  skull: 'Череп', 'skull-open': 'Череп с открытой челюстью', 'skull-side': 'Череп на боку',
  stake: 'Череп на колу', stakes: 'Черепа на кольях', bones: 'Куча костей', standing: 'Подвешенный скелет',
  ribs: 'Рёбра', arm: 'Кости руки', bone: 'Кость', cage: 'Клетка со скелетом',
  'broken-cage': 'Разбитая клетка',
  'skeleton-floor': 'Скелет на спине',
  'skeleton-floor-side': 'Скелет на животе',
  'skeleton-hanging': 'Скелет на цепи',
  'skeleton-crossbar': 'Скелет под перекладиной',
  'skeleton-stake': 'Скелет у кола',
  'skeleton-stake-bare': 'Скелет без черепа у кола',
};
const named = entries => entries.map(([id, kind]) => [id, labels[kind] ?? kind]);
const lights = [
  'Жаровня', 'Костёр', 'Свеча', 'Свеча', 'Подсвечник', 'Подсвечник', 'Напольный факел',
  'Люстра', 'Подвесная лампа', 'Люстра', 'Люстра', 'Подвесная лампа', 'Погашенная лампа',
  'Подвесная лампа', 'Напольная лампа', 'Напольная лампа', 'Настенный факел', 'Настенный факел',
  'Настенный факел', 'Жаровня', 'Напольный факел', 'Напольная лампа', 'Фонарь', 'Люстра',
  'Фонарь', 'Фонарь', 'Фонарь', 'Фонарь', 'Напольная лампа', 'Напольная лампа',
];
const lootNames = {
  sack: 'мешок', coins: 'монеты', sword: 'меч', rope: 'верёвка', cloth: 'ткань',
  blade: 'клинок', pot: 'горшок', bottle: 'бутылка', flask: 'фляга', smallChest: 'сундучок', chest: 'сундук',
};

export const decorPreviewGroups = [
  ...classicDungeonPropGroups.map(([name, ids]) => [name, ids.map(id =>
    ['arch3d:' + id, violetSarcophagusShells.has(id) ? 'Фиолетовый саркофаг' : 'Модель ' + id])]),
  ['Реквизит', [...named(dungeonChainRecords()), ['203:5', 'Резная колонна'], ['203:6', 'Узкая колонна']]],
  ['Обстановка', dungeonFurnishingRecords()],
  ['Пещеры', dungeonCaveRecords()],
  ['Останки и клетки', [
    ...named(dungeonRemainsRecords()),
    ['206:0/skull-0', 'Череп · с челюстью'],
    ['206:0/skull-1', 'Череп · без челюсти'],
    ['206:0/skull-2', 'Череп · наклонённый'],
    ['206:8/bones-0', 'Куча костей · с черепом и рукой'],
    ['206:8/bones-1', 'Куча костей · с грудной клеткой'],
  ]],
  ['Лут', treasurePreviewRecords().map(([record, parts]) => [
    RANDOM_TREASURE_ARCHIVE + ':' + record, parts.split(' ').map(part => lootNames[part]).join(', '),
  ])],
  ['Освещение', [
    ...lights.map((name, record) => ['210:' + record, name]),
    ['190:3', 'Факел на стойке'], ['200:7', 'Фонарь на длинной цепи'],
    ['200:8', 'Фонарь на цепи'], ['200:9', 'Фонарь на короткой цепи'],
  ]],
];
