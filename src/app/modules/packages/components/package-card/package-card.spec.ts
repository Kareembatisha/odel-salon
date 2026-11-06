import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LanguageService } from '@core/services/language.service';
import { PackageListItem } from '../../model/package.model';
import { PackageCard } from './package-card';

const PKG: PackageListItem = {
  id: 1, branchId: 3, nameAr: '[AR] Classic Groom', nameEn: 'Classic Groom',
  regularPrice: 210, vipPrice: 330, homePrice: null, isActive: true,
  services: [
    { serviceId: 1, nameAr: '[AR] Haircut', nameEn: 'Haircut' },
    { serviceId: 2, nameAr: '[AR] Beard trim', nameEn: 'Beard trim' },
  ],
  originalRegularPrice: 230, originalVipPrice: 390, originalHomePrice: null, durationMinutes: 60,
};

describe('PackageCard', () => {
  let fixture: ComponentFixture<PackageCard>;

  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => el().textContent ?? '';
  const rows = () => Array.from(el().querySelectorAll<HTMLElement>('.pkg__price-row'));
  const button = (label: string) => el().querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  const switchButton = () => el().querySelector<HTMLButtonElement>('app-switch button');
  const nameLink = () => el().querySelector<HTMLButtonElement>('.pkg__link');

  async function setup(
    pkg: PackageListItem = PKG,
    inputs: { canEdit?: boolean; canDelete?: boolean; busy?: boolean } = {},
    lang = 'en',
  ) {
    TestBed.configureTestingModule({ imports: [PackageCard, TranslateModule.forRoot()] });
    TestBed.inject(TranslateService).use('en');
    TestBed.inject(LanguageService).setLang(lang as 'en' | 'ar');
    fixture = TestBed.createComponent(PackageCard);
    fixture.componentRef.setInput('pkg', pkg);
    fixture.componentRef.setInput('canEdit', inputs.canEdit ?? false);
    fixture.componentRef.setInput('canDelete', inputs.canDelete ?? false);
    fixture.componentRef.setInput('busy', inputs.busy ?? false);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  describe('content', () => {
    it('shows the name, the other-language name, the services and the status', async () => {
      await setup();

      expect(el().querySelector('.pkg__name')?.textContent).toContain('Classic Groom');
      expect(el().querySelector('.pkg__other-name')?.textContent).toContain('[AR] Classic Groom');
      expect(Array.from(el().querySelectorAll('.pkg__chip')).map((c) => c.textContent?.trim())).toEqual(['Haircut', 'Beard trim']);
      expect(text()).toContain('PACKAGES.STATUS.ACTIVE');
    });

    it('shows the total duration', async () => {
      await setup({ ...PKG, durationMinutes: 70 });
      expect(el().querySelector('.pkg__duration')?.textContent).toContain('1 SERVICES.UNITS.H 10 SERVICES.UNITS.MIN');
    });

    it('shows each price with the services total struck through and the saving', async () => {
      await setup();
      const [regular, vip] = rows();

      expect(regular.querySelector('.pkg__price')?.textContent).toContain('210');
      expect(regular.querySelector('.pkg__original')?.textContent).toContain('230');
      expect(vip.querySelector('.pkg__price')?.textContent).toContain('330');
      expect(vip.querySelector('.pkg__original')?.textContent).toContain('390');
      expect(el().querySelectorAll('.pkg__saving')).toHaveLength(2);
    });

    it('shows "In branch only" when there is no home price', async () => {
      await setup();
      const home = rows()[2];

      expect(home.textContent).toContain('PACKAGES.IN_BRANCH_ONLY');
      expect(home.querySelector('.pkg__price')).toBeNull();
    });

    it('shows the home price and its saving when the package has one', async () => {
      await setup({ ...PKG, homePrice: 620, originalHomePrice: 720 });
      const home = rows()[2];

      expect(home.querySelector('.pkg__price')?.textContent).toContain('620');
      expect(home.querySelector('.pkg__original')?.textContent).toContain('720');
      expect(home.textContent).not.toContain('PACKAGES.IN_BRANCH_ONLY');
    });

    it('shows no strikethrough or saving when the package is not cheaper than its services', async () => {
      await setup({ ...PKG, regularPrice: 230, vipPrice: 390 });
      expect(el().querySelectorAll('.pkg__original')).toHaveLength(0);
      expect(el().querySelectorAll('.pkg__saving')).toHaveLength(0);
    });

    it('marks an inactive package', async () => {
      await setup({ ...PKG, isActive: false });
      expect(text()).toContain('PACKAGES.STATUS.INACTIVE');
      expect(el().querySelector('.pkg--inactive')).not.toBeNull();
    });

    it('uses the Arabic names first when the UI is Arabic', async () => {
      await setup(PKG, {}, 'ar');
      expect(el().querySelector('.pkg__name')?.textContent).toContain('[AR] Classic Groom');
      expect(el().querySelector('.pkg__other-name')?.textContent).toContain('Classic Groom');
      expect(Array.from(el().querySelectorAll('.pkg__chip')).map((c) => c.textContent?.trim())).toEqual(['[AR] Haircut', '[AR] Beard trim']);
    });
  });

  describe('permissions', () => {
    it('is read-only without Edit and Delete: no switch, no buttons, no footer, plain name', async () => {
      await setup();
      expect(switchButton()).toBeNull();
      expect(button('COMMON.EDIT')).toBeNull();
      expect(button('COMMON.DELETE')).toBeNull();
      expect(el().querySelector('.pkg__footer')).toBeNull();
      expect(nameLink()).toBeNull();
    });

    it('Edit shows the switch, the pencil and the name link — but not delete', async () => {
      await setup(PKG, { canEdit: true });
      expect(switchButton()).not.toBeNull();
      expect(button('COMMON.EDIT')).not.toBeNull();
      expect(nameLink()).not.toBeNull();
      expect(button('COMMON.DELETE')).toBeNull();
    });

    it('Delete alone shows only the trash button', async () => {
      await setup(PKG, { canDelete: true });
      expect(button('COMMON.DELETE')).not.toBeNull();
      expect(switchButton()).toBeNull();
      expect(button('COMMON.EDIT')).toBeNull();
    });
  });

  describe('events', () => {
    it('emits edit from the pencil and from the name', async () => {
      await setup(PKG, { canEdit: true });
      const edits: PackageListItem[] = [];
      fixture.componentInstance.edit.subscribe((p) => edits.push(p));

      button('COMMON.EDIT')!.click();
      nameLink()!.click();
      expect(edits).toEqual([PKG, PKG]);
    });

    it('emits delete', async () => {
      await setup(PKG, { canDelete: true });
      let deleted: PackageListItem | null = null;
      fixture.componentInstance.delete.subscribe((p) => (deleted = p));
      button('COMMON.DELETE')!.click();
      expect(deleted).toBe(PKG);
    });

    it('asks to toggle but never flips the switch itself (it is controlled)', async () => {
      await setup(PKG, { canEdit: true });
      let toggled: PackageListItem | null = null;
      fixture.componentInstance.toggleStatus.subscribe((p) => (toggled = p));

      switchButton()!.click();
      fixture.detectChanges();

      expect(toggled).toBe(PKG);
      expect(switchButton()!.getAttribute('aria-checked')).toBe('true');
    });

    it('disables the switch while a mutation is running', async () => {
      await setup(PKG, { canEdit: true, busy: true });
      expect(switchButton()!.disabled).toBe(true);
    });
  });
});
