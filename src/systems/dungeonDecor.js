import { getPref } from './uiPrefs.js';
import { morrowindDataCount } from '../scenes/dataSource.js';

export const morrowindWorldVisualEnabled = (key) => getPref(key) !== false && morrowindDataCount() > 0;
export const dungeonDecorEnabled = () => morrowindWorldVisualEnabled('enhancedDungeonProps');
