import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { TranslateService } from '@ngx-translate/core';

import { BRAND } from './core/brand/brand';
import { LanguageService } from './core/services/language.service';
import { ThemeService } from './core/services/theme.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'odl-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `<router-outlet />`,
})
export class AppComponent implements OnInit {
  private readonly translate = inject(TranslateService);
  private readonly languageService = inject(LanguageService);
  private readonly title = inject(Title);
  // Injected for its side effect: applies the persisted theme on startup.
  private readonly theme = inject(ThemeService);

  ngOnInit(): void {
    this.translate.addLangs(['en', 'ar']);
    // applyLang() switches ngx-translate AND syncs <html lang>/[dir], so the very
    // first render reflects the persisted language/direction.
    this.languageService.applyLang(this.languageService.currentLang());
    this.title.setTitle(`${BRAND.name} — Admin`);
  }
}
