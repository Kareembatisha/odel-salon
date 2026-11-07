import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TabItem, TabsComponent } from './tabs.component';

@Component({
  standalone: true,
  imports: [TabsComponent],
  template: `<app-tabs [tabs]="tabs" [value]="value()" ariaLabel="By status" idPrefix="st" panelId="panel" (changed)="changes.push($event)" />`,
})
class Host {
  tabs: TabItem[] = [
    { value: 'all', label: 'All', count: 5 },
    { value: 'active', label: 'Active', count: 0 },
    { value: 'ended', label: 'Ended or full' },
  ];
  value = signal('all');
  changes: string[] = [];
}

describe('TabsComponent', () => {
  let fixture: ComponentFixture<Host>;
  const buttons = () => Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('[role="tab"]'));
  const press = (key: string) => {
    const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    (document.activeElement as HTMLElement).dispatchEvent(e);
    return e;
  };

  /**
   * The arrow keys follow the page direction, which `LanguageService` sets on <html> — and which a
   * spec that ran earlier may have left on "rtl". Every test starts from an explicit direction.
   */
  const setDirection = (dir: 'ltr' | 'rtl') => document.documentElement.setAttribute('dir', dir);

  beforeEach(() => {
    setDirection('ltr');
    TestBed.configureTestingModule({ imports: [Host] });
    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
  });

  afterEach(() => setDirection('ltr'));

  it('renders a labelled tab list with one tab per item and a count pill when there is a count', () => {
    const list = (fixture.nativeElement as HTMLElement).querySelector('[role="tablist"]')!;
    expect(list.getAttribute('aria-label')).toBe('By status');
    expect(buttons().map((b) => b.querySelector('.tabs__label')!.textContent)).toEqual(['All', 'Active', 'Ended or full']);
    expect(buttons().map((b) => b.querySelector('.tabs__count')?.textContent ?? null)).toEqual(['5', '0', null]); // 0 is a real count
  });

  it('marks the selected tab and keeps only it in the tab order', () => {
    expect(buttons().map((b) => b.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
    expect(buttons().map((b) => b.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
    expect(buttons()[0].classList).toContain('tabs__tab--active');
  });

  it('gives each tab an id and points it at the panel', () => {
    expect(buttons()[1].id).toBe('st-active');
    expect(buttons()[1].getAttribute('aria-controls')).toBe('panel');
  });

  it('emits the clicked tab, but not the one that is already selected', () => {
    buttons()[1].click();
    buttons()[0].click();
    expect(fixture.componentInstance.changes).toEqual(['active']);
  });

  it('does not change the selection itself (controlled)', () => {
    buttons()[1].click();
    fixture.detectChanges();
    expect(buttons()[0].getAttribute('aria-selected')).toBe('true');
  });

  it('moves focus with the arrow keys (wrapping) without selecting', () => {
    buttons()[0].focus();
    press('ArrowRight');
    expect(document.activeElement).toBe(buttons()[1]);
    press('ArrowLeft');
    press('ArrowLeft');
    expect(document.activeElement).toBe(buttons()[2]); // wrapped to the end
    expect(fixture.componentInstance.changes).toEqual([]);
  });

  it('flips the arrow keys in a right-to-left page (ArrowLeft goes to the next tab)', () => {
    setDirection('rtl');
    buttons()[0].focus();
    press('ArrowLeft');
    expect(document.activeElement).toBe(buttons()[1]);
    press('ArrowRight');
    expect(document.activeElement).toBe(buttons()[0]);
  });

  it('jumps to the first / last tab with Home / End', () => {
    buttons()[1].focus();
    press('End');
    expect(document.activeElement).toBe(buttons()[2]);
    press('Home');
    expect(document.activeElement).toBe(buttons()[0]);
  });

  it('ignores other keys', () => {
    buttons()[0].focus();
    expect(press('a').defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(buttons()[0]);
  });
});
