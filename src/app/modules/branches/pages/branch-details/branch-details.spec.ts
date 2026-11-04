import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Observable, Subject, of, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LanguageService } from '@core/services/language.service';
import { ApiResponse } from '@shared/model/api_response.model';
import { AuthService } from '../../../auth/service/auth.service';
import { BreadcrumbService } from '../../../../layout/main-layout/components/header/breadcrumb.service';
import { BranchDayOfWeek, BranchDetails as BranchModel } from '../../model/branch.model';
import { BRANCH_REPOSITORY } from '../../repository/branch.repository';
import { BranchDetails } from './branch-details';

function ok<T>(data: T): ApiResponse<T> {
  return { status: true, statusCode: 200, message: 'ok', errors: null, meta: null, data };
}

const BRANCH: BranchModel = {
  id: 5, nameAr: 'الزمالك', nameEn: 'Zamalek', address: '8 Hassan Sabry St, Zamalek', mapUrl: 'https://maps.example/z', phone: '+201020304050',
  allowsRegular: true, allowsVip: false, allowsHome: true, isVisible: true,
  createdAt: '2026-01-05T10:30:00Z', updatedAt: '2026-02-10T08:00:00Z',
  workingHours: [
    // deliberately out of display order
    { dayOfWeek: BranchDayOfWeek.Friday, isOpen: false, openTime: null, closeTime: null },
    { dayOfWeek: BranchDayOfWeek.Monday, isOpen: true, openTime: '18:00:00', closeTime: '02:00:00' },
    { dayOfWeek: BranchDayOfWeek.Saturday, isOpen: true, openTime: '10:00:00', closeTime: '22:00:00' },
  ],
};

class FakeRepository {
  byId = vi.fn((_id: number): Observable<ApiResponse<BranchModel>> => of(ok(BRANCH)));
  toggle = vi.fn((_id: number): Observable<ApiResponse<null>> => of(ok(null)));
  remove = vi.fn((_p: { ids: number[] }): Observable<ApiResponse<null>> => of(ok(null)));
  getBranchById(id: number) { return this.byId(id); }
  toggleBranchStatus(id: number) { return this.toggle(id); }
  deleteBranches(p: { ids: number[] }) { return this.remove(p); }
  getBranches() { return of({ ...ok([]), meta: null }); }
}

describe('BranchDetails page', () => {
  let repo: FakeRepository;
  let fixture: ComponentFixture<BranchDetails>;
  let navigate: ReturnType<typeof vi.spyOn>;

  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => el().textContent ?? '';
  const headerButtons = () => Array.from(el().querySelectorAll<HTMLButtonElement>('app-page-header app-button button'));
  const dialog = () => el().querySelector('app-confirm-modal [role="alertdialog"]');
  const dialogButton = (n: number) => el().querySelectorAll<HTMLButtonElement>('app-confirm-modal .dialog__actions button')[n];
  const statusSwitch = () => el().querySelector<HTMLButtonElement>('.summary app-switch button');

  async function settle() {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function setup(permissions: string[] = ['Branch.View', 'Branch.Edit', 'Branch.Delete'], id = '5', lang?: 'ar') {
    repo = repo ?? new FakeRepository();
    TestBed.configureTestingModule({
      imports: [BranchDetails, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: BRANCH_REPOSITORY, useValue: repo },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id }) } } },
        { provide: AuthService, useValue: { hasPermission: (p: string) => permissions.includes(p) } },
      ],
    });
    TestBed.inject(TranslateService).use('en');
    if (lang) TestBed.inject(LanguageService).setLang(lang);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(BranchDetails);
    await settle();
  }

  afterEach(() => {
    localStorage.clear();
    repo = undefined as unknown as FakeRepository;
  });

  describe('loading', () => {
    it('shows placeholders until the branch arrives', async () => {
      repo = new FakeRepository();
      const pending = new Subject<ApiResponse<BranchModel>>();
      repo.byId.mockReturnValue(pending);
      await setup();

      expect(el().querySelector('[aria-busy="true"]')).not.toBeNull();
      expect(text()).not.toContain('Zamalek');

      pending.next(ok(BRANCH));
      pending.complete();
      await settle();
      expect(el().querySelector('[aria-busy="true"]')).toBeNull();
      expect(text()).toContain('Zamalek');
    });

    it('requests the branch from the route id', async () => {
      await setup();
      expect(repo.byId).toHaveBeenCalledWith(5);
    });

    it('shows a failed state with retry, and retry loads the branch', async () => {
      repo = new FakeRepository();
      repo.byId.mockReturnValue(throwError(() => new Error('404')));
      await setup();

      expect(el().querySelector('app-failed-state')).not.toBeNull();
      expect(headerButtons().length).toBe(0);

      repo.byId.mockReturnValue(of(ok(BRANCH)));
      (el().querySelector('app-failed-state button') as HTMLButtonElement).click();
      await settle();

      expect(el().querySelector('app-failed-state')).toBeNull();
      expect(text()).toContain('Zamalek');
    });

    it.each(['abc', '0', '-1'])('redirects to the list for the invalid id "%s"', async (id) => {
      await setup(undefined, id);

      expect(navigate).toHaveBeenCalledWith(['/main/branches']);
      expect(repo.byId).not.toHaveBeenCalled();
    });

    it('puts the branch name in the breadcrumb trail', async () => {
      repo = new FakeRepository();
      TestBed.configureTestingModule({
        imports: [BranchDetails, TranslateModule.forRoot()],
        providers: [
          provideRouter([]),
          { provide: BRANCH_REPOSITORY, useValue: repo },
          { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: '5' }) } } },
          { provide: AuthService, useValue: { hasPermission: () => true } },
        ],
      });
      const crumbs = vi.spyOn(TestBed.inject(BreadcrumbService), 'setBreadcrumbs');
      fixture = TestBed.createComponent(BranchDetails);
      await settle();

      expect(crumbs.mock.calls[0][0].map((c) => c.label)).toEqual(['LAYOUT.NAV.DASHBOARD', 'LAYOUT.NAV.BRANCHES', 'Zamalek']);
    });
  });

  describe('content', () => {
    it('leads with the English name and shows Arabic as the subtitle', async () => {
      await setup();

      expect(el().querySelector('app-page-header')?.textContent).toContain('Zamalek');
      expect(el().querySelector('app-page-header')?.textContent).toContain('الزمالك');
    });

    it('leads with the Arabic name in Arabic', async () => {
      await setup(undefined, '5', 'ar');

      const title = el().querySelector('app-page-header h1')?.textContent ?? '';
      expect(title).toContain('الزمالك');
    });

    it('shows address, phone (left-to-right) and an external map link', async () => {
      await setup();

      expect(text()).toContain('8 Hassan Sabry St, Zamalek');
      expect(el().querySelector('.fact .u-num')?.getAttribute('dir')).toBe('ltr');
      expect(el().querySelector('.fact .u-num')?.textContent).toContain('+201020304050');

      const link = el().querySelector<HTMLAnchorElement>('a.link')!;
      expect(link.getAttribute('href')).toBe('https://maps.example/z');
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toContain('noopener');
    });

    it('says so when there is no map link', async () => {
      repo = new FakeRepository();
      repo.byId.mockReturnValue(of(ok({ ...BRANCH, mapUrl: null })));
      await setup();

      expect(el().querySelector('a.link')).toBeNull();
      expect(text()).toContain('BRANCHES.DETAILS.NO_MAP');
    });

    it('shows a badge for each enabled booking type only', async () => {
      await setup();
      const badges = el().querySelector('.badges')?.textContent ?? '';

      expect(badges).toContain('BRANCHES.TYPE.REGULAR');
      expect(badges).toContain('BRANCHES.TYPE.HOME');
      expect(badges).not.toContain('BRANCHES.TYPE.VIP');
    });

    it('says so when no booking type is enabled', async () => {
      repo = new FakeRepository();
      repo.byId.mockReturnValue(of(ok({ ...BRANCH, allowsRegular: false, allowsHome: false })));
      await setup();

      expect(text()).toContain('BRANCHES.DETAILS.NO_BOOKING_TYPES');
    });

    it('lists working hours Saturday-first, with closed days marked and seconds trimmed', async () => {
      await setup();
      const rows = Array.from(el().querySelectorAll('.hours__row'));

      expect(rows.map((r) => r.querySelector('.hours__day')?.textContent?.trim())).toEqual([
        'BRANCHES.DAYS.Saturday', 'BRANCHES.DAYS.Monday', 'BRANCHES.DAYS.Friday',
      ]);
      expect(rows[0].textContent).toContain('10:00 – 22:00');
      expect(rows[2].classList).toContain('hours__row--closed');
      expect(rows[2].textContent).toContain('BRANCHES.FORM.DAY_OFF');
    });

    it('flags a day that closes after midnight', async () => {
      await setup();
      const rows = Array.from(el().querySelectorAll('.hours__row'));

      expect(rows[1].textContent).toContain('18:00 – 02:00');
      expect(rows[1].textContent).toContain('BRANCHES.DETAILS.OVERNIGHT');
      expect(rows[0].textContent).not.toContain('BRANCHES.DETAILS.OVERNIGHT');
    });

    it('shows created and updated dates, or "not updated yet"', async () => {
      await setup();
      expect(text()).toContain('2026');
      expect(text()).not.toContain('BRANCHES.DETAILS.NOT_UPDATED');
    });

    it('says "not updated yet" for a never-edited branch', async () => {
      repo = new FakeRepository();
      repo.byId.mockReturnValue(of(ok({ ...BRANCH, updatedAt: null })));
      await setup();

      expect(text()).toContain('BRANCHES.DETAILS.NOT_UPDATED');
    });

    it('shows the visibility badge', async () => {
      await setup();
      expect(el().querySelector('.summary app-status-badge')?.textContent).toContain('BRANCHES.STATUS.VISIBLE');

      TestBed.resetTestingModule();
      repo = new FakeRepository();
      repo.byId.mockReturnValue(of(ok({ ...BRANCH, isVisible: false })));
      await setup();
      expect(el().querySelector('.summary app-status-badge')?.textContent).toContain('BRANCHES.STATUS.HIDDEN');
    });
  });

  describe('permissions', () => {
    it('offers no actions with Branch.View only — just the badge', async () => {
      await setup(['Branch.View']);

      expect(headerButtons().length).toBe(0);
      expect(statusSwitch()).toBeNull();
      expect(el().querySelector('.summary app-status-badge')).not.toBeNull();
    });

    it('offers Edit and the switch with Branch.Edit, but not Delete', async () => {
      await setup(['Branch.View', 'Branch.Edit']);

      expect(headerButtons().map((b) => b.textContent?.trim())).toEqual(['COMMON.EDIT']);
      expect(statusSwitch()).not.toBeNull();
    });

    it('offers Delete with Branch.Delete, but not Edit or the switch', async () => {
      await setup(['Branch.View', 'Branch.Delete']);

      expect(headerButtons().map((b) => b.textContent?.trim())).toEqual(['COMMON.DELETE']);
      expect(statusSwitch()).toBeNull();
    });
  });

  describe('edit', () => {
    it('opens the edit page of this branch', async () => {
      await setup();
      headerButtons()[0].click();

      expect(navigate).toHaveBeenCalledWith(['/main/branches', 5, 'edit']);
    });
  });

  describe('show / hide in the app', () => {
    it('reflects the current visibility in the switch', async () => {
      await setup();
      expect(statusSwitch()?.getAttribute('aria-checked')).toBe('true');
    });

    it('toggles the branch, then re-reads it so the badge reflects the server', async () => {
      await setup();
      repo.byId.mockReturnValue(of(ok({ ...BRANCH, isVisible: false })));

      statusSwitch()!.click();
      await settle();

      expect(repo.toggle).toHaveBeenCalledWith(5);
      expect(repo.byId).toHaveBeenCalledTimes(2);
      expect(statusSwitch()?.getAttribute('aria-checked')).toBe('false');
      expect(el().querySelector('.summary app-status-badge')?.textContent).toContain('BRANCHES.STATUS.HIDDEN');
    });

    it('keeps the old state and does not re-read when the API refuses (e.g. no active barber)', async () => {
      await setup();
      repo.toggle.mockReturnValue(throwError(() => new Error('400')));

      statusSwitch()!.click();
      await settle();

      expect(repo.byId).toHaveBeenCalledTimes(1);
      expect(statusSwitch()?.getAttribute('aria-checked')).toBe('true');
    });

    it('ignores a second click while the first is in flight', async () => {
      await setup();
      const pending = new Subject<ApiResponse<null>>();
      repo.toggle.mockReturnValue(pending);

      statusSwitch()!.click();
      statusSwitch()!.click();

      expect(repo.toggle).toHaveBeenCalledTimes(1);
    });
  });

  describe('delete', () => {
    it('asks for confirmation first, naming the branch, and sends nothing yet', async () => {
      await setup();
      headerButtons()[1].click();
      await settle();

      expect(dialog()).not.toBeNull();
      expect(dialog()?.textContent).toContain('BRANCHES.DELETE.TITLE');
      expect(repo.remove).not.toHaveBeenCalled();
    });

    it('Cancel closes the dialog and keeps the branch', async () => {
      await setup();
      headerButtons()[1].click();
      await settle();
      dialogButton(0).click();
      await settle();

      expect(dialog()).toBeNull();
      expect(repo.remove).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
    });

    it('Confirm deletes this branch and returns to the list', async () => {
      await setup();
      headerButtons()[1].click();
      await settle();
      dialogButton(1).click();
      await settle();

      expect(repo.remove).toHaveBeenCalledWith({ ids: [5] });
      expect(navigate).toHaveBeenCalledWith(['/main/branches']);
      expect(dialog()).toBeNull();
    });

    it('stays on the page with the dialog open when the delete is blocked (409)', async () => {
      await setup();
      repo.remove.mockReturnValue(throwError(() => new Error('409')));
      headerButtons()[1].click();
      await settle();
      dialogButton(1).click();
      await settle();

      expect(navigate).not.toHaveBeenCalled();
      expect(dialog()).not.toBeNull();
    });
  });
});
