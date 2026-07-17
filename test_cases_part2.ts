import { normalizeInventoryItem } from './utils/unitConversion';

// Case H
const itemH = {
  currentQtyBase: 600,
  currentQty: 20,
  minLevelBase: 90,
  minLevel: 3,
  costPerBaseUnit: 0.5,
  cost: 10,
  baseUnit: 'pcs',
  unit: 'Tray'
};
const resH = normalizeInventoryItem(itemH);
console.log('Case H:', {
  currentQtyBase: resH.currentQtyBase,
  currentQty: resH.currentQty,
  minLevelBase: resH.minLevelBase,
  minLevel: resH.minLevel,
  costPerBaseUnit: resH.costPerBaseUnit,
  cost: resH.cost,
  baseUnit: resH.baseUnit,
  unit: resH.unit
});

// Case I
const itemI = {
  currentQtyBase: 0,
  currentQty: 100,
  costPerBaseUnit: 0,
  cost: 20
};
const resI = normalizeInventoryItem(itemI);
console.log('Case I:', {
  currentQtyBase: resI.currentQtyBase,
  currentQty: resI.currentQty,
  costPerBaseUnit: resI.costPerBaseUnit,
  cost: resI.cost
});
