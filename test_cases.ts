import {
  normalizeInventoryItem,
  getCurrentQtyBase,
  getMinLevelBase,
  getMaxQtyBase,
  getCostPerBaseUnit,
  getBaseUnit,
  getStockValue,
  getStockStatus,
  needsReplenishment,
  getDisplayToBaseRatio,
  getPreferredCountQuantity
} from './utils/unitConversion';

// Case A
const itemA = { currentQty: 100, minLevel: 20, cost: 2 };
console.log('Case A Value:', getStockValue(itemA));

// Case B
const itemB = { currentQtyBase: 600, currentQty: 20, costPerBaseUnit: 0.5, cost: 10 };
console.log('Case B Value:', getStockValue(itemB));

// Case C
const itemC = { currentQtyBase: 0, currentQty: 100 };
console.log('Case C currentQtyBase:', getCurrentQtyBase(itemC));
console.log('Case C status:', getStockStatus(itemC));

// Case D
const itemD = { currentQtyBase: 10, minLevelBase: 20 };
console.log('Case D status:', getStockStatus(itemD));
console.log('Case D needsReplenishment:', needsReplenishment(itemD));

// Case E
const itemE = { currentQtyBase: 30, minLevelBase: 20 };
console.log('Case E status:', getStockStatus(itemE));
console.log('Case E needsReplenishment:', needsReplenishment(itemE));

// Case F
const itemF = { currentQtyBase: 600, preferredStockViewUnit: 'DISPLAY', displayUnit: 'Tray', displayToBaseRatio: 30 };
console.log('Case F getPreferredCountQuantity:', getPreferredCountQuantity(itemF));

// Case G
const itemG = { displayToBaseRatio: 0 };
console.log('Case G getDisplayToBaseRatio:', getDisplayToBaseRatio(itemG));
