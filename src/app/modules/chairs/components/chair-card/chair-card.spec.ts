import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LanguageService } from '@core/services/language.service';
import { ChairListItem, ChairType } from '../../model/chair.model';
import { ChairCard } from './chair-card';

const CHAIR: ChairListItem = {
  id: 12, branchId: 3, branchNameAr: 'مدينة نصر', branchNameEn: 'Nasr City',
  name: 'V1', type: ChairType.Vip, isActive: true,
};

describe('ChairCard', () => {
  let fixture: ComponentFixture<ChairCard>;

  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => el().textContent ?? '';
  const button = (label: string) => el().querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  const changeTypeButton = () =>
    Array.from(el().querySelectorAll<HTMLButtonElement>('button')).find((b) => (b.textContent ?? '').includes('CHAIRS.CHANGE_TYPE.ACTION'));
  const switchButton = () => el().querySelector<HTMLButtonElement>('app-switch button');
  const nameLink = () => el().querySelector<HTMLButtonElement>('.chair__link');

  async function setup(
    chair: ChairListItem = CHAIR,
    inputs: { canEdit?: boolean; canToggle?: boolean; canDelete?: boolean; busy?: boolean } = {},
  ) {
    TestBed.configureTestingModule({ imports: [ChairCard, TranslateModule.forRoot()] });
    TestBed.inject(TranslateService).use('en');
    fixture = TestBed.createComponent(ChairCard);
    fixture.componentRef.setInput('chair', chair);
    fixture.componentRef.setInput('canEdit', inputs.canEdit ?? false);
    fixture.componentRef.setInput('canToggle', inputs.canToggle ?? false);
    fixture.componentRef.setInput('canDelete', inputs.canDelete ?? false);
    fixture.componentRef.setInput('busy', inputs.busy ?? false);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  describe('content', () => {
    it('shows the name, the branch, the type and the status', async () => {
      await setup();

      expect(el().querySelector('.chair__name')?.textContent).toContain('V1');
      expect(text()).toContain('Nasr City');
      expect(text()).toContain('CHAIRS.TYPE.VIP');
      expect(text()).toContain('CHAIRS.STATUS.ACTIVE');
    });

    it('shows Regular for a regular chair', async () => {
      await setup({ ...CHAIR, type: ChairType.Regular });
      expect(text()).toContain('CHAIRS.TYPE.REGULAR');
      expect(text()).not.toContain('CHAIRS.TYPE.VIP');
    });

    it('marks an inactive chair', async () => {
      await setup({ ...CHAIR, isActive: false });

      expect(el().querySelector('.chair--inactive')).not.toBeNull();
      expect(text()).toContain('CHAIRS.STATUS.INACTIVE');
    });

    it('does not mark an active chair as inactive', async () => {
      await setup();
      expect(el().querySelector('.chair--inactive')).toBeNull();
    });

    it('shows the branch name in Arabic when the UI is Arabic', async () => {
      TestBed.configureTestingModule({ imports: [ChairCard, TranslateModule.forRoot()] });
      TestBed.inject(LanguageService).setLang('ar');
      fixture = TestBed.createComponent(ChairCard);
      fixture.componentRef.setInput('chair', CHAIR);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(text()).toContain('مدينة نصر');
      expect(text()).not.toContain('Nasr City');
    });
  });

  describe('permissions', () => {
    it('a view-only card has no footer, no change-type button and a plain-text name', async () => {
      await setup();

      expect(el().querySelector('.chair__footer')).toBeNull();
      expect(switchButton()).toBeNull();
      expect(changeTypeButton()).toBeUndefined();
      expect(nameLink()).toBeNull();
    });

    it('canToggle alone shows the switch and no action buttons', async () => {
      await setup(CHAIR, { canToggle: true });

      expect(switchButton()).not.toBeNull();
      expect(button('COMMON.EDIT')).toBeNull();
      expect(button('COMMON.DELETE')).toBeNull();
      expect(changeTypeButton()).toBeUndefined();
      expect(nameLink()).toBeNull();
    });

    it('canEdit shows edit, change type and the name link — but no switch or delete', async () => {
      await setup(CHAIR, { canEdit: true });

      expect(button('COMMON.EDIT')).not.toBeNull();
      expect(changeTypeButton()).toBeDefined();
      expect(nameLink()).not.toBeNull();
      expect(switchButton()).toBeNull();
      expect(button('COMMON.DELETE')).toBeNull();
    });

    it('canDelete alone shows only delete', async () => {
      await setup(CHAIR, { canDelete: true });

      expect(button('COMMON.DELETE')).not.toBeNull();
      expect(button('COMMON.EDIT')).toBeNull();
      expect(switchButton()).toBeNull();
    });

    it('keeps the actions at the end when the switch is hidden', async () => {
      await setup(CHAIR, { canEdit: true, canDelete: true });
      expect(el().querySelector('.chair__availability')).toBeNull();
      expect(el().querySelector('.chair__actions')).not.toBeNull();
    });
  });

  describe('switch', () => {
    it('reflects isActive and is labelled for screen readers', async () => {
      await setup(CHAIR, { canToggle: true });
      expect(switchButton()!.getAttribute('aria-checked')).toBe('true');
      expect(switchButton()!.getAttribute('aria-label')).toBe('CHAIRS.SWITCH.LABEL');
    });

    it('is off for an inactive chair', async () => {
      await setup({ ...CHAIR, isActive: false }, { canToggle: true });
      expect(switchButton()!.getAttribute('aria-checked')).toBe('false');
    });

    it('asks the parent to toggle, without changing its own state', async () => {
      await setup(CHAIR, { canToggle: true });
      const toggled = vi.fn();
      fixture.componentInstance.toggleStatus.subscribe(toggled);

      switchButton()!.click();
      fixture.detectChanges();

      expect(toggled).toHaveBeenCalledWith(CHAIR);
      expect(switchButton()!.getAttribute('aria-checked')).toBe('true'); // controlled: only the parent can flip it
    });

    it('is disabled while a mutation is running', async () => {
      await setup(CHAIR, { canToggle: true, busy: true });
      expect(switchButton()!.disabled).toBe(true);
    });
  });

  describe('events', () => {
    it('emits edit from the pencil and from the name', async () => {
      await setup(CHAIR, { canEdit: true });
      const edit = vi.fn();
      fixture.componentInstance.edit.subscribe(edit);

      button('COMMON.EDIT')!.click();
      nameLink()!.click();

      expect(edit).toHaveBeenCalledTimes(2);
      expect(edit).toHaveBeenCalledWith(CHAIR);
    });

    it('emits changeType', async () => {
      await setup(CHAIR, { canEdit: true });
      const changeType = vi.fn();
      fixture.componentInstance.changeType.subscribe(changeType);

      changeTypeButton()!.click();
      expect(changeType).toHaveBeenCalledWith(CHAIR);
    });

    it('emits delete', async () => {
      await setup(CHAIR, { canDelete: true });
      const remove = vi.fn();
      fixture.componentInstance.delete.subscribe(remove);

      button('COMMON.DELETE')!.click();
      expect(remove).toHaveBeenCalledWith(CHAIR);
    });

    it('disables change type while a mutation is running', async () => {
      await setup(CHAIR, { canEdit: true, busy: true });
      expect(changeTypeButton()!.disabled).toBe(true);
    });
  });
});
