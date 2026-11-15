import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Netlify publishes the Vite output at the domain root, even for deploy previews.
// GitHub Pages is hosted under /movie-site/, so give that path only to GitHub Actions
// builds that are not running inside Netlify.
const isGitHubPagesBuild = process.env.GITHUB_ACTIONS === 'true'
  && process.env.NETLIFY !== 'true'

export default defineConfig({
  plugins: [react()],
  base: isGitHubPagesBuild ? '/movie-site/' : '/',
})
