import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Observable, Subject, of, throwError } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';

import { ApiResponse } from '@shared/model/api_response.model';
import { AuthService } from '../../../auth/service/auth.service';
import { BranchListItem } from '../../../branches/model/branch.model';
import { BRANCH_REPOSITORY } from '../../../branches/repository/branch.repository';
import {
  BarberDetails,
  BarberListItem,
  BarbersQuery,
  CreateBarberPayload,
  UpdateBarberPayload,
} from '../../model/barber.model';
import { BARBER_REPOSITORY } from '../../repository/barber.repository';
import { BarbersList } from './barbers-list';

const ALL_PERMS = ['Barber.View', 'Barber.Create', 'Barber.Edit', 'Barber.Delete'];

function barber(id: number, over: Partial<BarberListItem> = {}): BarberListItem {
  return {
    id, branchId: 3, branchNameAr: 'مدينة نصر', branchNameEn: 'Nasr City',
    fullName: `Barber ${id}`, phone: `+20100000000${id}`, imageUrl: null, isActive: true, ...over,
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

function response(items: BarberListItem[], totalCount = items.length): ApiResponse<BarberListItem[]> {
  return {
    status: true, statusCode: 200, message: 'ok', errors: null, data: items,
    meta: {
      currentPage: 1, pageSize: 10, totalPages: Math.max(1, Math.ceil(totalCount / 10)), totalCount,
      hasPreviousPage: false, hasNextPage: totalCount > 10, additionalData: null,
    },
  };
}

class FakeBarberRepository {
  calls: BarbersQuery[] = [];
  pending: Array<Subject<ApiResponse<BarberListItem[]>>> = [];
  toggled: number[] = [];
  deleted: number[][] = [];
  updated: Array<[number, UpdateBarberPayload]> = [];
  created: CreateBarberPayload[] = [];
  fetched: number[] = [];
  /** Answer of every mutation (swap for a Subject to hold one in flight, or an error). */
  next: () => Observable<ApiResponse<unknown>> = () => of(ok(null));

  getBarbers(q: BarbersQuery): Observable<ApiResponse<BarberListItem[]>> {
    this.calls.push(q);
    const s = new Subject<ApiResponse<BarberListItem[]>>();
    this.pending.push(s);
    return s;
  }
  getBarberById(id: number): Observable<ApiResponse<BarberDetails>> {
    this.fetched.push(id);
    return of(ok<BarberDetails>({ ...barber(id), createdAt: '2026-11-02T15:02:40Z', updatedAt: null }));
  }
  createBarber(p: CreateBarberPayload) { this.created.push(p); return of(ok(14)); }
  updateBarber(id: number, p: UpdateBarberPayload) { this.updated.push([id, p]); return this.next() as Observable<ApiResponse<null>>; }
  toggleBarberStatus(id: number) { this.toggled.push(id); return this.next() as Observable<ApiResponse<null>>; }
  deleteBarbers(p: { ids: number[] }) { this.deleted.push(p.ids); return this.next() as Observable<ApiResponse<null>>; }

  get last() { return this.pending[this.pending.length - 1]; }
  resolve(res: ApiResponse<BarberListItem[]>) { this.last.next(res); this.last.complete(); }
}

describe('BarbersList', () => {
  let repo: FakeBarberRepository;
  let fixture: ComponentFixture<BarbersList>;

  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => el().textContent ?? '';
  const rows = () => Array.from(el().querySelectorAll<HTMLElement>('table tbody tr.dt__row:not(.dt__row--skeleton)'));
  const filters = () => Array.from(el().querySelectorAll<HTMLSelectElement>('app-filter-select select'));
  const rowSwitch = (row: HTMLElement) => row.querySelector<HTMLButtonElement>('app-switch button');
  const rowButton = (row: HTMLElement, label: string) => row.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  const rowCheck = (row: HTMLElement) => row.querySelector<HTMLInputElement>('input[type="checkbox"]');
  const addButton = () => el().querySelector<HTMLButtonElement>('app-page-header app-button button');
  const dialog = () => el().querySelector('[role="alertdialog"]');
  const confirmButton = () => el().querySelector<HTMLButtonElement>('.dialog__actions app-button:last-child button')!;
  const drawer = () => el().querySelector('aside.dr');
  const bulkBar = () => el().querySelector('.bulk');

  async function settle() {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function setup(perms: string[] = ['Barber.View']) {
    repo = new FakeBarberRepository();
    const permissions = new Set(perms);
    TestBed.configureTestingModule({
      imports: [BarbersList, TranslateModule.forRoot()],
      providers: [
        { provide: BARBER_REPOSITORY, useValue: repo },
        { provide: BRANCH_REPOSITORY, useValue: { getBranches: () => of({ ...ok([branch(3), branch(5)]), meta: null }) } },
        { provide: AuthService, useValue: { hasPermission: (p: string) => permissions.has(p) } },
      ],
    });
    TestBed.inject(TranslateService).use('en');
    fixture = TestBed.createComponent(BarbersList);
    await settle();
  }

  /** Setup + answer the first list request so rows are on screen. */
  async function setupWithRows(
    perms: string[],
    items: BarberListItem[] = [barber(1), barber(2, { isActive: false })],
  ) {
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
    it('requests page 1 (10 rows) with no filters and shows skeleton rows while loading', async () => {
      await setup();
      expect(repo.calls).toHaveLength(1);
      expect(repo.calls[0]).toEqual({ pageNumber: 1, pageSize: 10 });
      expect(el().querySelectorAll('.dt__row--skeleton').length).toBeGreaterThan(0);
      expect(rows()).toHaveLength(0);
    });

    it('renders a row per barber with name, branch, phone and status', async () => {
      await setupWithRows(['Barber.View']);

      expect(rows()).toHaveLength(2);
      const first = rows()[0].textContent ?? '';
      expect(first).toContain('Barber 1');
      expect(first).toContain('Nasr City');
      expect(first).toContain('+201000000001');
      expect(first).toContain('BARBERS.STATUS.ACTIVE');
      expect(rows()[1].textContent).toContain('BARBERS.STATUS.SUSPENDED');
    });

    it('shows the phone as a tel: link that does not open the editor', async () => {
      await setupWithRows(ALL_PERMS);
      const link = rows()[0].querySelector<HTMLAnchorElement>('a.phone')!;

      expect(link.getAttribute('href')).toBe('tel:+201000000001');
      expect(link.getAttribute('dir')).toBe('ltr');
      link.addEventListener('click', (e) => e.preventDefault());
      link.click();
      await settle();
      expect(repo.fetched).toEqual([]);
    });

    it('shows initials when the barber has no photo and the photo when there is one', async () => {
      await setupWithRows(['Barber.View'], [barber(1), barber(2, { imageUrl: 'https://x/y.jpg' })]);
      expect(rows()[0].querySelector('app-avatar img')).toBeNull();
      expect(rows()[1].querySelector('app-avatar img')?.getAttribute('src')).toBe('https://x/y.jpg');
    });

    it('shows the "nothing yet" empty state when there are no barbers and no filter', async () => {
      await setupWithRows(['Barber.View'], []);
      expect(text()).toContain('BARBERS.EMPTY_TITLE');
      expect(text()).not.toContain('BARBERS.NO_RESULTS_TITLE');
    });

    it('shows the "no matches" state when a filter returns nothing', async () => {
      await setupWithRows(['Barber.View']);
      pick(filters()[1], 'false');
      repo.resolve(response([]));
      await settle();

      expect(text()).toContain('BARBERS.NO_RESULTS_TITLE');
      expect(text()).not.toContain('BARBERS.EMPTY_TITLE');
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

    it('lists every branch in the branch filter', async () => {
      await setupWithRows(['Barber.View']);
      expect(Array.from(filters()[0].options).map((o) => o.value)).toEqual(['', '3', '5']);
    });
  });

  describe('permissions', () => {
    it('view-only: no add button, checkboxes, switches, edit or delete', async () => {
      await setupWithRows(['Barber.View']);

      expect(addButton()).toBeNull();
      expect(rowCheck(rows()[0])).toBeNull();
      expect(rowSwitch(rows()[0])).toBeNull();
      expect(rowButton(rows()[0], 'COMMON.EDIT')).toBeNull();
      expect(rowButton(rows()[0], 'COMMON.DELETE')).toBeNull();
    });

    it('a view-only user clicking a row does not open the editor', async () => {
      await setupWithRows(['Barber.View']);
      rows()[0].click();
      await settle();
      expect(drawer()).toBeNull();
      expect(repo.fetched).toEqual([]);
    });

    it('with every permission all actions are there', async () => {
      await setupWithRows(ALL_PERMS);

      expect(addButton()).not.toBeNull();
      expect(rowCheck(rows()[0])).not.toBeNull();
      expect(rowSwitch(rows()[0])).not.toBeNull();
      expect(rowButton(rows()[0], 'COMMON.EDIT')).not.toBeNull();
      expect(rowButton(rows()[0], 'COMMON.DELETE')).not.toBeNull();
    });

    it('edit-only: can edit and toggle but not select or delete', async () => {
      await setupWithRows(['Barber.View', 'Barber.Edit']);

      expect(rowSwitch(rows()[0])).not.toBeNull();
      expect(rowButton(rows()[0], 'COMMON.EDIT')).not.toBeNull();
      expect(rowButton(rows()[0], 'COMMON.DELETE')).toBeNull();
      expect(rowCheck(rows()[0])).toBeNull();
    });
  });

  describe('filters', () => {
    it('branch filter reloads from page 1 with branchId', async () => {
      await setupWithRows(['Barber.View']);
      pick(filters()[0], '5');
      expect(repo.calls[repo.calls.length - 1]).toEqual({ pageNumber: 1, pageSize: 10, branchId: 5 });

      pick(filters()[0], '');
      expect(repo.calls[repo.calls.length - 1].branchId).toBeUndefined();
    });

    it('status filter sends isActive true / false, and clears back to all', async () => {
      await setupWithRows(['Barber.View']);

      pick(filters()[1], 'false');
      expect(repo.calls[repo.calls.length - 1].isActive).toBe(false);

      pick(filters()[1], 'true');
      expect(repo.calls[repo.calls.length - 1].isActive).toBe(true);

      pick(filters()[1], '');
      expect(repo.calls[repo.calls.length - 1].isActive).toBeUndefined();
    });

    it('search reloads with the typed term after the debounce', async () => {
      await setupWithRows(['Barber.View']);
      const input = el().querySelector<HTMLInputElement>('app-search-input input')!;
      input.value = 'karim';
      input.dispatchEvent(new Event('input'));
      await new Promise((r) => setTimeout(r, 450));

      expect(repo.calls[repo.calls.length - 1]).toMatchObject({ pageNumber: 1, search: 'karim' });
    });

    it('changing a filter clears the selection', async () => {
      await setupWithRows(ALL_PERMS);
      rowCheck(rows()[0])!.click();
      await settle();
      expect(bulkBar()).not.toBeNull();

      pick(filters()[1], 'true');
      await settle();
      expect(bulkBar()).toBeNull();
    });
  });

  describe('status switch', () => {
    it('toggles that barber and reloads the list', async () => {
      await setupWithRows(ALL_PERMS);
      const before = repo.calls.length;

      rowSwitch(rows()[0])!.click();
      await settle();

      expect(repo.toggled).toEqual([1]);
      expect(repo.calls.length).toBe(before + 1);
    });

    it('labels the switch with the action it will do', async () => {
      await setupWithRows(ALL_PERMS);
      expect(rowSwitch(rows()[0])!.getAttribute('aria-label')).toBe('BARBERS.SUSPEND');
      expect(rowSwitch(rows()[1])!.getAttribute('aria-label')).toBe('BARBERS.ACTIVATE');
    });

    it('a refused suspend (409) leaves the list alone', async () => {
      await setupWithRows(ALL_PERMS);
      repo.next = () => throwError(() => Object.assign(new Error('409'), { status: 409 }));
      const before = repo.calls.length;

      rowSwitch(rows()[0])!.click();
      await settle();

      expect(repo.calls.length).toBe(before);
    });

    it('disables the switches while a mutation is in flight', async () => {
      await setupWithRows(ALL_PERMS);
      repo.next = () => new Subject<ApiResponse<null>>();

      rowSwitch(rows()[0])!.click();
      await settle();

      expect(rowSwitch(rows()[1])!.disabled).toBe(true);
    });
  });

  describe('create', () => {
    it('opens an empty drawer from the header button', async () => {
      await setupWithRows(ALL_PERMS);
      addButton()!.click();
      await settle();

      expect(drawer()).not.toBeNull();
      expect(drawer()!.textContent).toContain('BARBERS.FORM.CREATE_TITLE');
      expect(drawer()!.querySelector('app-barber-form')).not.toBeNull();
    });

    it('preselects the branch the list is filtered to', async () => {
      await setupWithRows(ALL_PERMS);
      pick(filters()[0], '5');
      repo.resolve(response([barber(1, { branchId: 5 })]));
      await settle();

      addButton()!.click();
      await settle();

      expect(drawer()!.querySelector<HTMLSelectElement>('app-float-label-select select')!.value).toBe('5');
    });

    it('creates the barber, closes the drawer and reloads', async () => {
      await setupWithRows(ALL_PERMS);
      addButton()!.click();
      await settle();

      const d = drawer()!;
      const select = d.querySelector<HTMLSelectElement>('app-float-label-select select')!;
      const [name, phone] = Array.from(d.querySelectorAll<HTMLInputElement>('app-float-label-input input'));
      pick(select, '3');
      name.value = 'Karim Mostafa'; name.dispatchEvent(new Event('input'));
      phone.value = '01001234567'; phone.dispatchEvent(new Event('input'));
      const before = repo.calls.length;
      d.querySelector('form')!.dispatchEvent(new Event('submit'));
      await settle();

      expect(repo.created).toEqual([{ branchId: 3, fullName: 'Karim Mostafa', phone: '+201001234567', image: null }]);
      expect(drawer()).toBeNull();
      expect(repo.calls.length).toBe(before + 1);
    });
  });

  describe('edit', () => {
    it('opens the drawer with the barber’s details loaded from the API', async () => {
      await setupWithRows(ALL_PERMS);
      rows()[0].click();
      await settle();

      expect(repo.fetched).toEqual([1]);
      expect(drawer()!.textContent).toContain('BARBERS.FORM.EDIT_TITLE');
      const [name, phone] = Array.from(drawer()!.querySelectorAll<HTMLInputElement>('app-float-label-input input'));
      expect(name.value).toBe('Barber 1');
      expect(phone.value).toBe('+201000000001');
    });

    it('the pencil button opens the same editor', async () => {
      await setupWithRows(ALL_PERMS);
      rowButton(rows()[1], 'COMMON.EDIT')!.click();
      await settle();
      expect(repo.fetched).toEqual([2]);
    });

    it('saves the changes, closes the drawer and reloads', async () => {
      await setupWithRows(ALL_PERMS);
      rows()[0].click();
      await settle();

      const name = drawer()!.querySelector<HTMLInputElement>('app-float-label-input input')!;
      name.value = 'Karim Renamed'; name.dispatchEvent(new Event('input'));
      const before = repo.calls.length;
      drawer()!.querySelector('form')!.dispatchEvent(new Event('submit'));
      await settle();

      expect(repo.updated).toHaveLength(1);
      expect(repo.updated[0][0]).toBe(1);
      expect(repo.updated[0][1]).toMatchObject({ branchId: 3, fullName: 'Karim Renamed', removeImage: false });
      expect(drawer()).toBeNull();
      expect(repo.calls.length).toBe(before + 1);
    });

    it('keeps the drawer open when the save is refused (e.g. 409 on transfer)', async () => {
      await setupWithRows(ALL_PERMS);
      rows()[0].click();
      await settle();
      repo.next = () => throwError(() => Object.assign(new Error('409'), { status: 409 }));

      drawer()!.querySelector('form')!.dispatchEvent(new Event('submit'));
      await settle();

      expect(drawer()).not.toBeNull();
    });

    it('closes without saving from the cancel button', async () => {
      await setupWithRows(ALL_PERMS);
      rows()[0].click();
      await settle();

      const cancel = Array.from(drawer()!.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent?.includes('COMMON.CANCEL'))!;
      cancel.click();
      await settle();

      expect(drawer()).toBeNull();
      expect(repo.updated).toEqual([]);
    });
  });

  describe('delete', () => {
    it('asks for confirmation naming the barber, then deletes only that one', async () => {
      await setupWithRows(ALL_PERMS);
      rowButton(rows()[0], 'COMMON.DELETE')!.click();
      await settle();

      expect(dialog()).not.toBeNull();
      expect(dialog()!.textContent).toContain('BARBERS.DELETE.TITLE_ONE');
      expect(repo.deleted).toEqual([]);

      confirmButton().click();
      await settle();

      expect(repo.deleted).toEqual([[1]]);
      expect(dialog()).toBeNull();
    });

    it('cancel leaves everything as it was', async () => {
      await setupWithRows(ALL_PERMS);
      rowButton(rows()[0], 'COMMON.DELETE')!.click();
      await settle();
      el().querySelector<HTMLButtonElement>('.dialog__actions app-button:first-child button')!.click();
      await settle();

      expect(dialog()).toBeNull();
      expect(repo.deleted).toEqual([]);
    });

    it('clicking the trash button does not open the editor', async () => {
      await setupWithRows(ALL_PERMS);
      rowButton(rows()[0], 'COMMON.DELETE')!.click();
      await settle();
      expect(repo.fetched).toEqual([]);
    });

    it('bulk: select two rows, confirm once, and one DELETE carries both ids', async () => {
      await setupWithRows(ALL_PERMS, [barber(1), barber(2), barber(3)]);
      rowCheck(rows()[0])!.click();
      rowCheck(rows()[2])!.click();
      await settle();

      expect(bulkBar()!.textContent).toContain('COMMON.SELECTED');
      Array.from(bulkBar()!.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent?.includes('COMMON.DELETE'))!.click();
      await settle();
      expect(dialog()!.textContent).toContain('BARBERS.DELETE.TITLE_MANY');

      confirmButton().click();
      await settle();

      expect(repo.deleted).toEqual([[1, 3]]);
      expect(dialog()).toBeNull();
      expect(bulkBar()).toBeNull();
    });

    it('select-all picks every row on the page', async () => {
      await setupWithRows(ALL_PERMS, [barber(1), barber(2), barber(3)]);
      el().querySelector<HTMLInputElement>('table thead input[type="checkbox"]')!.click();
      await settle();

      expect(rows().every((r) => rowCheck(r)!.checked)).toBe(true);
      expect(bulkBar()).not.toBeNull();
    });

    it('a blocked delete (409) keeps the dialog and the selection so the person can adjust', async () => {
      await setupWithRows(ALL_PERMS, [barber(1), barber(2)]);
      repo.next = () => throwError(() => Object.assign(new Error('409'), { status: 409 }));
      rowCheck(rows()[0])!.click();
      await settle();
      Array.from(bulkBar()!.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent?.includes('COMMON.DELETE'))!.click();
      await settle();

      confirmButton().click();
      await settle();

      expect(dialog()).not.toBeNull();
      expect(bulkBar()).not.toBeNull();
    });
  });
});
