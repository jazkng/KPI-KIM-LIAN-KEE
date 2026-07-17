export type ConversionMode = "FIXED" | "ACTUAL_WEIGHT";

export interface PurchaseUnit {
  id: string;
  name: string;

  toDisplayRatio?: number; // e.g. 1 Bundle = 20 Pkt
  toBaseRatio: number; // e.g. 1 Bundle = 20 kg

  price?: number;
  isDefault?: boolean;

  conversionMode?: ConversionMode;

  // Legacy/compatibility fields
  purchaseUnitToDisplayRatio?: number;
  purchaseUnitToBaseRatio?: number;
  unit?: string; // some old items might have unit inside purchase unit
}

export interface InventoryItem {
  id: string;
  name: string;

  baseUnit: string; // e.g. kg
  displayUnit?: string; // e.g. Pkt
  displayToBaseRatio?: number; // e.g. 1 Pkt = 1 kg, so displayToBaseRatio is 1

  purchaseUnits?: PurchaseUnit[];

  currentQtyBase: number;
  costPerBaseUnit: number;

  // Legacy fields
  unit?: string;
  currentQty?: number;
  cost?: number;
  minLevel?: number;
  maxQty?: number;
  category?: string;
  isKeyItem?: boolean;
  image?: string;
  minLevelBase?: number;
  maxQtyBase?: number;
}

export function normalizeUnitName(unit?: string): string {
  return (unit || '').trim().toUpperCase();
}

export function toFiniteNumber(
  value: unknown,
  fallback = 0
): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function toPositiveNumber(
  value: unknown,
  fallback = 0
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

export function roundQuantity(
  value: number,
  decimals = 4
): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function calculatePurchaseToBaseRatio(params: {
  purchaseToDisplayRatio?: number;
  displayToBaseRatio?: number;
  existingToBaseRatio?: number;
}): number {
  const purchaseToDisplayRatio = toPositiveNumber(
    params.purchaseToDisplayRatio,
    0
  );
  const displayToBaseRatio = toPositiveNumber(
    params.displayToBaseRatio,
    0
  );
  const existingToBaseRatio = toPositiveNumber(
    params.existingToBaseRatio,
    0
  );

  if (purchaseToDisplayRatio > 0 && displayToBaseRatio > 0) {
    return roundQuantity(purchaseToDisplayRatio * displayToBaseRatio);
  }

  if (existingToBaseRatio > 0) {
    return existingToBaseRatio;
  }

  return 1;
}

export function convertPurchaseToDisplay(
  purchaseQty: number,
  purchaseToDisplayRatio: number
): number {
  const qty = toFiniteNumber(purchaseQty, 0);
  const ratio = toPositiveNumber(purchaseToDisplayRatio, 1);
  return roundQuantity(qty * ratio);
}

export function convertDisplayToBase(
  displayQty: number,
  displayToBaseRatio: number
): number {
  const qty = toFiniteNumber(displayQty, 0);
  const ratio = toPositiveNumber(displayToBaseRatio, 1);
  return roundQuantity(qty * ratio);
}

export function convertPurchaseToBase(params: {
  purchaseQty: number;
  purchaseToDisplayRatio?: number;
  displayToBaseRatio?: number;
  existingToBaseRatio?: number;
}): number {
  const qty = toFiniteNumber(params.purchaseQty, 0);
  const ratio = calculatePurchaseToBaseRatio({
    purchaseToDisplayRatio: params.purchaseToDisplayRatio,
    displayToBaseRatio: params.displayToBaseRatio,
    existingToBaseRatio: params.existingToBaseRatio,
  });
  return roundQuantity(qty * ratio);
}

export function convertBaseToDisplay(
  baseQty: number,
  displayToBaseRatio: number
): number {
  const qty = toFiniteNumber(baseQty, 0);
  const ratio = toPositiveNumber(displayToBaseRatio, 1);
  return roundQuantity(qty / ratio);
}

export function convertBaseToPurchase(params: {
  baseQty: number;
  purchaseToDisplayRatio?: number;
  displayToBaseRatio?: number;
  existingToBaseRatio?: number;
}): number {
  const qty = toFiniteNumber(params.baseQty, 0);
  const ratio = calculatePurchaseToBaseRatio({
    purchaseToDisplayRatio: params.purchaseToDisplayRatio,
    displayToBaseRatio: params.displayToBaseRatio,
    existingToBaseRatio: params.existingToBaseRatio,
  });
  return ratio > 0 ? roundQuantity(qty / ratio) : 0;
}

export function calculateUnitCosts(params: {
  purchaseUnitCost: number;
  purchaseToDisplayRatio?: number;
  displayToBaseRatio?: number;
  existingToBaseRatio?: number;
}) {
  const purchaseUnitCost = toFiniteNumber(params.purchaseUnitCost, 0);
  const purchaseToDisplayRatio = toPositiveNumber(
    params.purchaseToDisplayRatio,
    0
  );
  const purchaseToBaseRatio = calculatePurchaseToBaseRatio({
    purchaseToDisplayRatio: params.purchaseToDisplayRatio,
    displayToBaseRatio: params.displayToBaseRatio,
    existingToBaseRatio: params.existingToBaseRatio,
  });

  const costPerDisplayUnit =
    purchaseToDisplayRatio > 0 ? purchaseUnitCost / purchaseToDisplayRatio : 0;
  const costPerBaseUnit =
    purchaseToBaseRatio > 0 ? purchaseUnitCost / purchaseToBaseRatio : 0;

  return {
    purchaseUnitCost: roundQuantity(purchaseUnitCost, 4),
    costPerDisplayUnit: roundQuantity(costPerDisplayUnit, 4),
    costPerBaseUnit: roundQuantity(costPerBaseUnit, 4),
    purchaseToBaseRatio: roundQuantity(purchaseToBaseRatio, 4),
  };
}

export function calculateStockValue(params: {
  currentQtyBase: number;
  costPerBaseUnit: number;
}): number {
  const currentQtyBase = toFiniteNumber(params.currentQtyBase, 0);
  const costPerBaseUnit = toFiniteNumber(params.costPerBaseUnit, 0);
  return roundQuantity(currentQtyBase * costPerBaseUnit, 2);
}

export function normalizeInventoryItem(item: any): InventoryItem {
  const baseUnit = getBaseUnit(item);
  const displayUnit = item?.displayUnit || item?.displayUnitName || baseUnit;
  const currentQtyBase = getCurrentQtyBase(item);
  const minLevelBase = getMinLevelBase(item);
  const maxQtyBase = getMaxQtyBase(item);
  const costPerBaseUnit = getCostPerBaseUnit(item);
  const displayToBaseRatio = getDisplayToBaseRatio(item);

  const rawPurchaseUnits = Array.isArray(item?.purchaseUnits)
    ? item.purchaseUnits
    : [];

  const purchaseUnits = rawPurchaseUnits.map((unit: any, index: number) => {
    const toDisplayRatioRaw = Number(
      unit?.toDisplayRatio ?? unit?.purchaseUnitToDisplayRatio ?? 0
    );
    const toDisplayRatio =
      Number.isFinite(toDisplayRatioRaw) && toDisplayRatioRaw > 0
        ? toDisplayRatioRaw
        : 0;

    const existingToBaseRatioRaw = Number(
      unit?.toBaseRatio ?? unit?.purchaseUnitToBaseRatio ?? 0
    );
    const existingToBaseRatio =
      Number.isFinite(existingToBaseRatioRaw) && existingToBaseRatioRaw > 0
        ? existingToBaseRatioRaw
        : 0;

    const toBaseRatio = calculatePurchaseToBaseRatio({
      purchaseToDisplayRatio: toDisplayRatio,
      displayToBaseRatio,
      existingToBaseRatio,
    });

    return {
      ...unit,
      id: unit?.id || `purchase-unit-${index}`,
      name: unit?.name || unit?.unit || "Unit",
      toDisplayRatio,
      purchaseUnitToDisplayRatio: toDisplayRatio,
      toBaseRatio,
      purchaseUnitToBaseRatio: toBaseRatio,
      conversionMode:
        unit?.conversionMode === "ACTUAL_WEIGHT" ? "ACTUAL_WEIGHT" : "FIXED",
      isDefault: Boolean(unit?.isDefault),
    };
  });

  return {
    ...item,
    id: item?.id || "",
    name: item?.name || "",
    
    baseUnit,
    currentQtyBase,
    minLevelBase,
    maxQtyBase,
    costPerBaseUnit,

    // Temporary legacy aliases for modules not migrated yet
    unit: baseUnit,
    currentQty: currentQtyBase,
    minLevel: minLevelBase,
    maxQty: maxQtyBase,
    cost: costPerBaseUnit,

    displayUnit,
    displayToBaseRatio,
    purchaseUnits,
  };
}

export function calculateWeightedAverageCost(params: {
  oldQtyBase: number;
  oldCostPerBaseUnit: number;
  receivedQtyBase: number;
  receivedTotalCost: number;
}) {
  const oldQtyBase = Math.max(0, toFiniteNumber(params.oldQtyBase, 0));
  const oldCostPerBaseUnit = Math.max(
    0,
    toFiniteNumber(params.oldCostPerBaseUnit, 0)
  );
  const receivedQtyBase = Math.max(
    0,
    toFiniteNumber(params.receivedQtyBase, 0)
  );
  const receivedTotalCost = Math.max(
    0,
    toFiniteNumber(params.receivedTotalCost, 0)
  );

  const oldStockValue = oldQtyBase * oldCostPerBaseUnit;
  const newQtyBase = oldQtyBase + receivedQtyBase;
  const newStockValue = oldStockValue + receivedTotalCost;

  const newCostPerBaseUnit =
    newQtyBase > 0 ? newStockValue / newQtyBase : 0;

  return {
    newQtyBase: roundQuantity(newQtyBase, 4),
    newCostPerBaseUnit: roundQuantity(newCostPerBaseUnit, 4),
    newStockValue: roundQuantity(newStockValue, 2),
  };
}

export interface ReceivedLineCalculationInput {
  receivedQty: number;
  finalCost: number;
  billByWeight?: boolean;
  receivedWeight?: number;
  pricingMode?: "FIXED_UNIT" | "WEIGHT_BASED";
  conversionMode?: "FIXED" | "ACTUAL_WEIGHT";
  toBaseRatio?: number;
  ratio?: number;
}

export interface ReceivedLineCalculationResult {
  isWeightBased: boolean;
  ratio: number;
  receivedQty: number;
  receivedBaseQty: number;
  finalUnitPrice: number;
  finalLineTotal: number;
  costPerBaseUnit: number;
}

/**
 * One receive calculation shared by the phone preview, stock update and saved PO.
 * For actual-weight goods, the measured weight is the base quantity.
 */
export function calculateReceivedLine(
  item: ReceivedLineCalculationInput
): ReceivedLineCalculationResult {
  const ratio = Number(item.toBaseRatio ?? item.ratio ?? 1);
  const receivedQty = Number(item.receivedQty);
  const finalUnitPrice = Number(item.finalCost);
  const configuredAsWeightBased =
    item.pricingMode === "WEIGHT_BASED" ||
    item.conversionMode === "ACTUAL_WEIGHT";
  // The receive-screen switch is authoritative: management may discover at
  // delivery time that a normally fixed item must be billed by actual weight.
  // When the switch is absent, keep the configured mode for backward compatibility.
  const isWeightBased =
    item.billByWeight === true ||
    (item.billByWeight !== false && configuredAsWeightBased);
  const receivedBaseQty = isWeightBased
    ? Number(item.receivedWeight || 0)
    : receivedQty * ratio;
  const finalLineTotal = roundQuantity(
    isWeightBased
      ? receivedBaseQty * finalUnitPrice
      : receivedQty * finalUnitPrice,
    2
  );
  const costPerBaseUnit =
    receivedBaseQty > 0 ? finalLineTotal / receivedBaseQty : 0;

  return {
    isWeightBased,
    ratio,
    receivedQty,
    receivedBaseQty,
    finalUnitPrice,
    finalLineTotal,
    costPerBaseUnit,
  };
}

export interface FixedConversionResult {
  purchaseQty: number;
  purchaseUnit: string;

  displayQty?: number;
  displayUnit?: string;

  baseQty: number;
  baseUnit: string;

  purchaseUnitPrice: number;
  costPerBaseUnit: number;
  totalCost: number;

  isValid: boolean;
  warning?: string;
}

export function resolveFixedUnitConversion(
  item: any,
  selectedPurchaseUnitName: string,
  quantity: number
): FixedConversionResult {
  const purchaseQty = toFiniteNumber(quantity, 0);
  const baseUnit = item.baseUnit || item.unit || "g";
  const displayUnit = item.displayUnit || item.displayUnitName || baseUnit;
  const displayToBaseRatio = toPositiveNumber(item.displayToBaseRatio, 1);

  // Find matching purchase unit rule
  const activeRule = Array.isArray(item.purchaseUnits)
    ? item.purchaseUnits.find(
        (u: any) =>
          normalizeUnitName(u.unitName) === normalizeUnitName(selectedPurchaseUnitName) ||
          normalizeUnitName(u.name) === normalizeUnitName(selectedPurchaseUnitName) ||
          normalizeUnitName(u.unit) === normalizeUnitName(selectedPurchaseUnitName)
      )
    : null;

  let purchaseToDisplayRatio = 1;
  let purchaseToBaseRatio = displayToBaseRatio;
  let purchaseUnitPrice = 0;

  if (activeRule) {
    purchaseToDisplayRatio = toPositiveNumber(
      activeRule.toDisplayRatio ?? activeRule.purchaseToDisplayRatio,
      1
    );
    purchaseToBaseRatio = toPositiveNumber(
      activeRule.toBaseRatio ?? activeRule.purchaseToBaseRatio,
      purchaseToDisplayRatio * displayToBaseRatio
    );
    purchaseUnitPrice = toFiniteNumber(
      activeRule.pricePerUnit ?? activeRule.price ?? activeRule.pricePerPurchaseUnit,
      0
    );
  } else if (normalizeUnitName(selectedPurchaseUnitName) === normalizeUnitName(displayUnit)) {
    purchaseToDisplayRatio = 1;
    purchaseToBaseRatio = displayToBaseRatio;
    purchaseUnitPrice = toFiniteNumber(item.costPerBaseUnit * displayToBaseRatio, 0);
  } else if (normalizeUnitName(selectedPurchaseUnitName) === normalizeUnitName(baseUnit)) {
    purchaseToDisplayRatio = 1 / displayToBaseRatio;
    purchaseToBaseRatio = 1;
    purchaseUnitPrice = toFiniteNumber(item.costPerBaseUnit ?? item.cost, 0);
  } else {
    // Default fallback
    purchaseToDisplayRatio = 1;
    purchaseToBaseRatio = displayToBaseRatio;
    purchaseUnitPrice = toFiniteNumber(item.costPerBaseUnit ?? item.cost ?? 0, 0);
  }

  const expectedToBaseRatio = purchaseToDisplayRatio * displayToBaseRatio;
  let warning: string | undefined;
  if (Math.abs(purchaseToBaseRatio - expectedToBaseRatio) > 0.0001) {
    warning = `换算比例不一致: 1 ${selectedPurchaseUnitName} = ${purchaseToDisplayRatio} ${displayUnit} = ${expectedToBaseRatio} ${baseUnit}，但设置中为 ${purchaseToBaseRatio} ${baseUnit}`;
  }

  const displayQty = roundQuantity(purchaseQty * purchaseToDisplayRatio);
  const baseQty = roundQuantity(purchaseQty * purchaseToBaseRatio);
  const totalCost = roundQuantity(purchaseQty * purchaseUnitPrice, 2);
  const costPerBaseUnit = purchaseToBaseRatio > 0 ? purchaseUnitPrice / purchaseToBaseRatio : 0;

  const isValid = Number.isFinite(purchaseQty) && purchaseQty >= 0 && purchaseToBaseRatio > 0 && purchaseUnitPrice >= 0;

  return {
    purchaseQty,
    purchaseUnit: selectedPurchaseUnitName,
    displayQty,
    displayUnit,
    baseQty,
    baseUnit,
    purchaseUnitPrice,
    costPerBaseUnit,
    totalCost,
    isValid,
    warning,
  };
}

export interface ActualWeightOrderResult {
  orderedQty: number;
  purchaseUnit: string;

  pricingUnit: string;
  pricePerPricingUnit: number;

  estimatedWeight?: number | null;
  estimatedTotal?: number | null;

  finalCost: null;
  status: "AWAITING_WEIGHT";

  isValid: boolean;
  warning?: string;
}

export interface ActualWeightReceiveResult {
  receivedQty: number;
  purchaseUnit: string;

  actualWeight: number;
  pricingUnit: string;

  pricePerPricingUnit: number;
  finalCost: number;

  averageWeightPerUnit: number;
  averageCostPerUnit: number;

  costPerPricingUnit: number;
  costPerGram?: number;

  isValid: boolean;
  warning?: string;
}

export function resolveActualWeightProcurement(params: {
  isReceive: false;
  orderedQty: number;
  purchaseUnit: string;
  pricingUnit: string;
  pricePerPricingUnit: number;
  estimatedWeight?: number | null;
}): ActualWeightOrderResult;

export function resolveActualWeightProcurement(params: {
  isReceive: true;
  receivedQty: number;
  purchaseUnit: string;
  actualWeight: number | null;
  pricingUnit: string;
  pricePerPricingUnit: number;
}): ActualWeightReceiveResult;

export function resolveActualWeightProcurement(params: {
  isReceive: boolean;
  orderedQty?: number;
  receivedQty?: number;
  purchaseUnit: string;
  pricingUnit: string;
  pricePerPricingUnit: number;
  estimatedWeight?: number | null;
  actualWeight?: number | null;
}): any {
  const pricePerPricingUnit = toFiniteNumber(params.pricePerPricingUnit, 0);
  const purchaseUnit = params.purchaseUnit || "UNIT";
  const pricingUnit = params.pricingUnit || "KG";

  if (!params.isReceive) {
    const orderedQty = toFiniteNumber(params.orderedQty, 0);
    const estimatedWeight = params.estimatedWeight != null ? toFiniteNumber(params.estimatedWeight, 0) : null;
    const estimatedTotal = estimatedWeight != null && estimatedWeight > 0 ? roundQuantity(estimatedWeight * pricePerPricingUnit, 2) : null;

    const isValid = orderedQty > 0 && pricePerPricingUnit > 0 && pricingUnit.length > 0;
    let warning: string | undefined;
    if (!isValid) {
      if (orderedQty <= 0) warning = "采购数量必须大于0";
      else if (pricePerPricingUnit <= 0) warning = "计价单价必须大于0";
    }

    return {
      orderedQty,
      purchaseUnit,
      pricingUnit,
      pricePerPricingUnit,
      estimatedWeight,
      estimatedTotal,
      finalCost: null,
      status: "AWAITING_WEIGHT",
      isValid,
      warning,
    };
  } else {
    const receivedQty = toFiniteNumber(params.receivedQty, 0);
    const actualWeight = params.actualWeight != null ? toFiniteNumber(params.actualWeight, 0) : 0;
    const finalCost = roundQuantity(actualWeight * pricePerPricingUnit, 2);
    const averageWeightPerUnit = receivedQty > 0 ? roundQuantity(actualWeight / receivedQty, 4) : 0;
    const averageCostPerUnit = receivedQty > 0 ? roundQuantity(finalCost / receivedQty, 4) : 0;

    const costPerGram = pricingUnit.toLowerCase() === "kg" ? pricePerPricingUnit / 1000 : undefined;

    const isValid = receivedQty > 0 && actualWeight > 0 && pricePerPricingUnit > 0 && pricingUnit.length > 0;
    let warning: string | undefined;
    if (!isValid) {
      if (receivedQty <= 0) warning = "收货数量必须大于0";
      else if (actualWeight <= 0) warning = "实际重量必须大于0";
      else if (pricePerPricingUnit <= 0) warning = "计价单价必须大于0";
    }

    return {
      receivedQty,
      purchaseUnit,
      actualWeight,
      pricingUnit,
      pricePerPricingUnit,
      finalCost,
      averageWeightPerUnit,
      averageCostPerUnit,
      costPerPricingUnit: pricePerPricingUnit,
      costPerGram,
      isValid,
      warning,
    };
  }
}

export function getCurrentQtyBase(item: any): number {
  const raw = item?.currentQtyBase ?? item?.currentQty ?? 0;
  return toFiniteNumber(raw, 0);
}

export function getMinLevelBase(item: any): number {
  const raw = item?.minLevelBase ?? item?.minLevel ?? 0;
  return toFiniteNumber(raw, 0);
}

export function getMaxQtyBase(item: any): number {
  const raw = item?.maxQtyBase ?? item?.maxQty ?? 0;
  return toFiniteNumber(raw, 0);
}

export function getCostPerBaseUnit(item: any): number {
  const raw = item?.costPerBaseUnit ?? item?.cost ?? 0;
  return toFiniteNumber(raw, 0);
}

export function getBaseUnit(item: any): string {
  return item?.baseUnit || item?.unit || 'pcs';
}

export function getStockValue(item: any): number {
  return calculateStockValue({
    currentQtyBase: getCurrentQtyBase(item),
    costPerBaseUnit: getCostPerBaseUnit(item)
  });
}

export function getStockStatus(item: any): 'OUT_OF_STOCK' | 'LOW_STOCK' | 'NORMAL' {
  const currentQtyBase = getCurrentQtyBase(item);
  const minLevelBase = getMinLevelBase(item);

  if (currentQtyBase <= 0) return 'OUT_OF_STOCK';
  if (currentQtyBase > 0 && currentQtyBase <= minLevelBase) return 'LOW_STOCK';
  return 'NORMAL';
}

export function needsReplenishment(item: any): boolean {
  return getCurrentQtyBase(item) <= getMinLevelBase(item);
}

export function getDisplayToBaseRatio(item: any): number {
  const ratio = toFiniteNumber(item?.displayToBaseRatio, 1);
  return ratio > 0 ? ratio : 1;
}

export function getPreferredCountQuantity(item: any): number {
  const currentQtyBase = getCurrentQtyBase(item);
  if (item?.preferredStockViewUnit === 'DISPLAY' && item?.displayUnit) {
    const ratio = getDisplayToBaseRatio(item);
    return roundQuantity(currentQtyBase / ratio);
  }
  return currentQtyBase;
}
