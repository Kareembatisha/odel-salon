import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

import { AppToast } from '../../shared/components/app-toast/app-toast';
import { LanguageService } from '../../core/services/language.service';
import { ThemeService } from '../../core/services/theme.service';
import { BRAND } from '../../core/brand/brand';

/** Signed-out shell: brand panel + centered card. Language and theme can be changed before signing in. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-auth-layout',
  standalone: true,
  imports: [RouterOutlet, AppToast, TranslateModule],
  templateUrl: './auth-layout.html',
  styleUrl: './auth-layout.scss',
})
export class AuthLayout {
  protected readonly lang = inject(LanguageService);
  protected readonly theme = inject(ThemeService);
  protected readonly brand = BRAND;
  protected readonly year = new Date().getFullYear();

  constructor() {
    effect(() => {
      document.documentElement.setAttribute('dir', this.lang.direction());
      document.documentElement.setAttribute('lang', this.lang.currentLang());
    });
  }
}
