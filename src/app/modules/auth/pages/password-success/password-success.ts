import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-password-success',
  standalone: true,
  imports: [TranslateModule, DatePipe],
  templateUrl: './password-success.html',
  styleUrl: './password-success.scss',
})
export class PasswordSuccess {
  private readonly router = inject(Router);

  protected readonly changedAt: Date = new Date();

  protected goToLogin(): void {
    this.router.navigate(['/login']);
  }
}
