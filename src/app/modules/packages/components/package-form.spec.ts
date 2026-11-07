import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Mock, beforeEach, describe, expect, it, vi } from 'vitest';

import { LanguageService } from '@core/services/language.service';
import { ServiceOption } from '../../services/model/service.model';
import { CreatePackagePayload, PackageDetails, UpdatePackagePayload } from '../model/package.model';
import { PackageForm } from './package-form';

const opt = (id: number, over: Partial<ServiceOption> = {}): ServiceOption => ({
  id, nameAr: `[AR] Service ${id}`, nameEn: `Service ${id}`, durationMinutes: 30,
  regularPrice: 100, vipPrice: 150, isHomeAvailable: false, homePrice: null, ...over,
});

/** 1 + 2 can be booked at home; 3 can't. Regular: 100 + 60 = 160, VIP: 150 + 100 = 250, Home: 200 + 120 = 320. */
const SERVICES: ServiceOption[] = [
  opt(1, { durationMinutes: 30, regularPrice: 100, vipPrice: 150, isHomeAvailable: true, homePrice: 200 }),
  opt(2, { durationMinutes: 15, regularPrice: 60, vipPrice: 100, isHomeAvailable: true, homePrice: 120 }),
  opt(3, { durationMinutes: 15, regularPrice: 50, vipPrice: 80 }),
];

const DETAILS: PackageDetails = {
  id: 7, branchId: 3, branchNameAr: 'مدينة نصر', branchNameEn: 'Nasr City',
  nameAr: '[AR] Gentleman', nameEn: 'Gentleman', regularPrice: 150, vipPrice: 240, homePrice: 300, isActive: true,
  services: [{ serviceId: 1, nameAr: '', nameEn: 'Service 1' }, { serviceId: 2, nameAr: '', nameEn: 'Service 2' }],
  originalRegularPrice: 160, originalVipPrice: 250, originalHomePrice: 320, durationMinutes: 45,
  createdAt: '2026-11-05T11:00:00Z', updatedAt: null,
};

describe('PackageForm', () => {
  let fixture: ComponentFixture<PackageForm>;
  let submitted: Mock<(payload: CreatePackagePayload | UpdatePackagePayload) => void>;
  let cancelled: Mock<() => void>;

  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => el().textContent ?? '';
  const inputs = () => Array.from(el().querySelectorAll<HTMLInputElement>('app-float-label-input input'));
  const field = (label: string) => el().querySelector<HTMLInputElement>(`app-float-label-input input[aria-label="${label}"]`);
  const checks = () => Array.from(el().querySelectorAll<HTMLInputElement>('.sp__check'));
  const submitButton = () => el().querySelector<HTMLButtonElement>('button[type="submit"]')!;

  async function settle() {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function setup(opts: {
    mode?: 'create' | 'edit';
    details?: PackageDetails | null;
    services?: ServiceOption[];
    saving?: boolean;
  } = {}) {
    TestBed.configureTestingModule({ imports: [PackageForm, TranslateModule.forRoot()] });
    TestBed.inject(TranslateService).use('en');
    TestBed.inject(LanguageService).setLang('en');
    fixture = TestBed.createComponent(PackageForm);
    fixture.componentRef.setInput('mode', opts.mode ?? 'create');
    fixture.componentRef.setInput('details', opts.details ?? null);
    fixture.componentRef.setInput('branchId', 3);
    fixture.componentRef.setInput('branchName', 'Nasr City');
    fixture.componentRef.setInput('services', opts.services ?? SERVICES);
    fixture.componentRef.setInput('saving', opts.saving ?? false);

    submitted = vi.fn<(payload: CreatePackagePayload | UpdatePackagePayload) => void>();
    cancelled = vi.fn<() => void>();
    fixture.componentInstance.submitted.subscribe((v) => submitted(v));
    fixture.componentInstance.cancelled.subscribe(() => cancelled());
    await settle();
  }

  async function type(label: string, value: string) {
    const input = field(label)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
    await settle();
  }

  async function pick(...ids: number[]) {
    for (const id of ids) {
      checks()[SERVICES.findIndex((s) => s.id === id)].click();
      await settle();
    }
  }

  async function fillNames() {
    await type('PACKAGES.FORM.NAME_AR', '  [AR] Brand New  ');
    await type('PACKAGES.FORM.NAME_EN', '  Brand New  ');
  }

  async function submit() {
    submitButton().click();
    await settle();
  }

  beforeEach(() => localStorage.clear());

  describe('create', () => {
    it('shows the fixed branch, empty fields and one checkbox per active service', async () => {
      await setup();
      expect(text()).toContain('Nasr City');
      expect(text()).toContain('PACKAGES.FORM.BRANCH_NOTE_CREATE');
      expect(inputs().every((i) => i.value === '')).toBe(true);
      expect(checks()).toHaveLength(3);
      expect(el().querySelector('.st')).toBeNull();
    });

    it('says so when the branch has no active services', async () => {
      await setup({ services: [] });
      expect(text()).toContain('SERVICE_PICKER.EMPTY');
      expect(checks()).toHaveLength(0);
    });

    it('shows the "Before discount" totals and duration of the chosen services', async () => {
      await setup();
      await pick(1, 2);

      const summary = el().querySelector('.st')!.textContent!;
      expect(summary).toContain('160'); // regular
      expect(summary).toContain('250'); // vip
      expect(summary).toContain('320'); // home — both services allow it
      expect(summary).toContain('45 SERVICES.UNITS.MIN');
    });

    it('has no home total once a service without home visits is chosen', async () => {
      await setup();
      await pick(1, 3);
      expect(el().querySelector('.st')!.textContent).not.toContain('SERVICE_PICKER.HOME');
    });
  });

  describe('validation', () => {
    it('does not emit an empty form and shows every message', async () => {
      await setup();
      await submit();

      expect(submitted).not.toHaveBeenCalled();
      for (const key of ['PACKAGES.FORM.NAME_REQUIRED', 'PACKAGES.FORM.SERVICES_MIN', 'PACKAGES.FORM.PRICE_REQUIRED']) {
        expect(text()).toContain(key);
      }
    });

    it('moves focus to the first invalid field after a failed submit', async () => {
      await setup();
      await submit();
      expect(document.activeElement).toBe(field('PACKAGES.FORM.NAME_AR'));
    });

    it('moves focus to the service picker when that is the first problem', async () => {
      await setup();
      await fillNames();
      await submit();
      expect(document.activeElement).toBe(checks()[0]);
    });

    it('needs at least 2 services', async () => {
      await setup();
      await fillNames();
      await pick(1);
      await type('PACKAGES.FORM.REGULAR_PRICE', '90');
      await type('PACKAGES.FORM.VIP_PRICE', '140');
      await submit();

      expect(submitted).not.toHaveBeenCalled();
      expect(text()).toContain('PACKAGES.FORM.SERVICES_MIN');

      await pick(2); // the error clears as soon as the selection is fine
      expect(text()).not.toContain('PACKAGES.FORM.SERVICES_MIN');
    });

    it('rejects a name longer than 100 characters', async () => {
      await setup();
      await type('PACKAGES.FORM.NAME_EN', 'x'.repeat(101));
      expect(text()).toContain('PACKAGES.FORM.NAME_MAX');
    });

    it('requires every price to be LOWER than the "Before discount" total', async () => {
      await setup();
      await pick(1, 2);

      await type('PACKAGES.FORM.REGULAR_PRICE', '160'); // equal to the total
      expect(text()).toContain('PACKAGES.FORM.PRICE_TOO_HIGH');

      await type('PACKAGES.FORM.REGULAR_PRICE', '159.99');
      expect(text()).not.toContain('PACKAGES.FORM.PRICE_TOO_HIGH');
    });

    it('re-checks the prices when the selection (and so the total) changes', async () => {
      await setup();
      await pick(1, 2);
      await type('PACKAGES.FORM.REGULAR_PRICE', '150'); // fine against 160
      expect(text()).not.toContain('PACKAGES.FORM.PRICE_TOO_HIGH');

      await pick(2); // total drops to 100
      expect(text()).toContain('PACKAGES.FORM.PRICE_TOO_HIGH');
    });

    it('rejects prices that are not > 0, above 100,000 or have more than 2 decimals', async () => {
      await setup();
      await pick(1, 2);

      for (const bad of ['0', '-5', '100001', '10.123']) {
        await type('PACKAGES.FORM.REGULAR_PRICE', bad);
        expect(text()).toContain('PACKAGES.FORM.PRICE_INVALID');
      }
      await type('PACKAGES.FORM.REGULAR_PRICE', '99.99');
      expect(text()).not.toContain('PACKAGES.FORM.PRICE_INVALID');
    });

    it('shows the saving under a price while it is valid', async () => {
      await setup();
      await pick(1, 2);
      await type('PACKAGES.FORM.REGULAR_PRICE', '140');

      const saving = el().querySelector('.pf__saving')!;
      expect(saving.textContent).toContain('PACKAGES.SAVE');
      expect(el().querySelectorAll('.pf__saving')).toHaveLength(1); // VIP is still empty
    });
  });

  describe('home price', () => {
    it('is offered only while every chosen service allows home visits', async () => {
      await setup();
      expect(field('PACKAGES.FORM.HOME_PRICE')).toBeNull();
      expect(text()).toContain('PACKAGES.FORM.HOME_UNAVAILABLE');

      await pick(1, 2);
      expect(field('PACKAGES.FORM.HOME_PRICE')).not.toBeNull();

      await pick(3);
      expect(field('PACKAGES.FORM.HOME_PRICE')).toBeNull();
    });

    it('must also be lower than the home total', async () => {
      await setup();
      await pick(1, 2);
      await type('PACKAGES.FORM.HOME_PRICE', '320');
      expect(text()).toContain('PACKAGES.FORM.PRICE_TOO_HIGH');
    });

    it('is optional — empty means "In branch only" (null)', async () => {
      await setup();
      await fillNames();
      await pick(1, 2);
      await type('PACKAGES.FORM.REGULAR_PRICE', '150');
      await type('PACKAGES.FORM.VIP_PRICE', '240');
      await submit();

      expect(submitted).toHaveBeenCalledTimes(1);
      expect(submitted.mock.calls[0][0].homePrice).toBeNull();
    });

    it('is dropped from the payload when a later selection makes it impossible', async () => {
      await setup();
      await fillNames();
      await pick(1, 2);
      await type('PACKAGES.FORM.REGULAR_PRICE', '150');
      await type('PACKAGES.FORM.VIP_PRICE', '240');
      await type('PACKAGES.FORM.HOME_PRICE', '300');
      await pick(2, 3); // services are now 1 + 3: no home visit possible, regular total 150, VIP 230
      await type('PACKAGES.FORM.REGULAR_PRICE', '140');
      await type('PACKAGES.FORM.VIP_PRICE', '220');
      await submit();

      expect(submitted).toHaveBeenCalledTimes(1);
      expect(submitted.mock.calls[0][0]).toMatchObject({ serviceIds: [1, 3], homePrice: null });
    });
  });

  describe('submit (create)', () => {
    it('emits the create payload: branch, trimmed names, numbers, services in the order chosen', async () => {
      await setup();
      await fillNames();
      await pick(2, 1);
      await type('PACKAGES.FORM.REGULAR_PRICE', '150');
      await type('PACKAGES.FORM.VIP_PRICE', '240.5');
      await type('PACKAGES.FORM.HOME_PRICE', '300');
      await submit();

      expect(submitted).toHaveBeenCalledWith({
        branchId: 3, nameAr: '[AR] Brand New', nameEn: 'Brand New', serviceIds: [2, 1],
        regularPrice: 150, vipPrice: 240.5, homePrice: 300,
      });
    });

    it('ignores a submit while saving', async () => {
      await setup({ saving: true });
      await fillNames();
      await pick(1, 2);
      await type('PACKAGES.FORM.REGULAR_PRICE', '150');
      await type('PACKAGES.FORM.VIP_PRICE', '240');
      await submit();
      expect(submitted).not.toHaveBeenCalled();
    });

    it('emits cancelled from the cancel button', async () => {
      await setup();
      el().querySelector<HTMLButtonElement>('.pf__footer app-button:first-child button')!.click();
      expect(cancelled).toHaveBeenCalledTimes(1);
    });
  });

  describe('edit', () => {
    it('pre-fills names, services and prices, and says the branch is fixed', async () => {
      await setup({ mode: 'edit', details: DETAILS });

      expect(field('PACKAGES.FORM.NAME_EN')!.value).toBe('Gentleman');
      expect(field('PACKAGES.FORM.REGULAR_PRICE')!.value).toBe('150');
      expect(field('PACKAGES.FORM.HOME_PRICE')!.value).toBe('300');
      expect(checks().map((c) => c.checked)).toEqual([true, true, false]);
      expect(text()).toContain('PACKAGES.FORM.BRANCH_NOTE_EDIT');
    });

    it('emits the update payload WITHOUT branchId', async () => {
      await setup({ mode: 'edit', details: DETAILS });
      await type('PACKAGES.FORM.NAME_EN', 'Gentleman Plus');
      await submit();

      expect(submitted).toHaveBeenCalledWith({
        nameAr: '[AR] Gentleman', nameEn: 'Gentleman Plus', serviceIds: [1, 2],
        regularPrice: 150, vipPrice: 240, homePrice: 300,
      });
    });

    it('keeps "In branch only" packages in branch only', async () => {
      await setup({ mode: 'edit', details: { ...DETAILS, homePrice: null } });
      expect(field('PACKAGES.FORM.HOME_PRICE')!.value).toBe('');
      await submit();
      expect(submitted.mock.calls[0][0].homePrice).toBeNull();
    });

    it('lists a service that is no longer active, blocks saving until it is removed', async () => {
      const stale: PackageDetails = {
        ...DETAILS, homePrice: null,
        services: [{ serviceId: 1, nameAr: '', nameEn: 'Service 1' }, { serviceId: 9, nameAr: '', nameEn: 'Old service' }],
      };
      await setup({ mode: 'edit', details: stale });

      expect(text()).toContain('Old service');
      expect(text()).toContain('SERVICE_PICKER.UNAVAILABLE');
      expect(el().querySelector('.sp__service--unavailable')).not.toBeNull();

      await submit();
      expect(submitted).not.toHaveBeenCalled();
      expect(text()).toContain('PACKAGES.FORM.SERVICES_UNAVAILABLE');

      // Replace the stale service with an active one.
      checks()[checks().length - 1].click(); // uncheck "Old service"
      await settle();
      await pick(2);
      await type('PACKAGES.FORM.REGULAR_PRICE', '150');
      await type('PACKAGES.FORM.VIP_PRICE', '240');
      await submit();

      expect(submitted).toHaveBeenCalledTimes(1);
      expect(submitted.mock.calls[0][0].serviceIds).toEqual([1, 2]);
    });
  });
});

describe('PackageForm layout', () => {
  it('fills the drawer body and scrolls its fields (a long form must not grow past the screen)', async () => {
    TestBed.configureTestingModule({ imports: [PackageForm, TranslateModule.forRoot()] });
    TestBed.inject(TranslateService).use('en');
    const fixture = TestBed.createComponent(PackageForm);
    fixture.componentRef.setInput('mode', 'create');
    fixture.componentRef.setInput('branchId', 3);
    fixture.detectChanges();

    const host = getComputedStyle(fixture.nativeElement as HTMLElement);
    const body = getComputedStyle((fixture.nativeElement as HTMLElement).querySelector('.pf__body')!);

    expect(host.display).toBe('flex');
    expect(host.minHeight).toBe('0px');
    expect(body.overflowY).toBe('auto');
  });
});
