import { FormArray, FormBuilder, FormControl, FormGroup } from '@angular/forms';
import { describe, expect, it } from 'vitest';

import { BranchDayOfWeek } from '../model/branch.model';
import { BRANCH_DAYS, createBranchForm, createWorkingHourGroup, createWorkingHours } from './branch-form.factory';

const fb = new FormBuilder();

describe('BRANCH_DAYS', () => {
  it('lists all seven days exactly once, starting on Saturday', () => {
    expect(BRANCH_DAYS.length).toBe(7);
    expect(new Set(BRANCH_DAYS).size).toBe(7);
    expect(BRANCH_DAYS[0]).toBe(BranchDayOfWeek.Saturday);
    expect(BRANCH_DAYS[6]).toBe(BranchDayOfWeek.Friday);
  });
});

describe('createWorkingHourGroup', () => {
  it('starts closed with no times', () => {
    const g = createWorkingHourGroup(fb, BranchDayOfWeek.Monday);

    expect(g.getRawValue()).toEqual({ dayOfWeek: BranchDayOfWeek.Monday, isOpen: false, openTime: null, closeTime: null });
    expect(g.valid).toBe(true);
  });

  it('becomes invalid when opened without times and valid once they are set', () => {
    const g = createWorkingHourGroup(fb, BranchDayOfWeek.Monday);

    g.patchValue({ isOpen: true });
    expect(g.hasError('requiredTimes')).toBe(true);

    g.patchValue({ openTime: '10:00', closeTime: '22:00' });
    expect(g.valid).toBe(true);
  });
});

describe('createWorkingHours', () => {
  it('creates one group per day in display order', () => {
    const arr = createWorkingHours(fb);

    expect(arr.length).toBe(7);
    expect(arr.controls.map((c) => c.get('dayOfWeek')?.value)).toEqual(BRANCH_DAYS);
  });
});

describe('createBranchForm', () => {
  const setup = () => {
    const form = createBranchForm(fb);
    const basic = form.get('basicInfo') as FormGroup;
    const fill = (over: Record<string, unknown> = {}) =>
      basic.patchValue({ nameAr: 'فرع', nameEn: 'Branch', address: 'Somewhere', phone: '+201001102194', mapUrl: '', ...over });
    return { form, basic, fill };
  };

  it('has the three sections', () => {
    const { form } = setup();

    expect(Object.keys(form.controls)).toEqual(['basicInfo', 'bookingTypes', 'workingHours']);
    expect(form.get('workingHours')).toBeInstanceOf(FormArray);
  });

  it('starts invalid: required fields are empty and no booking type is chosen', () => {
    const { form } = setup();

    expect(form.invalid).toBe(true);
    expect(form.get('bookingTypes')?.hasError('atLeastOneRequired')).toBe(true);
  });

  it('becomes valid with the required fields and one booking type — every day may stay closed', () => {
    const { form, fill } = setup();

    fill();
    form.get('bookingTypes')?.patchValue({ allowsHome: true });

    expect(form.valid).toBe(true);
  });

  it.each(['nameAr', 'nameEn', 'address', 'phone'])('%s is required', (name) => {
    const { basic, fill } = setup();
    fill({ [name]: '' });

    expect(basic.get(name)?.hasError('required')).toBe(true);
  });

  it('limits names to 100 characters and the address to 250', () => {
    const { basic, fill } = setup();

    fill({ nameAr: 'ا'.repeat(101), nameEn: 'a'.repeat(101), address: 'a'.repeat(251) });
    expect(basic.get('nameAr')?.hasError('maxlength')).toBe(true);
    expect(basic.get('nameEn')?.hasError('maxlength')).toBe(true);
    expect(basic.get('address')?.hasError('maxlength')).toBe(true);

    fill({ nameAr: 'ا'.repeat(100), nameEn: 'a'.repeat(100), address: 'a'.repeat(250) });
    expect(basic.valid).toBe(true);
  });

  describe('phone', () => {
    const valid = (phone: string) => {
      const { basic, fill } = setup();
      fill({ phone });
      return !basic.get('phone')?.invalid;
    };

    it('accepts Egyptian mobile numbers (+2010 / 011 / 012 / 015)', () => {
      ['+201001102194', '+201112345678', '+201212345678', '+201512345678'].forEach((p) => expect(valid(p)).toBe(true));
    });

    it('rejects anything else', () => {
      ['01001102194', '+20100110219', '+2010011021945', '+201312345678', '+971501234567', '+20 100 110 2194', 'abc'].forEach((p) =>
        expect(valid(p)).toBe(false),
      );
    });
  });

  it('validates the map link only when one is entered', () => {
    const { basic, fill } = setup();

    fill({ mapUrl: '' });
    expect(basic.get('mapUrl')?.valid).toBe(true);

    fill({ mapUrl: 'nope' });
    expect(basic.get('mapUrl')?.hasError('invalidUrl')).toBe(true);
  });

  it('rejects the form while any open day is incomplete', () => {
    const { form, fill } = setup();
    fill();
    form.get('bookingTypes')?.patchValue({ allowsRegular: true });
    expect(form.valid).toBe(true);

    const day = (form.get('workingHours') as FormArray).at(0);
    day.patchValue({ isOpen: true });
    expect(form.invalid).toBe(true);

    day.patchValue({ openTime: '09:00', closeTime: '23:00' });
    expect(form.valid).toBe(true);
  });

  it('exposes raw values even when a control is disabled', () => {
    const { form } = setup();

    (form.get('basicInfo.nameEn') as FormControl).disable();
    expect(form.getRawValue().basicInfo).toHaveProperty('nameEn');
  });
});
