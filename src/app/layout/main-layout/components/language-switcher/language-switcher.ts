import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  inject,
  signal,
} from "@angular/core";
import { TranslateModule } from "@ngx-translate/core";
import { LanguageService, AppLang } from "../../../../core/services/language.service";

interface LangOption {
  code: AppLang;
  label: string;
  nativeLabel: string;
}

/**
 * LanguageSwitcher
 *
 * Small dropdown placed in the header (next to the notifications icon)
 * that lets the user switch between English and Arabic. Delegates the
 * actual switching — including <html dir>/[lang] updates and persistence —
 * to LanguageService.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: "app-language-switcher",
  standalone: true,
  imports: [TranslateModule],
  templateUrl: "./language-switcher.html",
  styleUrl: "./language-switcher.scss",
})
export class LanguageSwitcher {
  private readonly _elementRef = inject(ElementRef);
  protected readonly languageService = inject(LanguageService);

  protected readonly isOpen = signal(false);

  protected readonly options: LangOption[] = [
    { code: "en", label: "English", nativeLabel: "EN" },
    { code: "ar", label: "العربية", nativeLabel: "AR" },
  ];

  protected readonly currentOption = () =>
    this.options.find((o) => o.code === this.languageService.currentLang()) ??
    this.options[0];

  protected toggle(): void {
    this.isOpen.update((v) => !v);
  }

  protected select(option: LangOption): void {
    if (option.code !== this.languageService.currentLang()) {
      this.languageService.setLang(option.code);
    }
    this.isOpen.set(false);
  }

  @HostListener("document:click", ["$event"])
  protected onDocumentClick(event: MouseEvent): void {
    if (!this._elementRef.nativeElement.contains(event.target)) {
      this.isOpen.set(false);
    }
  }

  @HostListener("document:keydown.escape")
  protected onEscape(): void {
    this.isOpen.set(false);
  }
}
