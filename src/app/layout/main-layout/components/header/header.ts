import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  inject,
  signal,
} from "@angular/core";
import { Router, RouterLink } from "@angular/router";
import { TranslateModule } from "@ngx-translate/core";

import { AuthService } from "../../../../modules/auth/service/auth.service";
import { AvatarComponent } from "@shared/components/avatar/avatar.component";
import { SidebarService } from "../sidebar/sidebar.service";
import { BreadcrumbService } from "./breadcrumb.service";
import { LanguageSwitcher } from "../language-switcher/language-switcher";
import { ThemeSwitcher } from "../theme-switcher/theme-switcher";

/** Top bar: sidebar toggle, breadcrumbs, language, theme, notifications, profile menu. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: "app-header",
  standalone: true,
  imports: [RouterLink, TranslateModule, LanguageSwitcher, ThemeSwitcher, AvatarComponent],
  templateUrl: "./header.html",
  styleUrl: "./header.scss",
})
export class Header {
  private readonly el = inject(ElementRef);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  protected readonly sidebar = inject(SidebarService);
  protected readonly breadcrumbs = inject(BreadcrumbService).getBreadcrumbs();

  protected readonly user = this.auth.currentUser;
  protected readonly role = this.auth.role;
  protected readonly menuOpen = signal(false);

  protected toggleSidebar(): void {
    // Wide screens collapse to the rail; narrow screens open the off-canvas drawer.
    if (window.innerWidth <= 900) this.sidebar.toggleMobile();
    else this.sidebar.toggle();
  }

  protected toggleMenu(): void {
    this.menuOpen.update((v) => !v);
  }

  protected goTo(path: string): void {
    this.menuOpen.set(false);
    this.router.navigateByUrl(path);
  }

  protected logout(): void {
    this.menuOpen.set(false);
    this.auth.logout().subscribe(() => this.router.navigate(["/login"]));
  }

  @HostListener("document:click", ["$event"])
  protected onDocumentClick(event: MouseEvent): void {
    if (!this.el.nativeElement.contains(event.target)) this.menuOpen.set(false);
  }

  @HostListener("document:keydown.escape")
  protected onEscape(): void {
    this.menuOpen.set(false);
  }
}
