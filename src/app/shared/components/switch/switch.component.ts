import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/** On/off switch (role="switch"). Controlled: the parent owns `checked` and reacts to `toggled`. */
@Component({
  selector: 'app-switch',
  standalone: true,
  template: `
    <button
      type="button"
      class="sw"
      role="switch"
      [class.sw--on]="checked()"
      [attr.aria-checked]="checked()"
      [attr.aria-label]="label()"
      [disabled]="disabled()"
      (click)="toggled.emit(!checked())"
    ><span class="sw__thumb"></span></button>
  `,
  styleUrl: './switch.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SwitchComponent {
  checked = input<boolean>(false);
  disabled = input<boolean>(false);
  /** Accessible name — there is no visible text. */
  label = input<string>('');
  toggled = output<boolean>();
}
