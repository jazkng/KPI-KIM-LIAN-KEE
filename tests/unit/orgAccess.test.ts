import { describe, expect, it } from 'vitest';
import { PortalRole } from '../../types';
import { getOrgLevel, getPortalRole, getSystemRole, isSystemAdminAccount } from '../../utils/orgAccess';

describe('orgAccess（角色与入口映射）', () => {
  it('从职位推断组织层级', () => {
    expect(getOrgLevel({ role: 'Owner (老板)' } as any)).toBe('OWNER');
    expect(getOrgLevel({ role: 'Accounting 会计' } as any)).toBe('BRANCH_MANAGER');
    expect(getOrgLevel({ role: 'Store Manager' } as any)).toBe('BRANCH_MANAGER');
  });

  it('明确的 orgLevel 优先于职位文字', () => {
    expect(getOrgLevel({ role: 'Owner', orgLevel: 'CREW' } as any)).toBe('CREW');
  });

  it('层级 → 入口：L1/L2 老板界面，L4/L5 员工界面', () => {
    expect(getPortalRole({ role: 'Owner' } as any)).toBe(PortalRole.BOSS);
    expect(getPortalRole({ role: '', orgLevel: 'DEPARTMENT_HEAD' } as any)).toBe(PortalRole.MANAGEMENT);
    expect(getPortalRole({ role: '', orgLevel: 'CREW' } as any)).toBe(PortalRole.STAFF);
    expect(getPortalRole({ role: '', orgLevel: 'TEAM_LEAD' } as any)).toBe(PortalRole.STAFF);
  });

  it('portalRoleOverride 覆盖默认映射', () => {
    expect(getPortalRole({ role: '', orgLevel: 'CREW', portalRoleOverride: PortalRole.MANAGEMENT } as any))
      .toBe(PortalRole.MANAGEMENT);
  });

  it('系统管理员固定为 002', () => {
    expect(isSystemAdminAccount({ id: '002' } as any)).toBe(true);
    expect(isSystemAdminAccount({ id: '001' } as any)).toBe(false);
    expect(getSystemRole({ id: '002' } as any)).toBe('SYSTEM_ADMIN');
    expect(getSystemRole({ id: '010', systemRole: 'SYSTEM_ADMIN' } as any)).toBe('SYSTEM_ADMIN');
    expect(getSystemRole({ id: '010' } as any)).toBe('STANDARD_USER');
  });
});
