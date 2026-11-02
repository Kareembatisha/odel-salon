import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    TestBed.configureTestingModule({});
  });

  it('defaults to light', () => {
    const service = TestBed.inject(ThemeService);
    expect(service.mode()).toBe('light');
    expect(service.isDark()).toBe(false);
  });

  it('toggles, persists and applies data-theme', () => {
    const service = TestBed.inject(ThemeService);
    service.toggle();
    TestBed.tick();
    expect(service.mode()).toBe('dark');
    expect(localStorage.getItem('odl_theme')).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});
