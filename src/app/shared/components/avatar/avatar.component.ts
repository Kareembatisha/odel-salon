import { ChangeDetectionStrategy, Component, computed, input, signal, effect } from '@angular/core';

import { initialsFor } from '../../utils/avatar.util';

export type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';

/**
 * Avatar — photo when there is one, brand-colored initials otherwise.
 * If the image fails to load (expired URL, offline) it falls back to initials
 * instead of showing a broken-image icon.
 */
@Component({
  selector: 'app-avatar',
  standalone: true,
  template: `
    @if (src() && !failed()) {
      <img class="av__img" [src]="src()" [alt]="name()" (error)="failed.set(true)" />
    } @else {
      <span class="av__initials" aria-hidden="true">{{ initials() }}</span>
      <span class="sr-only">{{ name() }}</span>
    }
  `,
  styleUrl: './avatar.component.scss',
  host: { '[class]': "'av av--' + size()" },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AvatarComponent {
  name = input<string>('');
  src = input<string | null | undefined>(null);
  size = input<AvatarSize>('md');

  protected readonly failed = signal(false);
  protected readonly initials = computed(() => initialsFor(this.name()));

  constructor() {
    // A new image URL deserves a fresh attempt.
    effect(() => {
      this.src();
      this.failed.set(false);
    });
  }
}
