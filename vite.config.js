import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// ── Dev-only plugin: forward /api/ai to the Vercel serverless handler ─────
// Lets you run the AI features locally with `npm run dev` without needing
// the Vercel CLI.  The plugin injects ANTHROPIC_API_KEY (and optional
// ANTHROPIC_MODEL) from your .env.local into process.env before each call.
function devApiPlugin() {
  let resolvedMode = 'development'
  return {
    name: 'dev-api-proxy',
    apply: 'serve',
    config(_, { mode }) { resolvedMode = mode },
    configureServer(server) {
      // loadEnv with prefix '' loads ALL env vars, not just VITE_*
      const env = loadEnv(resolvedMode, process.cwd(), '')
      if (env.ANTHROPIC_API_KEY) process.env.ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY
      if (env.ANTHROPIC_MODEL)   process.env.ANTHROPIC_MODEL   = env.ANTHROPIC_MODEL

      server.middlewares.use('/api/ai', (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

        if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }
        if (req.method !== 'POST') {
          res.writeHead(405, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Method not allowed.' }))
          return
        }

        const chunks = []
        req.on('data', c => chunks.push(c))
        req.on('end', async () => {
          try {
            req.body = JSON.parse(Buffer.concat(chunks).toString() || '{}')
          } catch {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Invalid JSON body.' }))
            return
          }

          // Wrap Node's ServerResponse with Vercel-style .status()/.json() helpers
          const mockRes = new Proxy(res, {
            get(target, prop) {
              if (prop === 'status') return (code) => { target.statusCode = code; return mockRes }
              if (prop === 'json')   return (data) => {
                if (!target.headersSent) target.setHeader('Content-Type', 'application/json')
                target.end(JSON.stringify(data))
              }
              const val = target[prop]
              return typeof val === 'function' ? val.bind(target) : val
            },
          })

          try {
            const { default: handler } = await import('./api/ai.js')
            await handler(req, mockRes)
          } catch (err) {
            if (!res.headersSent) {
              res.writeHead(502, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: err.message }))
            }
          }
        })
      })
    },
  }
}

export default defineConfig({
  plugins: [
    devApiPlugin(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'icons/*.png'],
      manifest: {
        name: '3D Streets',
        short_name: '3D Streets',
        description: 'Premium 3D navigation — AI-powered, customizable, yours.',
        theme_color: '#0A0E1A',
        background_color: '#0A0E1A',
        display: 'fullscreen',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.mapbox\.com/,
            handler: 'CacheFirst',
            options: { cacheName: 'mapbox-api', expiration: { maxEntries: 100, maxAgeSeconds: 86400 } }
          },
          {
            urlPattern: /^https:\/\/.*\.tiles\.mapbox\.com/,
            handler: 'CacheFirst',
            options: { cacheName: 'mapbox-tiles', expiration: { maxEntries: 500, maxAgeSeconds: 604800 } }
          }
        ]
      }
    })
  ],
  server: { port: 3000, host: true }
})
