import { describe, expect, it } from 'vitest';

import { PERMISSIONS } from '@core/auth/permissions';
import { NAV_SECTIONS } from '../../layout/main-layout/nav.config';
import { MAIN_ROUTES } from '../main.routes';
import { ServicesForm } from './pages/services-form/services-form';
import { ServicesList } from './pages/services-list/services-list';

describe('Services wiring', () => {
  it('routes /main/services behind the Service.View guard, with a breadcrumb', async () => {
    const route = MAIN_ROUTES.find((r) => r.path === 'services')!;
    expect(route.canActivate).toHaveLength(1);
    expect(route.data).toEqual({ permission: PERMISSIONS.Service.View, breadcrumb: 'LAYOUT.NAV.SERVICES' });
    expect(await (route.loadComponent as () => Promise<unknown>)()).toBe(ServicesList);
  });

  it('adds a sidebar item in the Salon section guarded by the same permission', () => {
    const item = NAV_SECTIONS.find((s) => s.id === 'salon')!.items.find((i) => i.id === 'services');
    expect(item).toMatchObject({ labelKey: 'LAYOUT.NAV.SERVICES', route: '/main/services', permission: PERMISSIONS.Service.View });
  });
  it('routes the create and edit pages behind their own permissions', async () => {
    const create = MAIN_ROUTES.find((r) => r.path === 'services/new')!;
    const edit = MAIN_ROUTES.find((r) => r.path === 'services/:id/edit')!;
    expect(create.data).toMatchObject({ permission: PERMISSIONS.Service.Create });
    expect(edit.data).toMatchObject({ permission: PERMISSIONS.Service.Edit });
    for (const route of [create, edit]) {
      expect(route.canActivate).toHaveLength(1);
      expect(await (route.loadComponent as () => Promise<unknown>)()).toBe(ServicesForm);
    }
  });
});
