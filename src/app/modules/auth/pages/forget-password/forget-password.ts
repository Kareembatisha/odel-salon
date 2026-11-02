import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

import { FloatLabelInput } from '../../../../shared/components/float-label-input/float-label-input';
import { AuthService } from '../../service/auth.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-forget-password',
  standalone: true,
  imports: [ReactiveFormsModule, TranslateModule, FloatLabelInput],
  templateUrl: './forget-password.html',
  styleUrl: './forget-password.scss',
})
export class ForgetPassword {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  protected readonly authService = inject(AuthService);

  protected readonly loading = this.authService.loading;

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  protected get email() { return this.form.controls.email; }

  protected onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { email } = this.form.getRawValue();

    this.authService.forgotPassword({ email }).subscribe((success) => {
      if (success) this.router.navigate(['/email-verification'], { queryParams: { email } });
    });
  }

  protected backToLogin(): void {
    this.router.navigate(['/login']);
  }
}
