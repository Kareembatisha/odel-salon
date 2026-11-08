import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { TranslateModule } from "@ngx-translate/core";

import { AppButtonComponent } from "@shared/components/app-button/app-button.component";

/** 404 — works signed in or out; inside the admin shell it fits the content area instead of a full screen. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: "app-not-found",
  standalone: true,
  imports: [TranslateModule, AppButtonComponent],
  template: `
    <main class="nf">
      <p class="nf__code u-num" aria-hidden="true">404</p>
      <h1 class="nf__title">{{ 'NOT_FOUND.TITLE' | translate }}</h1>
      <p class="nf__text">{{ 'NOT_FOUND.DESCRIPTION' | translate }}</p>
      <app-button variant="primary" size="lg" (clicked)="home()">{{ 'NOT_FOUND.BACK_HOME' | translate }}</app-button>
    </main>
  `,
  styleUrl: "./not-found.scss",
  host: { "[class.nf-host--shell]": "inShell" },
})
export class NotFound {
  private readonly router = inject(Router);
  /** True when rendered inside the admin shell (route data), false for the standalone root 404. */
  protected readonly inShell = !!inject(ActivatedRoute).snapshot.data["inShell"];
  protected home(): void {
    this.router.navigateByUrl("/main");
  }
}
