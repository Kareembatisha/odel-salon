import { ChangeDetectionStrategy, Component, DestroyRef, inject, OnInit } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { MessageService } from "primeng/api";
import { ToastModule } from "primeng/toast";
import { TranslateService } from "@ngx-translate/core";

import { NotificationService, ToastMessage } from "@core/services/notification.service";
import { NetworkStatusService } from "@core/services/network-status.service";
import { LanguageService } from "@core/services/language.service";

/**
 * AppToast — bridge between NotificationService and PrimeNG <p-toast>.
 *
 * Provides its own MessageService (component injector — never root), subscribes
 * to NotificationService.message$, translates keys, and forwards to PrimeNG.
 * Place <app-toast /> once inside every layout shell (AuthLayout, MainLayout).
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: "app-toast",
  standalone: true,
  imports: [ToastModule],
  providers: [MessageService],
  template: `<p-toast [position]="language.isRtl() ? 'top-left' : 'top-right'" />`,
})
export class AppToast implements OnInit {
  private readonly _msg = inject(MessageService);
  private readonly _notify = inject(NotificationService);
  private readonly _translate = inject(TranslateService);
  private readonly _destroyRef = inject(DestroyRef);
  private readonly _networkStatus = inject(NetworkStatusService);
  protected readonly language = inject(LanguageService);

  ngOnInit(): void {
    // Starts the online/offline listener — <app-toast/> is mounted exactly once per active layout.
    this._networkStatus.start();

    // NotificationService is a root singleton but <app-toast/> is recreated on every layout
    // swap; takeUntilDestroyed prevents one leaked subscription per login/logout cycle.
    this._notify.message$
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe((msg: ToastMessage) => {
        if (msg.summary === "__clear__") {
          this._msg.clear();
          return;
        }
        this._msg.add({
          severity: msg.severity,
          summary: this._t(msg.summary),
          detail: msg.detail ? this._t(msg.detail) : undefined,
          life: msg.life,
          sticky: msg.sticky,
          closable: msg.closable,
        });
      });
  }

  private _t(key: string): string {
    const result = this._translate.instant(key);
    return result === key ? key : result;
  }
}
