import {
  Employee,
  InventoryAccessConfig,
  InventoryPermission,
  InventoryScope,
  PortalRole,
} from '../types';
import { getPortalRole, isSystemAdminAccount } from './orgAccess';

export const INVENTORY_SCOPES: InventoryScope[] = [
  'KITCHEN',
  'BAR',
  'GENERAL',
  'FUEL',
];

export const INVENTORY_PERMISSIONS: InventoryPermission[] = [
  'VIEW_STOCK',
  'EXECUTE_STOCKTAKE',
  'ADD_ITEM',
  'EDIT_BASIC_INFO',
  'EDIT_MIN_LEVEL',
  'EDIT_COUNT_UNIT_CONVERSION',
  'EDIT_PURCHASE_UNIT_CONVERSION',
  'EDIT_BASE_UNIT',
  'EDIT_COST',
  'DEACTIVATE_ITEM',
];

export const INVENTORY_PERMISSION_LABELS: Record<InventoryPermission, string> = {
  VIEW_STOCK: '查看库存',
  EXECUTE_STOCKTAKE: '执行盘点',
  ADD_ITEM: '新增物品',
  EDIT_BASIC_INFO: '修改基本资料',
  EDIT_MIN_LEVEL: '修改安全库存',
  EDIT_COUNT_UNIT_CONVERSION: '修改盘点单位换算',
  EDIT_PURCHASE_UNIT_CONVERSION: '修改采购规格换算',
  EDIT_BASE_UNIT: '修改基础单位',
  EDIT_COST: '修改成本',
  DEACTIVATE_ITEM: '停用物品',
};

export const INVENTORY_SCOPE_LABELS: Record<InventoryScope, string> = {
  KITCHEN: '厨房',
  BAR: '水吧',
  GENERAL: '后勤',
  FUEL: '燃料',
};

const permissionRecord = (
  enabled: InventoryPermission[],
): Record<InventoryPermission, boolean> => {
  const enabledSet = new Set(enabled);
  return Object.fromEntries(
    INVENTORY_PERMISSIONS.map(permission => [permission, enabledSet.has(permission)]),
  ) as Record<InventoryPermission, boolean>;
};

const deriveLegacyScopes = (employee: Employee): InventoryScope[] => {
  const modules = new Set(employee.allowedModules || []);
  const scopes = INVENTORY_SCOPES.filter(scope => modules.has(`INVENTORY_${scope}` as any));

  if (scopes.length > 0) return scopes;

  const hasGenericInventoryAccess =
    modules.has('INVENTORY_VIEW') ||
    modules.has('INVENTORY_CHECK') ||
    modules.has('PROCUREMENT');

  return hasGenericInventoryAccess ? [...INVENTORY_SCOPES] : [];
};

export const getDefaultInventoryAccess = (
  portalRole: PortalRole,
  employee?: Employee | null,
): InventoryAccessConfig => {
  if (portalRole === PortalRole.BOSS) {
    return {
      version: 1,
      scopes: [...INVENTORY_SCOPES],
      permissions: permissionRecord([...INVENTORY_PERMISSIONS]),
    };
  }

  if (portalRole === PortalRole.MANAGEMENT) {
    return {
      version: 1,
      scopes: employee ? deriveLegacyScopes(employee) : [...INVENTORY_SCOPES],
      permissions: permissionRecord([
        'VIEW_STOCK',
        'EXECUTE_STOCKTAKE',
        'ADD_ITEM',
        'EDIT_BASIC_INFO',
        'EDIT_MIN_LEVEL',
        'EDIT_COUNT_UNIT_CONVERSION',
        'EDIT_PURCHASE_UNIT_CONVERSION',
      ]),
    };
  }

  return {
    version: 1,
    scopes: employee ? deriveLegacyScopes(employee) : [],
    permissions: permissionRecord(['EXECUTE_STOCKTAKE']),
  };
};

export const resolveInventoryAccess = (
  employee?: Employee | null,
  portalRole?: PortalRole,
): InventoryAccessConfig => {
  const resolvedRole = portalRole || (employee ? getPortalRole(employee) : PortalRole.STAFF);

  if (resolvedRole === PortalRole.BOSS || isSystemAdminAccount(employee)) {
    return getDefaultInventoryAccess(PortalRole.BOSS, employee);
  }

  const defaults = getDefaultInventoryAccess(resolvedRole, employee);
  const saved = employee?.inventoryAccess;
  if (!saved) return defaults;

  const allowedScopes = new Set(INVENTORY_SCOPES);
  const scopes = Array.from(new Set(saved.scopes || []))
    .filter((scope): scope is InventoryScope => allowedScopes.has(scope));

  return {
    version: 1,
    scopes,
    permissions: {
      ...defaults.permissions,
      ...saved.permissions,
    },
  };
};

export const hasInventoryPermission = (
  employee: Employee | null | undefined,
  permission: InventoryPermission,
  portalRole?: PortalRole,
): boolean => Boolean(resolveInventoryAccess(employee, portalRole).permissions[permission]);

export const hasInventoryScope = (
  employee: Employee | null | undefined,
  scope: InventoryScope,
  portalRole?: PortalRole,
): boolean => resolveInventoryAccess(employee, portalRole).scopes.includes(scope);

export const canAccessInventory = (
  employee: Employee | null | undefined,
  scope: InventoryScope,
  permission: InventoryPermission,
  portalRole?: PortalRole,
): boolean =>
  hasInventoryScope(employee, scope, portalRole) &&
  hasInventoryPermission(employee, permission, portalRole);
