import { describe, expect, it } from 'vitest';

import { PERMISSIONS } from '@core/auth/permissions';
import { NAV_SECTIONS } from '../../layout/main-layout/nav.config';
import { MAIN_ROUTES } from '../main.routes';
import { OffersList } from './pages/offers-list/offers-list';

describe('Offers wiring', () => {
  it('routes /main/offers behind the Offer.View guard, with a breadcrumb', async () => {
    const route = MAIN_ROUTES.find((r) => r.path === 'offers')!;
    expect(route.canActivate).toHaveLength(1);
    expect(route.data).toEqual({ permission: PERMISSIONS.Offer.View, breadcrumb: 'LAYOUT.NAV.OFFERS' });
    expect(await (route.loadComponent as () => Promise<unknown>)()).toBe(OffersList);
  });

  it('adds a sidebar item in the Salon section guarded by the same permission', () => {
    const item = NAV_SECTIONS.find((s) => s.id === 'salon')!.items.find((i) => i.id === 'offers');
    expect(item).toMatchObject({ labelKey: 'LAYOUT.NAV.OFFERS', route: '/main/offers', permission: PERMISSIONS.Offer.View });
    expect(item!.icon).toMatch(/^pi pi-/);
  });
});
