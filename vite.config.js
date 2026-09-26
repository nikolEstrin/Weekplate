import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const requireFromJeep = createRequire(createRequire(import.meta.url).resolve('jeep-sqlite/package.json'))
const sqlWasmPath = requireFromJeep.resolve('sql.js/dist/sql-wasm.wasm')

/**
 * Browser development uses jeep-sqlite, which fetches sql-wasm.wasm at runtime. iOS uses native SQLite and never needs it.
 * The wasm must match the sql.js glue bundled into jeep-sqlite (pinned via package.json overrides).
 */
function devSqliteWasm() {
  return {
    name: 'weekplate-dev-sqlite-wasm',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (!request.url?.split('?')[0].endsWith('/sql-wasm.wasm')) return next()
        response.setHeader('Content-Type', 'application/wasm')
        response.end(readFileSync(sqlWasmPath))
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), devSqliteWasm()],
})
