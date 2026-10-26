import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// 构建产物是单个可双击打开的 dist/index.html，沿用原来的使用方式。
export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    target: 'es2020',
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 2000,
  },
});
