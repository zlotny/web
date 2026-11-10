import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { defineConfig } from 'vite';

function ledger(): { lines: number; files: number } {
  let lines = 0;
  let files = 0;
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith('.ts')) {
        files++;
        lines += readFileSync(path, 'utf8').split('\n').length;
      }
    }
  };
  walk(resolve(import.meta.dirname, 'src'));
  return { lines, files };
}

export default defineConfig({
  define: { __LEDGER__: JSON.stringify(ledger()) },
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        plain: resolve(import.meta.dirname, 'plain/index.html'),
      },
    },
  },
  worker: { format: 'es' },
  server: { allowedHosts: ['host.lima.internal'] },
});
