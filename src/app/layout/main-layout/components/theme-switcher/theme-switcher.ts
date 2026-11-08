import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { TranslateModule } from "@ngx-translate/core";

import { ThemeService } from "@core/services/theme.service";

/** Header button that flips light/dark. Exposes its state to assistive tech via aria-pressed. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: "app-theme-switcher",
  standalone: true,
  imports: [TranslateModule],
  template: `
    <button
      type="button"
      class="theme-btn"
      [attr.aria-pressed]="theme.isDark()"
      [attr.aria-label]="'LAYOUT.THEME' | translate"
      [attr.title]="(theme.isDark() ? 'LAYOUT.THEME_LIGHT' : 'LAYOUT.THEME_DARK') | translate"
      (click)="theme.toggle()"
    >
      <i [class]="theme.isDark() ? 'pi pi-sun' : 'pi pi-moon'" aria-hidden="true"></i>
    </button>
  `,
  styleUrl: "./theme-switcher.scss",
})
export class ThemeSwitcher {
  protected readonly theme = inject(ThemeService);
}
