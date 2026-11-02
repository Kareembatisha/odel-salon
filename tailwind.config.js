const primeui = require('tailwindcss-primeui');

/**
 * Tailwind is used for layout utilities only (flex, grid, gap, spacing).
 * Colors resolve to the same CSS-variable tokens as the SCSS design system,
 * so a utility like `bg-surface` / `text-brand-600` follows light/dark and
 * the active brand automatically.
 *
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: 'var(--odl-primary-50)',
          100: 'var(--odl-primary-100)',
          200: 'var(--odl-primary-200)',
          300: 'var(--odl-primary-300)',
          400: 'var(--odl-primary-400)',
          500: 'var(--odl-primary-500)',
          600: 'var(--odl-primary-600)',
          700: 'var(--odl-primary-700)',
          800: 'var(--odl-primary-800)',
          900: 'var(--odl-primary-900)'
        },
        surface: 'var(--odl-surface)',
        page: 'var(--odl-bg-page)',
        line: 'var(--odl-border)',
        ink: {
          DEFAULT: 'var(--odl-text)',
          soft: 'var(--odl-text-secondary)',
          muted: 'var(--odl-text-muted)'
        }
      }
    }
  },
  // Preflight is disabled so it doesn't fight PrimeNG component base styles.
  corePlugins: { preflight: false },
  plugins: [primeui]
};
