import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: '/kakeami-generator/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        'experiments/runner': resolve(__dirname, 'experiments/runner.html'),
      },
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
