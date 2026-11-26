import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// `npm run ui:dev` expects `orch ui` to be running; the dev server borrows its api token and forwards /api to it.
const ORCH = 'http://127.0.0.1:4173';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'orch-token',
      async transformIndexHtml(html) {
        try {
          const m = /name="orch-token" content="([a-f0-9]+)"/.exec(await (await fetch(ORCH + '/')).text());
          return m ? html.replace('</head>', `<meta name="orch-token" content="${m[1]}"></head>`) : html;
        } catch { return html; } // orch ui is not running: the console falls back to sample data
      },
    },
  ],
  server: {
    proxy: {
      '/api': {
        target: ORCH,
        changeOrigin: true,
        headers: { origin: ORCH }, // orch refuses writes whose Origin is not its own
      },
    },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
