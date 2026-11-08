import { ChangeDetectionStrategy, Component, DestroyRef, inject } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationStart,
  Router,
  RouterOutlet,
} from "@angular/router";

import { TranslateModule } from "@ngx-translate/core";
import { AppToast } from "@shared/components/app-toast/app-toast";
import { RouteLoadingService } from "@core/services/route-loading.service";
import { SidebarService } from "./components/sidebar/sidebar.service";
import { Header } from "./components/header/header";
import { Sidebar } from "./components/sidebar/sidebar";

/** Admin shell: sidebar + header + routed content, with a thin progress bar during lazy route loads. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: "app-main-layout",
  standalone: true,
  imports: [RouterOutlet, TranslateModule, AppToast, Header, Sidebar],
  templateUrl: "./main-layout.html",
  styleUrl: "./main-layout.scss",
})
export class MainLayout {
  protected readonly routeLoading = inject(RouteLoadingService);
  private readonly sidebar = inject(SidebarService);

  constructor() {
    const router = inject(Router);
    router.events.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe((event) => {
      if (event instanceof NavigationStart) this.routeLoading.start();
      else if (event instanceof NavigationEnd) {
        this.routeLoading.finish();
        this.sidebar.closeMobile();
      } else if (event instanceof NavigationCancel || event instanceof NavigationError)
        this.routeLoading.finish(0);
    });
  }
}
