import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Observable, Subject, of } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';

import { ApiResponse } from '@shared/model/api_response.model';
import { AuthService } from '../../../auth/service/auth.service';
import { BranchListItem } from '../../../branches/model/branch.model';
import { BRANCH_REPOSITORY } from '../../../branches/repository/branch.repository';
import { ServiceListItem } from '../../../services/model/service.model';
import { ServicesService } from '../../../services/service/services.service';
import { toServiceOptions } from '../../../services/utils/service-option.util';
import { CreateOfferPayload, OfferDetails, OfferListItem, OfferStatus, OffersQuery, UpdateOfferPayload } from '../../model/offer.model';
import { addDays, cairoToday } from '../../utils/offer-dates.util';
import { OFFER_REPOSITORY } from '../../repository/offer.repository';
import { OffersList } from './offers-list';

const ALL_PERMS = ['Offer.View', 'Offer.Create', 'Offer.Edit', 'Offer.Delete'];

function offer(id: number, over: Partial<OfferListItem> = {}): OfferListItem {
  return {
    id, branchId: 3, nameAr: `عرض ${id}`, nameEn: `Offer ${id}`, imageUrl: null,
    regularPrice: 200, vipPrice: 300, homePrice: null, startDate: '2026-11-01', endDate: null,
    maxBookings: null, bookingsCount: 0, status: OfferStatus.Active, stoppedAt: null,
    services: [{ serviceId: 1, nameAr: 'قص', nameEn: 'Haircut' }],
    originalRegularPrice: 260, originalVipPrice: 390, originalHomePrice: null, savingPercent: 23, ...over,
  };
}

/** Active services of the branch: 1 + 2 cost 230 regular / 390 VIP. */
function serviceRow(id: number, regularPrice: number, vipPrice: number): ServiceListItem {
  return {
    id, nameAr: `خدمة ${id}`, nameEn: `Service ${id}`,
    pricing: { isPriced: true, isActive: true, durationMinutes: 30, regularPrice, vipPrice, isHomeAvailable: false, homePrice: null },
  };
}
const SERVICE_ROWS = [serviceRow(1, 120, 200), serviceRow(2, 110, 190), serviceRow(3, 50, 80)];

function detailsOf(item: OfferListItem): OfferDetails {
  return { ...item, branchNameAr: 'فرع 3', branchNameEn: 'Branch 3', durationMinutes: 60, createdAt: '2026-11-05T11:00:00Z', updatedAt: null };
}

function branch(id: number): BranchListItem {
  return {
    id, nameAr: `فرع ${id}`, nameEn: `Branch ${id}`, address: 'x', phone: '+201001102194',
    allowsRegular: true, allowsVip: true, allowsHome: false, isVisible: true,
    barbersCount: 1, regularChairsCount: 1, vipChairsCount: 1,
  };
}

function ok<T>(data: T): ApiResponse<T> {
  return { status: true, statusCode: 200, message: 'ok', errors: null, meta: null, data };
}

function response(items: OfferListItem[], totalCount = items.length): ApiResponse<OfferListItem[]> {
  return {
    status: true, statusCode: 200, message: 'ok', errors: null, data: items,
    meta: {
      currentPage: 1, pageSize: 12, totalPages: Math.max(1, Math.ceil(totalCount / 12)), totalCount,
      hasPreviousPage: false, hasNextPage: totalCount > 12,
      additionalData: { all: 5, active: 3, scheduled: 1, endedOrFull: 1 },
    },
  };
}

class FakeOfferRepository {
  calls: OffersQuery[] = [];
  pending: Array<Subject<ApiResponse<OfferListItem[]>>> = [];
  toggled: number[] = [];
  deleted: number[][] = [];
  created: CreateOfferPayload[] = [];
  updated: Array<{ id: number; payload: UpdateOfferPayload }> = [];
  /** What GET /offers/{id} answers (status:false = not found). */
  details: ApiResponse<OfferDetails | null> = ok(null as OfferDetails | null);
  /** Answer of every mutation (swap for a Subject to hold one in flight). */
  next: () => Observable<ApiResponse<unknown>> = () => of(ok(null));

  getOffers(q: OffersQuery) {
    this.calls.push(q);
    const s = new Subject<ApiResponse<OfferListItem[]>>();
    this.pending.push(s);
    return s;
  }
  getOfferById() { return of(this.details as ApiResponse<OfferDetails>); }
  createOffer(p: CreateOfferPayload) { this.created.push(p); return of(ok(9)); }
  updateOffer(id: number, payload: UpdateOfferPayload) { this.updated.push({ id, payload }); return of(ok(null)); }
  toggleOfferStatus(id: number) { this.toggled.push(id); return this.next() as Observable<ApiResponse<null>>; }
  deleteOffers(p: { ids: number[] }) { this.deleted.push(p.ids); return this.next() as Observable<ApiResponse<null>>; }

  get last() { return this.pending[this.pending.length - 1]; }
  resolve(res: ApiResponse<OfferListItem[]>) { this.last.next(res); this.last.complete(); }
}

describe('OffersList', () => {
  let repo: FakeOfferRepository;
  let fixture: ComponentFixture<OffersList>;

  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => el().textContent ?? '';
  const cards = () => Array.from(el().querySelectorAll<HTMLElement>('app-offer-card'));
  const tabs = () => Array.from(el().querySelectorAll<HTMLButtonElement>('[role="tab"]'));
  const selectedTab = () => tabs().find((t) => t.getAttribute('aria-selected') === 'true')!;
  const filters = () => Array.from(el().querySelectorAll<HTMLSelectElement>('app-filter-select select'));
  const stopButton = (card: HTMLElement) =>
    Array.from(card.querySelectorAll<HTMLButtonElement>('.offer__footer button')).find((b) => /OFFERS\.(STOP|RESUME)/.test(b.textContent ?? ''));
  const trash = (card: HTMLElement) => card.querySelector<HTMLButtonElement>('button[aria-label="OFFERS.CARD.DELETE_LABEL"]');
  const dialog = () => el().querySelector('[role="alertdialog"]');
  const addButton = () => Array.from(el().querySelectorAll<HTMLButtonElement>('app-page-header button')).find((b) => b.textContent?.includes('OFFERS.NEW'));
  const pencil = (card: HTMLElement) => card.querySelector<HTMLButtonElement>('button[aria-label="OFFERS.CARD.EDIT_LABEL"]');
  const form = () => el().querySelector('app-offer-form');
  const formInput = (label: string) => el().querySelector<HTMLInputElement>(`app-offer-form input[aria-label="${label}"]`)!;
  const checkboxes = () => Array.from(el().querySelectorAll<HTMLInputElement>('app-offer-form .sp__check'));
  const formButtons = () => Array.from(el().querySelectorAll<HTMLButtonElement>('app-offer-form .of__footer button'));
  const confirmButton = () => el().querySelector<HTMLButtonElement>('.dialog__actions app-button:last-child button')!;

  async function settle() {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function setup(perms: string[] = ['Offer.View'], branches: BranchListItem[] = [branch(5), branch(3)]) {
    repo = new FakeOfferRepository();
    const permissions = new Set(perms);
    TestBed.configureTestingModule({
      imports: [OffersList, TranslateModule.forRoot()],
      providers: [
        { provide: OFFER_REPOSITORY, useValue: repo },
        { provide: BRANCH_REPOSITORY, useValue: { getBranches: () => of({ ...ok(branches), meta: null }) } },
        { provide: ServicesService, useValue: { loadServiceOptions: () => of(toServiceOptions(SERVICE_ROWS)) } },
        { provide: AuthService, useValue: { hasPermission: (p: string) => permissions.has(p) } },
      ],
    });
    TestBed.inject(TranslateService).use('en');
    fixture = TestBed.createComponent(OffersList);
    await settle();
  }

  async function setupWithRows(perms: string[], items: OfferListItem[] = [offer(1), offer(2, { status: OfferStatus.Stopped, stoppedAt: '2026-11-02T10:00:00Z' })]) {
    await setup(perms);
    repo.resolve(response(items));
    await settle();
  }

  function pick(select: HTMLSelectElement, value: string) {
    select.value = value;
    select.dispatchEvent(new Event('change'));
  }

  afterEach(() => localStorage.clear());

  describe('loading and data', () => {
    it('loads the FIRST branch (lowest id) on the All tab behind placeholders', async () => {
      await setup();
      expect(repo.calls).toHaveLength(1);
      expect(repo.calls[0]).toEqual({ branchId: 3, pageNumber: 1, pageSize: 12, statuses: undefined });
      expect(el().querySelectorAll('.sk-card').length).toBeGreaterThan(0);
      expect(cards()).toHaveLength(0);
    });

    it('renders one card per offer', async () => {
      await setupWithRows(['Offer.View']);
      expect(cards()).toHaveLength(2);
      expect(el().querySelectorAll('.sk-card')).toHaveLength(0);
      expect(cards()[0].textContent).toContain('Offer 1');
      expect(cards()[1].textContent).toContain('OFFERS.STATUS.STOPPED');
    });

    it('shows the empty state when the branch has no offers and nothing is filtered', async () => {
      await setupWithRows(['Offer.View'], []);
      expect(text()).toContain('OFFERS.EMPTY_TITLE');
      expect(text()).not.toContain('OFFERS.NO_RESULTS_TITLE');
      expect(el().querySelector('app-pagination')).toBeNull();
    });

    it('shows a "no branches" state, and requests nothing, when the salon has no branches', async () => {
      await setup(['Offer.View'], []);
      expect(text()).toContain('OFFERS.NO_BRANCHES_TITLE');
      expect(repo.calls).toHaveLength(0);
      expect(tabs()).toHaveLength(0);
    });

    it('shows the failed state with a working retry when the first load fails', async () => {
      await setup();
      repo.last.error(new Error('boom'));
      await settle();

      expect(el().querySelector('app-failed-state')).not.toBeNull();
      const before = repo.calls.length;
      el().querySelector<HTMLButtonElement>('app-failed-state button')!.click();
      expect(repo.calls.length).toBe(before + 1);
    });

    it('pages through the results', async () => {
      await setup();
      repo.resolve(response(Array.from({ length: 12 }, (_, i) => offer(i + 1)), 30));
      await settle();

      el().querySelector<HTMLButtonElement>('app-pagination button[aria-label="COMMON.NEXT"]')!.click();
      expect(repo.calls[repo.calls.length - 1].pageNumber).toBe(2);
    });
  });

  describe('tabs', () => {
    it('shows the four tabs, All selected, without counts before the first response', async () => {
      await setup();
      expect(tabs().map((t) => t.querySelector('.tabs__label')?.textContent?.trim())).toEqual([
        'OFFERS.TABS.ALL', 'OFFERS.TABS.ACTIVE', 'OFFERS.TABS.SCHEDULED', 'OFFERS.TABS.ENDED_OR_FULL',
      ]);
      expect(selectedTab().textContent).toContain('OFFERS.TABS.ALL');
      expect(el().querySelectorAll('.tabs__count')).toHaveLength(0);
    });

    it('shows the counts of the whole branch once loaded', async () => {
      await setupWithRows(['Offer.View']);
      expect(Array.from(el().querySelectorAll('.tabs__count')).map((c) => c.textContent?.trim())).toEqual(['5', '3', '1', '1']);
    });

    it('names the tab list and points it at its panel', async () => {
      await setupWithRows(['Offer.View']);
      const list = el().querySelector('[role="tablist"]')!;
      expect(list.getAttribute('aria-label')).toBe('OFFERS.TABS.LABEL');

      const panel = el().querySelector('[role="tabpanel"]')!;
      expect(tabs()[0].getAttribute('aria-controls')).toBe(panel.id);
      expect(panel.getAttribute('aria-labelledby')).toBe(selectedTab().id);
    });

    it.each([
      [1, [OfferStatus.Active]],
      [2, [OfferStatus.Scheduled]],
      [3, [OfferStatus.Ended, OfferStatus.LimitReached, OfferStatus.Stopped]],
    ])('tab %i sends its statuses from page 1', async (index, statuses) => {
      await setupWithRows(['Offer.View']);
      tabs()[index].click();
      await settle();

      expect(repo.calls[repo.calls.length - 1]).toMatchObject({ statuses, pageNumber: 1 });
      expect(selectedTab()).toBe(tabs()[index]);
    });

    it('returning to All drops the statuses filter', async () => {
      await setupWithRows(['Offer.View']);
      tabs()[1].click();
      await settle();
      tabs()[0].click();
      await settle();

      expect(repo.calls[repo.calls.length - 1].statuses).toBeUndefined();
    });

    it('keeps the real counts on the tabs while a tab shows no rows', async () => {
      await setupWithRows(['Offer.View']);
      tabs()[2].click();
      repo.resolve(response([], 0));
      await settle();

      expect(text()).toContain('OFFERS.NO_RESULTS_TITLE');
      expect(text()).not.toContain('OFFERS.EMPTY_TITLE');
      expect(Array.from(el().querySelectorAll('.tabs__count')).map((c) => c.textContent?.trim())).toEqual(['5', '3', '1', '1']);
    });
  });

  describe('filters', () => {
    it('offers every branch (no "All"), oldest first, with the first one selected', async () => {
      await setupWithRows(['Offer.View']);
      const select = filters()[0];
      expect(Array.from(select.options).map((o) => o.value)).toEqual(['3', '5']);
      expect(select.value).toBe('3');
    });

    it('switching branch sends the new branchId, keeps the tab and clears the old cards', async () => {
      await setupWithRows(['Offer.View']);
      tabs()[1].click();
      await settle();
      pick(filters()[0], '5');
      await settle();

      expect(repo.calls[repo.calls.length - 1]).toMatchObject({ branchId: 5, pageNumber: 1, statuses: [OfferStatus.Active] });
      expect(cards()).toHaveLength(0);
    });

    it('sends the search term on Enter and keeps the tab', async () => {
      await setupWithRows(['Offer.View']);
      tabs()[3].click();
      await settle();
      const input = el().querySelector<HTMLInputElement>('app-search-input input')!;
      input.value = 'weekend';
      input.dispatchEvent(new Event('input'));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

      expect(repo.calls[repo.calls.length - 1]).toMatchObject({ search: 'weekend', statuses: [OfferStatus.Ended, OfferStatus.LimitReached, OfferStatus.Stopped] });
    });

    it('shows "no results" (not "no offers yet") when a search returns nothing', async () => {
      await setupWithRows(['Offer.View']);
      const input = el().querySelector<HTMLInputElement>('app-search-input input')!;
      input.value = 'zzz';
      input.dispatchEvent(new Event('input'));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      repo.resolve(response([], 0));
      await settle();

      expect(text()).toContain('OFFERS.NO_RESULTS_TITLE');
    });
  });

  describe('accessibility', () => {
    const liveRegion = () => el().querySelector<HTMLElement>('[role="status"][aria-live="polite"]')!;
    const panel = () => el().querySelector<HTMLElement>('[role="tabpanel"]')!;

    it('announces how many offers are shown once a load finishes, and nothing while loading', async () => {
      await setup();
      expect(liveRegion().textContent!.trim()).toBe('');

      repo.resolve(response([offer(1), offer(2)], 2));
      await settle();
      expect(liveRegion().textContent).toContain('OFFERS.RESULTS');
      expect(liveRegion().textContent).not.toContain('OFFERS.RESULTS_NONE');
    });

    it('announces an empty result, and goes quiet again while the next load runs', async () => {
      await setupWithRows(['Offer.View']);
      tabs()[1].click();
      await settle();
      expect(liveRegion().textContent!.trim()).toBe('');

      repo.resolve(response([], 0));
      await settle();
      expect(liveRegion().textContent).toContain('OFFERS.RESULTS_NONE');
    });

    it('does not announce a failed load as a result', async () => {
      await setupWithRows(['Offer.View']);
      el().querySelector<HTMLElement>('app-tabs [role="tab"]:nth-child(2)')!.click();
      await settle();
      repo.last.error(new Error('boom'));
      await settle();
      expect(liveRegion().textContent!.trim()).toBe('');
    });

    it('the tab panel can take programmatic focus (not a tab stop)', async () => {
      await setupWithRows(['Offer.View']);
      expect(panel().getAttribute('tabindex')).toBe('-1');
    });

    it('keeps focus on the page when stopping an offer removes its card from the tab', async () => {
      await setupWithRows(ALL_PERMS);
      tabs()[1].click(); // Active
      await settle();
      repo.resolve(response([offer(1)]));
      await settle();

      const button = stopButton(cards()[0])!;
      button.focus();
      expect(document.activeElement).toBe(button);

      button.click();
      await settle();
      repo.resolve(response([])); // the reload no longer has the stopped offer
      await settle();
      await new Promise((r) => setTimeout(r, 20));
      await settle();

      expect(cards()).toHaveLength(0);
      expect(document.activeElement).toBe(panel());
    });

    it('leaves focus alone when the card is still there after the reload', async () => {
      await setupWithRows(ALL_PERMS);
      const button = stopButton(cards()[0])!;
      button.focus();

      button.click();
      await settle();
      repo.resolve(response([offer(1), offer(2)]));
      await settle();
      await new Promise((r) => setTimeout(r, 20));
      await settle();

      expect(document.activeElement).not.toBe(panel());
      expect(el().contains(document.activeElement)).toBe(true);
    });
  });

  describe('permissions', () => {
    it('View only: read-only cards', async () => {
      await setupWithRows(['Offer.View']);
      expect(stopButton(cards()[0])).toBeUndefined();
      expect(trash(cards()[0])).toBeNull();
    });

    it('Edit gives Stop / Resume, Delete gives the trash button', async () => {
      await setupWithRows(['Offer.View', 'Offer.Edit']);
      expect(stopButton(cards()[0])).toBeDefined();
      expect(trash(cards()[0])).toBeNull();

      fixture.destroy();
      TestBed.resetTestingModule();
      await setupWithRows(['Offer.View', 'Offer.Delete']);
      expect(stopButton(cards()[0])).toBeUndefined();
      expect(trash(cards()[0])).not.toBeNull();
    });

    it('shows "Add offer" only with Offer.Create, and the edit pencil only with Offer.Edit', async () => {
      await setupWithRows(['Offer.View']);
      expect(addButton()).toBeUndefined();
      expect(pencil(cards()[0])).toBeNull();

      fixture.destroy();
      TestBed.resetTestingModule();
      await setupWithRows(['Offer.View', 'Offer.Create']);
      expect(addButton()).toBeDefined();
      expect(pencil(cards()[0])).toBeNull();

      fixture.destroy();
      TestBed.resetTestingModule();
      await setupWithRows(['Offer.View', 'Offer.Edit']);
      expect(addButton()).toBeUndefined();
      expect(pencil(cards()[0])).not.toBeNull();
    });
  });

  describe('stop / resume', () => {
    it('stops a running offer and reloads the branch (the counts change)', async () => {
      await setupWithRows(ALL_PERMS);
      const before = repo.calls.length;
      expect(stopButton(cards()[0])!.textContent).toContain('OFFERS.STOP');

      stopButton(cards()[0])!.click();
      await settle();

      expect(repo.toggled).toEqual([1]);
      expect(repo.calls.length).toBe(before + 1);
    });

    it('a stopped offer offers Resume', async () => {
      await setupWithRows(ALL_PERMS);
      expect(stopButton(cards()[1])!.textContent).toContain('OFFERS.RESUME');

      stopButton(cards()[1])!.click();
      await settle();
      expect(repo.toggled).toEqual([2]);
    });

    it('hides the button on an ended offer', async () => {
      await setupWithRows(ALL_PERMS, [offer(1, { status: OfferStatus.Ended })]);
      expect(stopButton(cards()[0])).toBeUndefined();
    });

    it('keeps the cards on screen while the reload is in flight (no placeholder flash)', async () => {
      await setupWithRows(ALL_PERMS);
      stopButton(cards()[0])!.click();
      await settle();

      expect(cards()).toHaveLength(2);
      expect(el().querySelectorAll('.sk-card')).toHaveLength(0);
    });

    it('ignores a second click while the first request is in flight', async () => {
      await setupWithRows(ALL_PERMS);
      const held = new Subject<ApiResponse<unknown>>();
      repo.next = () => held;

      stopButton(cards()[0])!.click();
      await settle();
      stopButton(cards()[1])!.click();
      await settle();

      expect(repo.toggled).toEqual([1]);
    });
  });

  describe('create / edit drawer', () => {
    async function type(label: string, value: string) {
      const input = formInput(label);
      input.value = value;
      input.dispatchEvent(new Event('input'));
      input.dispatchEvent(new Event('blur'));
      await settle();
    }

    it('create: opens the form for the selected branch with its active services, and cancel closes it', async () => {
      await setupWithRows(ALL_PERMS);
      addButton()!.click();
      await settle();

      expect(form()).not.toBeNull();
      expect(form()!.textContent).toContain('Branch 3');
      expect(checkboxes()).toHaveLength(3);
      expect(formInput('OFFERS.FORM.START_DATE').value).toBe(cairoToday());

      formButtons()[0].click(); // Cancel
      await settle();
      expect(form()).toBeNull();
      expect(repo.created).toHaveLength(0);
    });

    it('create: submits the new offer for the selected branch, closes the drawer and reloads', async () => {
      await setupWithRows(ALL_PERMS);
      const before = repo.calls.length;

      addButton()!.click();
      await settle();
      await type('OFFERS.FORM.NAME_AR', 'عرض جديد');
      await type('OFFERS.FORM.NAME_EN', 'Brand New');
      checkboxes()[0].click();
      checkboxes()[1].click();
      await settle();
      await type('OFFERS.FORM.REGULAR_PRICE', '200');
      await type('OFFERS.FORM.VIP_PRICE', '340');
      await type('OFFERS.FORM.MAX_BOOKINGS', '25');
      formButtons()[1].click(); // submit
      await settle();

      expect(repo.created).toEqual([
        {
          branchId: 3, nameAr: 'عرض جديد', nameEn: 'Brand New', serviceIds: [1, 2], regularPrice: 200, vipPrice: 340,
          homePrice: null, startDate: cairoToday(), endDate: null, maxBookings: 25, image: null,
        },
      ]);
      expect(form()).toBeNull();
      expect(repo.calls.length).toBe(before + 1);
    });

    it('create: the drawer stays open when the server refuses the offer', async () => {
      await setupWithRows(ALL_PERMS);
      repo.createOffer = () => of({ ...ok(0), status: false, statusCode: 400 });

      addButton()!.click();
      await settle();
      await type('OFFERS.FORM.NAME_AR', 'ع');
      await type('OFFERS.FORM.NAME_EN', 'x');
      checkboxes()[0].click();
      await settle();
      await type('OFFERS.FORM.REGULAR_PRICE', '100');
      await type('OFFERS.FORM.VIP_PRICE', '150');
      formButtons()[1].click();
      await settle();

      expect(form()).not.toBeNull();
    });

    it('edit: opens the form pre-filled from the loaded offer', async () => {
      await setupWithRows(ALL_PERMS);
      repo.details = ok(detailsOf(offer(1, { endDate: addDays(cairoToday(), 9), maxBookings: 40 })));

      pencil(cards()[0])!.click();
      await settle();

      expect(formInput('OFFERS.FORM.NAME_EN').value).toBe('Offer 1');
      expect(formInput('OFFERS.FORM.REGULAR_PRICE').value).toBe('200');
      expect(formInput('OFFERS.FORM.END_DATE').value).toBe(addDays(cairoToday(), 9));
      expect(formInput('OFFERS.FORM.MAX_BOOKINGS').value).toBe('40');
      expect(checkboxes().map((c) => c.checked)).toEqual([true, false, false]);
    });

    it('edit: saves the changes, closes the drawer and reloads', async () => {
      await setupWithRows(ALL_PERMS);
      // Prices must stay below the chosen service's total (Service 1: 120 / 200).
      repo.details = ok(detailsOf(offer(1, { regularPrice: 100, vipPrice: 150 })));
      const before = repo.calls.length;

      pencil(cards()[0])!.click();
      await settle();
      await type('OFFERS.FORM.NAME_EN', 'Renamed');
      formButtons()[1].click();
      await settle();

      expect(repo.updated).toHaveLength(1);
      expect(repo.updated[0]).toMatchObject({ id: 1, payload: { nameEn: 'Renamed', serviceIds: [1], regularPrice: 100, vipPrice: 150, removeImage: false } });
      expect(form()).toBeNull();
      expect(repo.calls.length).toBe(before + 1);
    });

    it('edit: opens nothing when the offer can no longer be loaded', async () => {
      await setupWithRows(ALL_PERMS);
      repo.details = { ...ok(null as OfferDetails | null), status: false, statusCode: 404 };

      pencil(cards()[0])!.click();
      await settle();

      expect(form()).toBeNull();
    });

    it('edit: the name opens the same drawer', async () => {
      await setupWithRows(ALL_PERMS);
      repo.details = ok(detailsOf(offer(1)));

      cards()[0].querySelector<HTMLButtonElement>('.offer__link')!.click();
      await settle();

      expect(form()).not.toBeNull();
    });
  });

  describe('delete', () => {
    it('asks first, then deletes and reloads', async () => {
      await setupWithRows(ALL_PERMS);
      const before = repo.calls.length;

      trash(cards()[0])!.click();
      await settle();
      expect(dialog()).not.toBeNull();
      expect(text()).toContain('OFFERS.DELETE.TITLE_ONE');
      expect(repo.deleted).toEqual([]);

      confirmButton().click();
      await settle();

      expect(repo.deleted).toEqual([[1]]);
      expect(repo.calls.length).toBe(before + 1);
      expect(dialog()).toBeNull();
    });

    it('cancel deletes nothing', async () => {
      await setupWithRows(ALL_PERMS);
      trash(cards()[0])!.click();
      await settle();

      el().querySelector<HTMLButtonElement>('.dialog__actions app-button:first-child button')!.click();
      await settle();

      expect(repo.deleted).toEqual([]);
      expect(dialog()).toBeNull();
    });
  });
});
