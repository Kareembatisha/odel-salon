import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';

/**
 * Compact search box for list toolbars. Emits `search` after the user stops
 * typing (debounced) and immediately on Enter or when cleared.
 */
@Component({
  selector: 'app-search-input',
  standalone: true,
  template: `
    <label class="si">
      <i class="pi pi-search" aria-hidden="true"></i>
      <input
        type="search"
        [placeholder]="placeholder()"
        [attr.aria-label]="placeholder()"
        [value]="value()"
        (input)="onInput($event)"
        (keydown.enter)="flush()"
      />
      @if (value()) {
        <button type="button" class="si__clear" [attr.aria-label]="clearLabel()" (click)="clear()">
          <i class="pi pi-times" aria-hidden="true"></i>
        </button>
      }
    </label>
  `,
  styleUrl: './search-input.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchInputComponent {
  placeholder = input<string>('Search…');
  clearLabel = input<string>('Clear');
  debounceMs = input<number>(350);
  search = output<string>();

  protected readonly value = signal('');
  private timer: ReturnType<typeof setTimeout> | null = null;

  protected onInput(event: Event): void {
    const v = (event.target as HTMLInputElement).value;
    this.value.set(v);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.search.emit(v.trim()), this.debounceMs());
  }

  protected flush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.search.emit(this.value().trim());
  }

  protected clear(): void {
    this.value.set('');
    this.flush();
  }
}
