import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * GitHub Pages は https://ユーザー名.github.io/リポジトリ名/ というサブパスで配信される。
 * ここがズレるとサービスワーカーが登録されず PWA として成立しないので、
 * GitHub Actions が渡す環境変数からベースパスを自動で決める。
 *
 * - 通常のリポジトリ        → /リポジトリ名/
 * - ユーザー名.github.io    → /            （ルートで配信されるため）
 * - ローカル開発・他のホスト → /
 *
 * Netlify や Vercel など別の場所に置く場合は BASE_PATH=/ を指定すればよい。
 */
function resolveBase(): string {
  const explicit = process.env.BASE_PATH
  if (explicit) return explicit.endsWith('/') ? explicit : `${explicit}/`
  const repo = process.env.GITHUB_REPOSITORY?.split('/')[1]
  if (!repo || repo.endsWith('.github.io')) return '/'
  return `/${repo}/`
}

const base = resolveBase()

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'ログ — 時間とお金の記録',
        short_name: 'ログ',
        description: '勉強も趣味も支出も、ひとつのタグでまとめて記録する',
        lang: 'ja',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#F0F1F4',
        theme_color: '#2F4BC4',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        cleanupOutdatedCaches: true,
        navigateFallback: `${base}index.html`,
      },
    }),
  ],
})
