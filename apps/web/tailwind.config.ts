import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef7f1',
          500: '#0f9d58',
          600: '#0c7d46',
          700: '#0a6438',
        },
      },
    },
  },
  plugins: [],
};

export default config;
