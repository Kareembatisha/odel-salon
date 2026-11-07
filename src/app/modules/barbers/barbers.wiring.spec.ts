import { describe, expect, it } from 'vitest';

import { PERMISSIONS } from '@core/auth/permissions';
import { NAV_SECTIONS } from '../../layout/main-layout/nav.config';
import { MAIN_ROUTES } from '../main.routes';
import { BarbersList } from './pages/barbers-list/barbers-list';

describe('Barbers wiring', () => {
  it('routes /main/barbers behind the Barber.View permission guard, with a breadcrumb', () => {
    const route = MAIN_ROUTES.find((r) => r.path === 'barbers');

    expect(route).toBeDefined();
    expect(route!.canActivate).toHaveLength(1);
    expect(route!.data).toEqual({ permission: PERMISSIONS.Barber.View, breadcrumb: 'LAYOUT.NAV.BARBERS' });
    expect(route!.loadComponent).toBeTypeOf('function');
  });

  it('lazy-loads the barbers list page', async () => {
    const route = MAIN_ROUTES.find((r) => r.path === 'barbers')!;
    const component = await (route.loadComponent as () => Promise<unknown>)();
    expect(component).toBe(BarbersList);
  });

  it('adds a sidebar item in the Salon section, guarded by the same permission as the route', () => {
    const salon = NAV_SECTIONS.find((s) => s.id === 'salon')!;
    const item = salon.items.find((i) => i.id === 'barbers');

    expect(item).toMatchObject({
      labelKey: 'LAYOUT.NAV.BARBERS',
      route: '/main/barbers',
      permission: PERMISSIONS.Barber.View,
    });
    expect(item!.icon).toMatch(/^pi pi-/);
  });

  it('sits after Branches and Chairs in the sidebar (Services, Packages and Offers come last)', () => {
    const ids = NAV_SECTIONS.find((s) => s.id === 'salon')!.items.map((i) => i.id);
    expect(ids).toEqual(['branches', 'chairs', 'barbers', 'services', 'packages', 'offers']);
  });
});
