import {
  Employee,
  EmployeeRank,
  OrgLevel,
  PortalRole,
  SystemRole,
} from '../types';

export const SYSTEM_ADMIN_EMPLOYEE_ID = '002';

export const ORG_LEVEL_OPTIONS: Array<{
  value: OrgLevel;
  label: string;
  shortLabel: string;
}> = [
  { value: 'OWNER', label: 'L1 老板／决策层 (Owner)', shortLabel: 'L1 老板' },
  { value: 'BRANCH_MANAGER', label: 'L2 门店管理层 (Branch Manager)', shortLabel: 'L2 门店管理' },
  { value: 'DEPARTMENT_HEAD', label: 'L3 部门负责人 (Department Head)', shortLabel: 'L3 部门负责人' },
  { value: 'TEAM_LEAD', label: 'L4 组长／当班负责人 (Team Lead)', shortLabel: 'L4 组长／PIC' },
  { value: 'CREW', label: 'L5 执行员工 (Crew)', shortLabel: 'L5 员工' },
];

export const PORTAL_ROLE_OPTIONS: Array<{
  value: PortalRole;
  label: string;
}> = [
  { value: PortalRole.BOSS, label: '老板页面 (Boss Dashboard)' },
  { value: PortalRole.MANAGEMENT, label: '管理层页面 (Management Dashboard)' },
  { value: PortalRole.STAFF, label: '员工页面 (Staff Dashboard)' },
];

type OrgIdentity = Pick<Employee, 'orgLevel' | 'rank' | 'role'>;
type PortalIdentity = Pick<Employee, 'orgLevel' | 'rank' | 'role' | 'portalRoleOverride'>;
type SystemIdentity = Pick<Employee, 'id' | 'systemRole'>;

const ORG_LEVELS = new Set<OrgLevel>(ORG_LEVEL_OPTIONS.map(option => option.value));

const inferOrgLevelFromRole = (role = ''): OrgLevel => {
  const normalized = role.trim().toLowerCase();

  if (normalized.includes('owner') || normalized.includes('老板')) return 'OWNER';

  if (
    normalized.includes('store manager') ||
    normalized.includes('门店经理') ||
    normalized.includes('店长')
  ) {
    return 'BRANCH_MANAGER';
  }

  if (
    normalized.includes('operations supervisor') ||
    normalized.includes('运营主管') ||
    normalized.includes('executive chef') ||
    normalized.includes('行政总厨') ||
    normalized.includes('head chef') ||
    normalized.includes('头手') ||
    normalized.includes('hr management') ||
    normalized.includes('人事管理') ||
    normalized.includes('store management') ||
    normalized.includes('店面管理') ||
    normalized.includes('department head') ||
    normalized.includes('部门主管') ||
    normalized.includes('经理') ||
    normalized.includes('主管')
  ) {
    return 'DEPARTMENT_HEAD';
  }

  if (
    normalized.includes('captain') ||
    normalized.includes('领班') ||
    normalized.includes('team lead') ||
    normalized.includes('组长') ||
    normalized.includes('pic') ||
    normalized.includes('负责人') ||
    normalized.includes('当班')
  ) {
    return 'TEAM_LEAD';
  }

  return 'CREW';
};

/**
 * Returns the official five-level organization level.
 * Old TOP / MANAGEMENT / HEAD / PIC / CREW values remain readable during migration.
 */
export const getOrgLevel = (employee: OrgIdentity): OrgLevel => {
  if (employee.orgLevel && ORG_LEVELS.has(employee.orgLevel)) {
    return employee.orgLevel;
  }

  const legacyRank = employee.rank as EmployeeRank | undefined;
  switch (legacyRank) {
    case 'TOP':
      return 'OWNER';
    case 'MANAGEMENT':
      return inferOrgLevelFromRole(employee.role) === 'BRANCH_MANAGER'
        ? 'BRANCH_MANAGER'
        : 'DEPARTMENT_HEAD';
    case 'HEAD':
      return 'DEPARTMENT_HEAD';
    case 'PIC':
      return 'TEAM_LEAD';
    case 'CREW':
      return inferOrgLevelFromRole(employee.role);
    default:
      return inferOrgLevelFromRole(employee.role);
  }
};

/**
 * Default portal mapping agreed for the restaurant:
 * L1 → Boss, L2–L3 → Management, L4–L5 → Staff.
 * A SYSTEM_ADMIN may save portalRoleOverride for genuine exceptions.
 */
export const getPortalRole = (employee: PortalIdentity): PortalRole => {
  if (employee.portalRoleOverride) return employee.portalRoleOverride;

  switch (getOrgLevel(employee)) {
    case 'OWNER':
      return PortalRole.BOSS;
    case 'BRANCH_MANAGER':
    case 'DEPARTMENT_HEAD':
      return PortalRole.MANAGEMENT;
    case 'TEAM_LEAD':
    case 'CREW':
    default:
      return PortalRole.STAFF;
  }
};

export const getSystemRole = (employee: SystemIdentity): SystemRole => {
  if (employee.id === SYSTEM_ADMIN_EMPLOYEE_ID) return 'SYSTEM_ADMIN';
  return employee.systemRole === 'SYSTEM_ADMIN' ? 'SYSTEM_ADMIN' : 'STANDARD_USER';
};

export const isSystemAdminAccount = (
  employee?: SystemIdentity | null,
): boolean => {
  return !!employee && employee.id === SYSTEM_ADMIN_EMPLOYEE_ID;
};

export const getOrgLevelLabel = (employeeOrLevel: OrgIdentity | OrgLevel): string => {
  const level = typeof employeeOrLevel === 'string'
    ? employeeOrLevel
    : getOrgLevel(employeeOrLevel);
  return ORG_LEVEL_OPTIONS.find(option => option.value === level)?.shortLabel || level;
};

/** Adds normalized fields without deleting legacy rank during the migration period. */
export const normalizeEmployeeOrgFields = <T extends Employee>(employee: T): T => {
  return {
    ...employee,
    orgLevel: getOrgLevel(employee),
    systemRole: getSystemRole(employee),
  };
};
