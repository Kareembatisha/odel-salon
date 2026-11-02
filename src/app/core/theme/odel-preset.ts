import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

/**
 * PrimeNG preset — maps PrimeNG's token system onto the Odel design system.
 *
 * Every color is a reference to the same CSS variables the SCSS tokens use
 * (emitted in styles/_theme.scss from the build-time brand), so PrimeNG
 * components (toast, dialogs, inputs, tables…) follow the brand AND the
 * light/dark switch with no extra work, and no palette is duplicated here.
 */
const primaryScale = Object.fromEntries(
  [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((s) => [s, `var(--odl-primary-${s})`]),
);

const surfaceScale = Object.fromEntries(
  [0, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((s) => [s, `var(--odl-neutral-${s})`]),
);

export const OdelPreset = definePreset(Aura, {
  semantic: {
    primary: primaryScale,
    focusRing: {
      width: '2px',
      style: 'solid',
      color: 'var(--odl-focus-ring)',
      offset: '2px',
      shadow: 'none',
    },
    colorScheme: {
      light: {
        surface: surfaceScale,
        primary: {
          color: '{primary.500}',
          contrastColor: 'var(--odl-on-primary)',
          hoverColor: '{primary.400}',
          activeColor: '{primary.600}',
        },
        highlight: {
          background: '{primary.50}',
          focusBackground: '{primary.100}',
          color: '{primary.800}',
          focusColor: '{primary.900}',
        },
      },
      dark: {
        surface: surfaceScale,
        primary: {
          color: '{primary.400}',
          contrastColor: 'var(--odl-on-primary)',
          hoverColor: '{primary.300}',
          activeColor: '{primary.500}',
        },
        highlight: {
          background: 'rgba(209, 170, 85, 0.16)',
          focusBackground: 'rgba(209, 170, 85, 0.24)',
          color: '{primary.200}',
          focusColor: '{primary.100}',
        },
      },
    },
  },
});
