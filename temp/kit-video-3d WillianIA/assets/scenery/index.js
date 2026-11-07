// Cenário: importe daqui. Os módulos abaixo registram os assets em SCENERY (efeito colateral do import).

import './houses.js';
import './buildings.js';
import './trees.js';
import './roads.js';
import './vehicles.js';
import './props.js';
import './construction.js';
import './generico.js';

export {
  SCENERY, CATEGORIES, PAL, SKIES, makeScenery, setProgress, updateScenery, rollWheels, sceneryBox, setupEnvironment,
  setEnvironmentTime, rng,
} from './kit.js';

import { SCENERY } from './kit.js';
export const SCENERY_IDS = Object.keys(SCENERY);
