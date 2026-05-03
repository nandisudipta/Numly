/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Theme-driven semantic tokens with opacity support
        primary:      'rgb(var(--primary-rgb) / <alpha-value>)',
        'primary-contrast': 'var(--primary-contrast)',
        secondary:    'var(--text-secondary)',
        card:         'var(--bg-card)',
        'card-hover': 'var(--bg-card-hover)',
        border:       'var(--border-color)',
        'border-input':'var(--border-input)',
        input:        'var(--bg-input)',
        success:      'var(--color-success)',
        danger:       'var(--color-danger)',

        // Also keep 'main' alias for any legacy bg-main usage
        main: 'transparent',

        // Accent palette — gold/primary coverage
        gold:          'rgb(var(--primary-rgb) / <alpha-value>)',
        'gold-hover':  'color-mix(in srgb, var(--primary) 90%, #fff)',
        'gold-active': 'color-mix(in srgb, var(--primary) 80%, #000)',
        cyan:    'rgb(var(--cyan-rgb)    / <alpha-value>)',
        emerald: 'rgb(var(--emerald-rgb) / <alpha-value>)',
        violet:  'rgb(var(--violet-rgb)  / <alpha-value>)',
        orange:  'rgb(var(--orange-rgb)  / <alpha-value>)',
        red:     'rgb(var(--red-rgb)     / <alpha-value>)',
        blue:    'rgb(var(--blue-rgb)    / <alpha-value>)',
        pink:    'rgb(var(--pink-rgb)    / <alpha-value>)',
        teal:    'rgb(var(--teal-rgb)    / <alpha-value>)',
        silver:  'rgb(var(--silver-rgb)  / <alpha-value>)',
      },
    },
  },
  plugins: [],
};
