import { defineConfig } from 'vite';

export default defineConfig({
  base: '/kakeami-generator/',
  test: {
    include: ['src/**/*.test.ts'],
  },
});
