import { fileURLToPath, URL } from 'node:url'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// Library build. Type declarations are emitted separately by `vue-tsc -b`
// (the `build` script runs `vue-tsc -b` before `vite build`).
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    // `vue-tsc -b` emits the .d.ts files into `dist` *before* `vite build`
    // runs (see the `build` script). Vite must not wipe them, so disable the
    // default emptyOutDir. The build script clears `dist` up front instead.
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'VueImportExport',
      formats: ['es', 'cjs'],
      fileName: (format) =>
        format === 'es' ? 'vue-import-export.js' : 'vue-import-export.cjs',
    },
    rollupOptions: {
      // Externalize peer deps and axios so they are not bundled. Matches the
      // bare package id and any subpath (e.g. `@heroicons/vue/24/solid`), so
      // deep imports stay external instead of being silently dropped/bundled.
      external: (id) =>
        ['vue', 'pinia', '@heroicons/vue', 'vue-i18n', 'axios'].some(
          (dep) => id === dep || id.startsWith(`${dep}/`),
        ),
      output: {
        globals: {
          vue: 'Vue',
          pinia: 'Pinia',
          '@heroicons/vue': 'HeroiconsVue',
          'vue-i18n': 'VueI18n',
          axios: 'axios',
        },
      },
    },
  },
})
