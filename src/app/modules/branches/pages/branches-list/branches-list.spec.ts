import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Observable, Subject } from 'rxjs';
import { Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LanguageService } from '@core/services/language.service';
import { ApiResponse } from '@shared/model/api_response.model';
import { AuthService } from '../../../auth/service/auth.service';
import { FilterSelectComponent } from '../../../../shared/components/filter-select/filter-select.component';
import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';
import { SearchInputComponent } from '../../../../shared/components/search-input/search-input.component';
import { BranchListItem, BranchesQuery } from '../../model/branch.model';
import { BRANCH_REPOSITORY } from '../../repository/branch.repository';
import { BranchesList } from './branches-list';

function branch(id: number, over: Partial<BranchListItem> = {}): BranchListItem {
  return {
    id, nameAr: `فرع ${id}`, nameEn: `Branch ${id}`, address: `${id} Main St, Cairo`, phone: '+201001102194',
    allowsRegular: true, allowsVip: true, allowsHome: false, isVisible: true,
    barbersCount: 6, regularChairsCount: 4, vipChairsCount: 2, ...over,
  };
}

function response(items: BranchListItem[], totalCount = items.length, currentPage = 1): ApiResponse<BranchListItem[]> {
  return {
    status: true, statusCode: 200, message: 'ok', errors: null, data: items,
    meta: { currentPage, pageSize: 12, totalPages: Math.max(1, Math.ceil(totalCount / 12)), totalCount, hasPreviousPage: currentPage > 1, hasNextPage: false, additionalData: null },
  };
}

class FakeRepository {
  calls: BranchesQuery[] = [];
  toggled: number[] = [];
  deleted: number[][] = [];
  toggleResult: Subject<ApiResponse<null>> | null = null;
  deleteResult: Subject<ApiResponse<null>> | null = null;
  toggleBranchStatus(id: number): Observable<ApiResponse<null>> {
    this.toggled.push(id);
    this.toggleResult = new Subject<ApiResponse<null>>();
    return this.toggleResult;
  }
  deleteBranches(p: { ids: number[] }): Observable<ApiResponse<null>> {
    this.deleted.push(p.ids);
    this.deleteResult = new Subject<ApiResponse<null>>();
    return this.deleteResult;
  }
  pending: Array<Subject<ApiResponse<BranchListItem[]>>> = [];
  getBranches(q: BranchesQuery): Observable<ApiResponse<BranchListItem[]>> {
    this.calls.push(q);
    const s = new Subject<ApiResponse<BranchListItem[]>>();
    this.pending.push(s);
    return s;
  }
  get last() { return this.pending[this.pending.length - 1]; }
  resolve(res: ApiResponse<BranchListItem[]>) { this.last.next(res); this.last.complete(); }
}

describe('BranchesList', () => {
  let repo: FakeRepository;
  let fixture: ComponentFixture<BranchesList>;
  let permissions: Set<string>;
  let navigate: ReturnType<typeof vi.spyOn>;

  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => el().textContent ?? '';
  const cards = () => el().querySelectorAll('app-branch-card');

  function setup(perms: string[] = ['Branch.View']) {
    repo = new FakeRepository();
    permissions = new Set(perms);
    TestBed.configureTestingModule({
      imports: [BranchesList, TranslateModule.forRoot()],
      providers: [
        { provide: BRANCH_REPOSITORY, useValue: repo },
        { provide: AuthService, useValue: { hasPermission: (p: string) => permissions.has(p) } },
      ],
    });
    TestBed.inject(TranslateService).use('en');
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(BranchesList);
    fixture.detectChanges();
  }

  async function settle() {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  afterEach(() => localStorage.clear());

  describe('loading and data', () => {
    beforeEach(() => setup());

    it('requests page 1 on open and shows skeleton cards while loading', () => {
      expect(repo.calls).toEqual([{ pageNumber: 1, pageSize: 12 }]);
      expect(el().querySelector('[aria-busy="true"]')).not.toBeNull();
      expect(cards().length).toBe(0);
    });

    it('renders one card per branch with the fields from the list response', async () => {
      repo.resolve(response([branch(3, { barbersCount: 6, regularChairsCount: 4, vipChairsCount: 2 }), branch(2, { isVisible: false, allowsVip: false, allowsHome: true })], 2));
      await settle();

      expect(el().querySelector('[aria-busy="true"]')).toBeNull();
      expect(cards().length).toBe(2);

      const first = cards()[0].textContent ?? '';
      expect(first).toContain('Branch 3');
      expect(first).toContain('3 Main St, Cairo');
      expect(first).toContain('+201001102194');
      expect(first).toContain('BRANCHES.STATUS.VISIBLE');
      expect(first).toContain('BRANCHES.TYPE.REGULAR');
      expect(first).toContain('BRANCHES.TYPE.VIP');
      expect(first).not.toContain('BRANCHES.TYPE.HOME');
      expect(first).toMatch(/6\s*BRANCHES\.COUNT\.BARBERS/);

      const second = cards()[1].textContent ?? '';
      expect(second).toContain('BRANCHES.STATUS.HIDDEN');
      expect(second).toContain('BRANCHES.TYPE.HOME');
      expect(second).not.toContain('BRANCHES.TYPE.VIP');
    });

    it('labels counts as totals — never as "active"', async () => {
      repo.resolve(response([branch(1)]));
      await settle();
      expect(text().toLowerCase()).not.toContain('active');
    });

    it('leads with the name in the current language', async () => {
      TestBed.inject(LanguageService).setLang('ar');
      repo.resolve(response([branch(5)]));
      await settle();
      const head = cards()[0].querySelector('h3');
      expect(head?.textContent).toContain('فرع 5');
      expect(head?.getAttribute('lang')).toBe('ar');
      expect(cards()[0].querySelector('.branch__alt')?.textContent).toContain('Branch 5');
    });
  });

  describe('states', () => {
    beforeEach(() => setup());

    it('shows the empty state when there are no branches and no filter', async () => {
      repo.resolve(response([]));
      await settle();
      expect(text()).toContain('BRANCHES.EMPTY_TITLE');
      expect(text()).not.toContain('BRANCHES.NO_RESULTS_TITLE');
    });

    it('shows "no results" — not the empty state — when a search matches nothing', async () => {
      repo.resolve(response([branch(1)]));
      await settle();

      fixture.debugElement.query(By.directive(SearchInputComponent)).triggerEventHandler('search', 'zzz');
      expect(repo.calls.at(-1)).toEqual({ pageNumber: 1, pageSize: 12, search: 'zzz' });
      repo.resolve(response([]));
      await settle();

      expect(text()).toContain('BRANCHES.NO_RESULTS_TITLE');
      expect(text()).not.toContain('BRANCHES.EMPTY_TITLE');
    });

    it('shows "no results" when a visibility filter matches nothing', async () => {
      repo.resolve(response([branch(1)]));
      await settle();

      fixture.debugElement.query(By.directive(FilterSelectComponent)).triggerEventHandler('changed', 'false');
      expect(repo.calls.at(-1)).toEqual({ pageNumber: 1, pageSize: 12, isVisible: false });
      repo.resolve(response([]));
      await settle();

      expect(text()).toContain('BRANCHES.NO_RESULTS_TITLE');
    });

    it('shows a failure state with retry, and retry reloads the same query', async () => {
      repo.last.error(new Error('boom'));
      await settle();

      expect(el().querySelector('app-failed-state')).not.toBeNull();
      expect(cards().length).toBe(0);

      const callsBefore = repo.calls.length;
      (el().querySelector('app-failed-state button') as HTMLButtonElement).click();
      await settle();

      expect(repo.calls.length).toBe(callsBefore + 1);
      expect(repo.calls.at(-1)).toEqual(repo.calls[0]);
      expect(el().querySelector('[aria-busy="true"]')).not.toBeNull();

      repo.resolve(response([branch(1)]));
      await settle();
      expect(el().querySelector('app-failed-state')).toBeNull();
      expect(cards().length).toBe(1);
    });
  });

  describe('filters and pagination', () => {
    beforeEach(async () => {
      setup();
      repo.resolve(response(Array.from({ length: 12 }, (_, i) => branch(30 - i)), 30));
      await settle();
    });

    it('shows the range and total, and requests the chosen page', async () => {
      expect(text()).toContain('1–12');
      expect(text()).toContain('30');

      fixture.debugElement.query(By.directive(PaginationComponent)).triggerEventHandler('pageChange', 2);
      expect(repo.calls.at(-1)).toEqual({ pageNumber: 2, pageSize: 12 });
    });

    it('returns to page 1 when search changes while on a later page', async () => {
      fixture.debugElement.query(By.directive(PaginationComponent)).triggerEventHandler('pageChange', 3);
      repo.resolve(response([branch(1)], 30, 3));
      await settle();

      fixture.debugElement.query(By.directive(SearchInputComponent)).triggerEventHandler('search', 'maadi');
      expect(repo.calls.at(-1)).toEqual({ pageNumber: 1, pageSize: 12, search: 'maadi' });
    });

    it('does not reload when the search emits a value that changes nothing', () => {
      const before = repo.calls.length;
      fixture.debugElement.query(By.directive(SearchInputComponent)).triggerEventHandler('search', '');
      expect(repo.calls.length).toBe(before);
    });

    it('"All" clears the visibility filter', async () => {
      fixture.debugElement.query(By.directive(FilterSelectComponent)).triggerEventHandler('changed', 'true');
      expect(repo.calls.at(-1)?.isVisible).toBe(true);
      repo.resolve(response([branch(1)]));
      await settle();

      fixture.debugElement.query(By.directive(FilterSelectComponent)).triggerEventHandler('changed', '');
      expect(repo.calls.at(-1)).toEqual({ pageNumber: 1, pageSize: 12 });
    });
  });

  describe('permissions', () => {
    it('hides "Add branch" without Branch.Create', async () => {
      setup(['Branch.View']);
      repo.resolve(response([branch(1)]));
      await settle();
      expect(text()).not.toContain('BRANCHES.NEW');
    });

    it('shows "Add branch" with Branch.Create', async () => {
      setup(['Branch.View', 'Branch.Create']);
      repo.resolve(response([branch(1)]));
      await settle();
      expect(text()).toContain('BRANCHES.NEW');
    });
  });

  describe('card actions', () => {
    const labels = () => Array.from(el().querySelectorAll('app-branch-card:first-of-type .branch__actions button')).map((b) => (b.getAttribute('aria-label') ?? b.textContent ?? '').trim());

    it('shows no action buttons with Branch.View only', async () => {
      setup(['Branch.View']);
      repo.resolve(response([branch(1)]));
      await settle();
      expect(el().querySelector('.branch__actions')).toBeNull();
    });

    it('shows Edit with Branch.Edit and Delete with Branch.Delete — independently', async () => {
      setup(['Branch.View', 'Branch.Edit']);
      repo.resolve(response([branch(1)]));
      await settle();
      expect(labels()).toEqual(['COMMON.EDIT']);

      TestBed.resetTestingModule();
      setup(['Branch.View', 'Branch.Delete']);
      repo.resolve(response([branch(1)]));
      await settle();
      expect(labels()).toEqual(['COMMON.DELETE']);
    });

    it('shows both with both permissions, on every card', async () => {
      setup(['Branch.View', 'Branch.Edit', 'Branch.Delete']);
      repo.resolve(response([branch(2), branch(1)]));
      await settle();
      expect(el().querySelectorAll('.branch__actions').length).toBe(2);
      expect(labels()).toEqual(['COMMON.EDIT', 'COMMON.DELETE']);
    });

    it('Edit opens the edit page of that branch', async () => {
      setup(['Branch.View', 'Branch.Edit']);
      repo.resolve(response([branch(2), branch(1)]));
      await settle();

      (el().querySelectorAll('.branch__actions button')[1] as HTMLButtonElement).click();
      expect(navigate).toHaveBeenCalledWith(['main/branches', 1, 'edit']);
    });

    it('clicking the branch name opens its details, even with Branch.View only', async () => {
      setup(['Branch.View']);
      repo.resolve(response([branch(7)]));
      await settle();

      (el().querySelector('.branch__link') as HTMLButtonElement).click();
      expect(navigate).toHaveBeenCalledWith(['main/branches', 7]);
    });

    it('"Add branch" opens the create page', async () => {
      setup(['Branch.View', 'Branch.Create']);
      repo.resolve(response([branch(1)]));
      await settle();

      (el().querySelector('app-page-header app-button button') as HTMLButtonElement).click();
      expect(navigate).toHaveBeenCalledWith(['main/branches/new']);
    });
  });

  describe('delete', () => {
    const dialog = () => el().querySelector('app-confirm-modal [role="alertdialog"]');
    const trash = (i = 0) => el().querySelectorAll('.branch__actions button')[i * 2 + 1] as HTMLButtonElement;
    const dialogButton = (n: number) => el().querySelectorAll('app-confirm-modal .dialog__actions button')[n] as HTMLButtonElement;

    beforeEach(async () => {
      setup(['Branch.View', 'Branch.Edit', 'Branch.Delete']);
      repo.resolve(response([branch(2), branch(1)], 2));
      await settle();
    });

    it('asks for confirmation first and sends nothing', async () => {
      expect(dialog()).toBeNull();
      trash().click();
      await settle();

      expect(dialog()).not.toBeNull();
      expect(dialog()?.textContent).toContain('BRANCHES.DELETE.TITLE');
      expect(repo.deleted).toEqual([]);
    });

    it('Cancel closes the dialog without deleting', async () => {
      trash().click();
      await settle();
      dialogButton(0).click();
      await settle();

      expect(dialog()).toBeNull();
      expect(repo.deleted).toEqual([]);
    });

    it('Delete sends the id, then closes and reloads the list', async () => {
      trash(1).click();
      await settle();
      dialogButton(1).click();
      await settle();
      expect(repo.deleted).toEqual([[1]]);

      const calls = repo.calls.length;
      repo.deleteResult!.next({ status: true, statusCode: 200, message: 'ok', errors: null, meta: null, data: null });
      repo.deleteResult!.complete();
      await settle();

      expect(dialog()).toBeNull();
      expect(repo.calls.length).toBe(calls + 1);
    });

    it('keeps the dialog open when the delete is rejected', async () => {
      trash().click();
      await settle();
      dialogButton(1).click();
      repo.deleteResult!.error(new Error('409'));
      await settle();

      expect(dialog()).not.toBeNull();
    });
  });

  describe('status toggle', () => {
    const toggle = () => el().querySelector('app-branch-card app-switch button[role="switch"]') as HTMLButtonElement | null;

    it('shows only the Visible/Hidden badge, not a switch, without Branch.Edit', async () => {
      setup(['Branch.View']);
      repo.resolve(response([branch(1, { isVisible: false })]));
      await settle();
      expect(toggle()).toBeNull();
      expect(cards()[0].querySelector('.branch__head app-status-badge')?.textContent).toContain('BRANCHES.STATUS.HIDDEN');
    });

    it('shows a switch reflecting isVisible with Branch.Edit', async () => {
      setup(['Branch.View', 'Branch.Edit']);
      repo.resolve(response([branch(2, { isVisible: true }), branch(1, { isVisible: false })]));
      await settle();

      const switches = Array.from(el().querySelectorAll('app-branch-card app-switch button')) as HTMLButtonElement[];
      expect(switches.map((s) => s.getAttribute('aria-checked'))).toEqual(['true', 'false']);
    });

    it('clicking the switch toggles that branch and reloads the list once it succeeds', async () => {
      setup(['Branch.View', 'Branch.Edit']);
      repo.resolve(response([branch(2, { isVisible: true }), branch(1, { isVisible: false })]));
      await settle();

      const calls = repo.calls.length;
      (el().querySelectorAll('app-branch-card app-switch button')[1] as HTMLButtonElement).click();
      expect(repo.toggled).toEqual([1]);
      expect(repo.calls.length).toBe(calls);

      repo.toggleResult!.next({ status: true, statusCode: 200, message: 'ok', errors: null, meta: null, data: null });
      repo.toggleResult!.complete();
      expect(repo.calls.length).toBe(calls + 1);
    });

    it('does not reload when the toggle is rejected (e.g. no active barber)', async () => {
      setup(['Branch.View', 'Branch.Edit']);
      repo.resolve(response([branch(1, { isVisible: false })]));
      await settle();

      const calls = repo.calls.length;
      (el().querySelector('app-branch-card app-switch button') as HTMLButtonElement).click();
      repo.toggleResult!.error(new Error('400'));
      await settle();

      expect(repo.calls.length).toBe(calls);
    });

    it('ignores a second toggle while one is still in flight', async () => {
      setup(['Branch.View', 'Branch.Edit']);
      repo.resolve(response([branch(2), branch(1)]));
      await settle();

      const switches = el().querySelectorAll('app-branch-card app-switch button');
      (switches[0] as HTMLButtonElement).click();
      (switches[1] as HTMLButtonElement).click();

      expect(repo.toggled).toEqual([2]);
    });
  });
});
