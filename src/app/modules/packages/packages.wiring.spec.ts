import { describe, expect, it } from 'vitest';

import { PERMISSIONS } from '@core/auth/permissions';
import { NAV_SECTIONS } from '../../layout/main-layout/nav.config';
import { MAIN_ROUTES } from '../main.routes';
import { PackagesList } from './pages/packages-list/packages-list';

describe('Packages wiring', () => {
  it('routes /main/packages behind the Package.View guard, with a breadcrumb', async () => {
    const route = MAIN_ROUTES.find((r) => r.path === 'packages')!;
    expect(route.canActivate).toHaveLength(1);
    expect(route.data).toEqual({ permission: PERMISSIONS.Package.View, breadcrumb: 'LAYOUT.NAV.PACKAGES' });
    expect(await (route.loadComponent as () => Promise<unknown>)()).toBe(PackagesList);
  });

  it('adds a sidebar item in the Salon section guarded by the same permission', () => {
    const item = NAV_SECTIONS.find((s) => s.id === 'salon')!.items.find((i) => i.id === 'packages');
    expect(item).toMatchObject({ labelKey: 'LAYOUT.NAV.PACKAGES', route: '/main/packages', permission: PERMISSIONS.Package.View });
    expect(item!.icon).toMatch(/^pi pi-/);
  });
});
