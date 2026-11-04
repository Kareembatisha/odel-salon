import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Observable, Subject, of } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';

import { ApiResponse } from '@shared/model/api_response.model';
import { BranchListItem } from '../../../branches/model/branch.model';
import { BRANCH_REPOSITORY } from '../../../branches/repository/branch.repository';
import { AuthService } from '../../../auth/service/auth.service';
import {
  ChairDetails,
  ChairListItem,
  ChairType,
  ChairsQuery,
  CreateChairPayload,
  UpdateChairPayload,
} from '../../model/chair.model';
import { CHAIR_REPOSITORY } from '../../repository/chair.repository';
import { ChairsList } from './chairs-list';

const ALL_PERMS = ['Chair.View', 'Chair.Create', 'Chair.Edit', 'Chair.ToggleStatus', 'Chair.Delete'];

function chair(id: number, over: Partial<ChairListItem> = {}): ChairListItem {
  return {
    id, branchId: 3, branchNameAr: 'مدينة نصر', branchNameEn: 'Nasr City',
    name: `C${id}`, type: ChairType.Regular, isActive: true, ...over,
  };
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

function response(items: ChairListItem[], totalCount = items.length): ApiResponse<ChairListItem[]> {
  return {
    status: true, statusCode: 200, message: 'ok', errors: null, data: items,
    meta: {
      currentPage: 1, pageSize: 12, totalPages: Math.max(1, Math.ceil(totalCount / 12)), totalCount,
      hasPreviousPage: false, hasNextPage: totalCount > 12,
      additionalData: { regularActive: 3, vipActive: 2, inactive: 1 },
    },
  };
}

class FakeChairRepository {
  calls: ChairsQuery[] = [];
  pending: Array<Subject<ApiResponse<ChairListItem[]>>> = [];
  toggled: number[] = [];
  deleted: number[][] = [];
  updated: Array<[number, UpdateChairPayload]> = [];
  created: CreateChairPayload[] = [];
  fetched: number[] = [];
  /** Answer of every mutation (swap for a Subject to hold one in flight). */
  next: () => Observable<ApiResponse<unknown>> = () => of(ok(null));

  getChairs(q: ChairsQuery): Observable<ApiResponse<ChairListItem[]>> {
    this.calls.push(q);
    const s = new Subject<ApiResponse<ChairListItem[]>>();
    this.pending.push(s);
    return s;
  }
  getChairById(id: number): Observable<ApiResponse<ChairDetails>> {
    this.fetched.push(id);
    return of(ok<ChairDetails>({ ...chair(id), createdAt: '2026-11-02T14:20:11Z', updatedAt: null }));
  }
  createChair(p: CreateChairPayload) { this.created.push(p); return of(ok(14)); }
  updateChair(id: number, p: UpdateChairPayload) { this.updated.push([id, p]); return this.next() as Observable<ApiResponse<null>>; }
  toggleChairStatus(id: number) { this.toggled.push(id); return this.next() as Observable<ApiResponse<null>>; }
  deleteChairs(p: { ids: number[] }) { this.deleted.push(p.ids); return this.next() as Observable<ApiResponse<null>>; }

  get last() { return this.pending[this.pending.length - 1]; }
  resolve(res: ApiResponse<ChairListItem[]>) { this.last.next(res); this.last.complete(); }
}

describe('ChairsList', () => {
  let repo: FakeChairRepository;
  let fixture: ComponentFixture<ChairsList>;

  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => el().textContent ?? '';
  const cards = () => Array.from(el().querySelectorAll<HTMLElement>('app-chair-card'));
  const stats = () => Array.from(el().querySelectorAll('app-stat-card'));
  const filters = () => Array.from(el().querySelectorAll<HTMLSelectElement>('app-filter-select select'));
  const cardButton = (card: HTMLElement, label: string) => card.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  const changeTypeButton = (card: HTMLElement) =>
    Array.from(card.querySelectorAll<HTMLButtonElement>('button')).find((b) => (b.textContent ?? '').includes('CHAIRS.CHANGE_TYPE.ACTION'));
  const cardSwitch = (card: HTMLElement) => card.querySelector<HTMLButtonElement>('app-switch button');
  const addButton = () => el().querySelector<HTMLButtonElement>('app-page-header app-button button');
  const dialog = () => el().querySelector('[role="alertdialog"]');
  const confirmButton = () => el().querySelector<HTMLButtonElement>('.dialog__actions app-button:last-child button')!;
  const drawer = () => el().querySelector('aside.dr');

  async function settle() {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function setup(perms: string[] = ['Chair.View']) {
    repo = new FakeChairRepository();
    const permissions = new Set(perms);
    TestBed.configureTestingModule({
      imports: [ChairsList, TranslateModule.forRoot()],
      providers: [
        { provide: CHAIR_REPOSITORY, useValue: repo },
        {
          provide: BRANCH_REPOSITORY,
          useValue: { getBranches: () => of({ ...ok([branch(3), branch(5)]), meta: null }) },
        },
        { provide: AuthService, useValue: { hasPermission: (p: string) => permissions.has(p) } },
      ],
    });
    TestBed.inject(TranslateService).use('en');
    fixture = TestBed.createComponent(ChairsList);
    await settle();
  }

  /** Setup + answer the first list request so cards are on screen. */
  async function setupWithRows(perms: string[], items: ChairListItem[] = [chair(1), chair(2, { type: ChairType.Vip, isActive: false })]) {
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
    it('requests page 1 (12 cards) with no filters and shows placeholders while loading', async () => {
      await setup();
      expect(repo.calls).toHaveLength(1);
      expect(repo.calls[0]).toEqual({ pageNumber: 1, pageSize: 12 });
      expect(el().querySelector('.stats[aria-busy="true"]')).not.toBeNull();
      expect(el().querySelectorAll('.sk-card').length).toBeGreaterThan(0);
      expect(cards()).toHaveLength(0);
      expect(stats()).toHaveLength(0);
    });

    it('renders one card per chair with name, branch, type and status', async () => {
      await setupWithRows(['Chair.View']);

      expect(cards()).toHaveLength(2);
      expect(el().querySelectorAll('.sk-card')).toHaveLength(0);

      const first = cards()[0].textContent ?? '';
      expect(first).toContain('C1');
      expect(first).toContain('Nasr City');
      expect(first).toContain('CHAIRS.TYPE.REGULAR');
      expect(first).toContain('CHAIRS.STATUS.ACTIVE');

      const second = cards()[1].textContent ?? '';
      expect(second).toContain('CHAIRS.TYPE.VIP');
      expect(second).toContain('CHAIRS.STATUS.INACTIVE');
    });

    it('shows the three summary cards from meta.additionalData', async () => {
      await setupWithRows(['Chair.View']);

      expect(el().querySelector('.stats[aria-busy="true"]')).toBeNull();
      expect(stats().map((s) => s.querySelector('.stat__value')?.textContent?.trim())).toEqual(['3', '2', '1']);
    });

    it('shows the empty state when there are no chairs and no filter', async () => {
      await setupWithRows(['Chair.View'], []);
      expect(text()).toContain('CHAIRS.EMPTY_TITLE');
      expect(text()).not.toContain('CHAIRS.NO_RESULTS_TITLE');
      expect(el().querySelector('app-pagination')).toBeNull();
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

    it('keeps the cards on screen while a reload is in flight (no placeholder flash)', async () => {
      await setupWithRows(ALL_PERMS);
      cardSwitch(cards()[0])!.click(); // toggling reloads the list; its response is still pending
      await settle();

      expect(cards()).toHaveLength(2);
      expect(el().querySelectorAll('.sk-card')).toHaveLength(0);
    });

    it('pages through the results', async () => {
      await setup(['Chair.View']);
      repo.resolve(response(Array.from({ length: 12 }, (_, i) => chair(i + 1)), 30)); // 30 chairs → 3 pages
      await settle();

      el().querySelector<HTMLButtonElement>('app-pagination button[aria-label="COMMON.NEXT"]')!.click();
      expect(repo.calls[repo.calls.length - 1].pageNumber).toBe(2);
    });
  });

  describe('filters', () => {
    it('offers every loaded branch in the branch filter', async () => {
      await setupWithRows(['Chair.View']);
      expect(Array.from(filters()[0].options).map((o) => o.value)).toEqual(['', '3', '5']);
    });

    it('sends branchId as a number and goes back to page 1', async () => {
      await setupWithRows(['Chair.View']);
      pick(filters()[0], '3');
      expect(repo.calls[repo.calls.length - 1]).toMatchObject({ pageNumber: 1, branchId: 3 });
    });

    it('sends type=0 for "Regular" — 0 is a real filter', async () => {
      await setupWithRows(['Chair.View']);
      pick(filters()[1], '0');
      expect(repo.calls[repo.calls.length - 1].type).toBe(0);
    });

    it('sends isActive=false for "Inactive" and clears it again with "All"', async () => {
      await setupWithRows(['Chair.View']);
      pick(filters()[2], 'false');
      expect(repo.calls[repo.calls.length - 1].isActive).toBe(false);

      pick(filters()[2], '');
      expect(repo.calls[repo.calls.length - 1].isActive).toBeUndefined();
    });

    it('sends the search term on Enter', async () => {
      await setupWithRows(['Chair.View']);
      const input = el().querySelector<HTMLInputElement>('app-search-input input')!;
      input.value = 'V';
      input.dispatchEvent(new Event('input'));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

      expect(repo.calls[repo.calls.length - 1].search).toBe('V');
    });

    it('shows "no results" (not "no chairs yet") when a filter returns nothing', async () => {
      await setupWithRows(['Chair.View']);
      pick(filters()[1], '1');
      repo.resolve(response([], 0));
      await settle();

      expect(text()).toContain('CHAIRS.NO_RESULTS_TITLE');
      expect(text()).not.toContain('CHAIRS.EMPTY_TITLE');
      expect(cards()).toHaveLength(0);
    });
  });

  describe('permissions', () => {
    it('a view-only user sees plain cards: no add button, switch or actions', async () => {
      await setupWithRows(['Chair.View']);

      expect(addButton()).toBeNull();
      expect(el().querySelector('app-switch')).toBeNull();
      expect(el().querySelector('.chair__footer')).toBeNull();
      expect(el().querySelector('.chair__link')).toBeNull();
      expect(changeTypeButton(cards()[0])).toBeUndefined();
    });

    it('ToggleStatus alone shows the switch on every card but no edit / delete', async () => {
      await setupWithRows(['Chair.View', 'Chair.ToggleStatus']);

      expect(cards().every((c) => cardSwitch(c) !== null)).toBe(true);
      expect(cardButton(cards()[0], 'COMMON.EDIT')).toBeNull();
      expect(cardButton(cards()[0], 'COMMON.DELETE')).toBeNull();
    });

    it('a full-permission user sees every control', async () => {
      await setupWithRows(ALL_PERMS);

      expect(addButton()).not.toBeNull();
      expect(cardSwitch(cards()[0])).not.toBeNull();
      expect(cardButton(cards()[0], 'COMMON.EDIT')).not.toBeNull();
      expect(cardButton(cards()[0], 'COMMON.DELETE')).not.toBeNull();
      expect(changeTypeButton(cards()[0])).toBeDefined();
    });

    it('a view-only user cannot open the edit drawer', async () => {
      await setupWithRows(['Chair.View']);
      cards()[0].querySelector<HTMLElement>('.chair__name')!.click();
      await settle();

      expect(drawer()).toBeNull();
      expect(repo.fetched).toEqual([]);
    });
  });

  describe('availability switch', () => {
    it('shows each chair\'s state', async () => {
      await setupWithRows(ALL_PERMS);
      expect(cardSwitch(cards()[0])!.getAttribute('aria-checked')).toBe('true');
      expect(cardSwitch(cards()[1])!.getAttribute('aria-checked')).toBe('false');
    });

    it('toggles the clicked chair only', async () => {
      await setupWithRows(ALL_PERMS);
      cardSwitch(cards()[1])!.click();

      expect(repo.toggled).toEqual([2]);
    });

    it('does not open the edit drawer or a dialog', async () => {
      await setupWithRows(ALL_PERMS);
      cardSwitch(cards()[0])!.click();
      await settle();

      expect(drawer()).toBeNull();
      expect(dialog()).toBeNull();
    });

    it('reloads the list afterwards so the summary cards refresh', async () => {
      await setupWithRows(ALL_PERMS);
      const before = repo.calls.length;
      cardSwitch(cards()[0])!.click();

      expect(repo.calls.length).toBe(before + 1);
    });

    it('disables every switch while a mutation is in flight', async () => {
      await setupWithRows(ALL_PERMS);
      repo.next = () => new Subject<ApiResponse<null>>();
      cardSwitch(cards()[0])!.click();
      await settle();

      expect(cards().every((c) => cardSwitch(c)!.disabled)).toBe(true);
    });
  });

  describe('create and edit drawer', () => {
    it('opens an empty create form from the header button', async () => {
      await setupWithRows(ALL_PERMS);
      addButton()!.click();
      await settle();

      expect(drawer()).not.toBeNull();
      expect(text()).toContain('CHAIRS.FORM.CREATE_TITLE');
      expect(el().querySelector('app-chair-form')).not.toBeNull();
    });

    it('pre-selects the branch currently filtered on', async () => {
      await setupWithRows(ALL_PERMS);
      pick(filters()[0], '5');
      repo.resolve(response([chair(1)]));
      await settle();

      addButton()!.click();
      await settle();

      const branchSelect = el().querySelector<HTMLSelectElement>('app-chair-form app-float-label-select select')!;
      expect(branchSelect.value).toBe('5');
    });

    it('creates a chair, closes the drawer and reloads the list', async () => {
      await setupWithRows(ALL_PERMS);
      addButton()!.click();
      await settle();

      pick(el().querySelector<HTMLSelectElement>('app-chair-form app-float-label-select select')!, '3');
      const name = el().querySelector<HTMLInputElement>('app-chair-form app-float-label-input input')!;
      name.value = 'R9';
      name.dispatchEvent(new Event('input'));

      const before = repo.calls.length;
      el().querySelector('app-chair-form form')!.dispatchEvent(new Event('submit'));
      await settle();

      expect(repo.created).toEqual([{ branchId: 3, name: 'R9', type: ChairType.Regular }]);
      expect(drawer()).toBeNull();
      expect(repo.calls.length).toBe(before + 1);
    });

    it('opens the edit form from the chair name', async () => {
      await setupWithRows(ALL_PERMS);
      cards()[0].querySelector<HTMLButtonElement>('.chair__link')!.click();
      await settle();

      expect(repo.fetched).toEqual([1]);
      expect(text()).toContain('CHAIRS.FORM.EDIT_TITLE');
      expect(el().querySelector<HTMLInputElement>('app-chair-form app-float-label-input input')!.value).toBe('C1');
    });

    it('saves an edit from the pencil with only name and type, then closes', async () => {
      await setupWithRows(ALL_PERMS);
      cardButton(cards()[0], 'COMMON.EDIT')!.click();
      await settle();

      const name = el().querySelector<HTMLInputElement>('app-chair-form app-float-label-input input')!;
      name.value = 'R7';
      name.dispatchEvent(new Event('input'));
      el().querySelector('app-chair-form form')!.dispatchEvent(new Event('submit'));
      await settle();

      expect(repo.updated).toEqual([[1, { name: 'R7', type: ChairType.Regular }]]);
      expect(drawer()).toBeNull();
    });

    it('closes the drawer from the close button', async () => {
      await setupWithRows(ALL_PERMS);
      addButton()!.click();
      await settle();

      el().querySelector<HTMLButtonElement>('.dr__close')!.click();
      await settle();
      expect(drawer()).toBeNull();
    });
  });

  describe('change type', () => {
    it('asks first, then sends the same name with the opposite type', async () => {
      await setupWithRows(ALL_PERMS);
      changeTypeButton(cards()[0])!.click();
      await settle();

      expect(dialog()).not.toBeNull();
      expect(repo.updated).toEqual([]); // nothing sent before confirming

      confirmButton().click();
      await settle();

      expect(repo.updated).toEqual([[1, { name: 'C1', type: ChairType.Vip }]]);
      expect(dialog()).toBeNull();
    });

    it('turns a VIP chair into a Regular one', async () => {
      await setupWithRows(ALL_PERMS);
      changeTypeButton(cards()[1])!.click();
      await settle();
      confirmButton().click();

      expect(repo.updated).toEqual([[2, { name: 'C2', type: ChairType.Regular }]]);
    });

    it('cancelling sends nothing', async () => {
      await setupWithRows(ALL_PERMS);
      changeTypeButton(cards()[0])!.click();
      await settle();
      el().querySelector<HTMLButtonElement>('.dialog__actions app-button:first-child button')!.click();
      await settle();

      expect(dialog()).toBeNull();
      expect(repo.updated).toEqual([]);
    });

    it('does not open the edit drawer', async () => {
      await setupWithRows(ALL_PERMS);
      changeTypeButton(cards()[0])!.click();
      await settle();

      expect(drawer()).toBeNull();
    });
  });

  describe('delete', () => {
    it('confirms before deleting the chair', async () => {
      await setupWithRows(ALL_PERMS);
      cardButton(cards()[0], 'COMMON.DELETE')!.click();
      await settle();

      expect(dialog()).not.toBeNull();
      expect(repo.deleted).toEqual([]);

      confirmButton().click();
      await settle();

      expect(repo.deleted).toEqual([[1]]);
      expect(dialog()).toBeNull();
    });

    it('keeps the dialog open when the delete is refused (409)', async () => {
      await setupWithRows(ALL_PERMS);
      repo.next = () => new Observable((s) => s.error(Object.assign(new Error('409'), { status: 409 })));
      cardButton(cards()[0], 'COMMON.DELETE')!.click();
      await settle();
      confirmButton().click();
      await settle();

      expect(dialog()).not.toBeNull();
    });

    it('steps back a page when deleting the only card of the last page', async () => {
      await setup(ALL_PERMS);
      repo.resolve(response(Array.from({ length: 12 }, (_, i) => chair(i + 1)), 13)); // 13 chairs → 2 pages
      await settle();

      el().querySelector<HTMLButtonElement>('app-pagination button[aria-label="COMMON.NEXT"]')!.click();
      expect(repo.calls[repo.calls.length - 1].pageNumber).toBe(2);
      repo.resolve({ ...response([chair(13)], 13), meta: { ...response([], 13).meta!, currentPage: 2, hasPreviousPage: true } });
      await settle();
      expect(cards()).toHaveLength(1);

      cardButton(cards()[0], 'COMMON.DELETE')!.click();
      await settle();
      confirmButton().click();
      await settle();

      expect(repo.deleted).toEqual([[13]]);
      expect(repo.calls[repo.calls.length - 1].pageNumber).toBe(1); // page 2 is gone, so back to page 1
    });

    it('stays on the page when other cards remain', async () => {
      await setup(ALL_PERMS);
      repo.resolve(response(Array.from({ length: 12 }, (_, i) => chair(i + 1)), 30));
      await settle();
      el().querySelector<HTMLButtonElement>('app-pagination button[aria-label="COMMON.NEXT"]')!.click();
      repo.resolve({ ...response([chair(13), chair(14)], 30), meta: { ...response([], 30).meta!, currentPage: 2, hasPreviousPage: true } });
      await settle();

      cardButton(cards()[0], 'COMMON.DELETE')!.click();
      await settle();
      confirmButton().click();
      await settle();

      expect(repo.calls[repo.calls.length - 1].pageNumber).toBe(2);
    });
  });
});
