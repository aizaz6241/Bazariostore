/**
 * Batch 10 Blueprints Index
 * Combines all 4 groups (520 total candidate blueprints, 26 per category across 20 categories)
 */

import { BATCH10_GROUP1 } from './batch10-group1.js';
import { BATCH10_GROUP2 } from './batch10-group2.js';
import { BATCH10_GROUP3 } from './batch10-group3.js';
import { BATCH10_GROUP4 } from './batch10-group4.js';

export const ALL_BATCH10_BLUEPRINTS = [
  ...BATCH10_GROUP1,
  ...BATCH10_GROUP2,
  ...BATCH10_GROUP3,
  ...BATCH10_GROUP4
];

export {
  BATCH10_GROUP1,
  BATCH10_GROUP2,
  BATCH10_GROUP3,
  BATCH10_GROUP4
};
