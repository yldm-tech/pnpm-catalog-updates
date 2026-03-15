import nextMDX from '@next/mdx'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./src/i18n.ts')

const withMDX = nextMDX({
  options: {
    remarkPlugins: ['./src/mdx/plugins/remark-annotations.mjs', 'remark-gfm'],
    rehypePlugins: [
      './src/mdx/plugins/rehype-annotations.mjs',
      './src/mdx/plugins/rehype-parse-code-blocks.mjs',
      './src/mdx/plugins/rehype-shiki.mjs',
      './src/mdx/plugins/rehype-slugify.mjs',
      './src/mdx/plugins/rehype-add-section-exports.mjs',
    ],
    recmaPlugins: ['./src/mdx/plugins/recma-annotations.mjs'],
  },
})

const isProduction = process.env.NODE_ENV === 'production'
const useCustomDomain = process.env.USE_CUSTOM_DOMAIN === 'true'

/** @type {import('next').NextConfig} */
const nextConfig = {
  // GitHub Pages compatible static export (only in production)
  ...(isProduction && { output: 'export' }),
  trailingSlash: true,
  images: {
    unoptimized: true,
  },

  // GitHub Pages deployment paths (empty when using custom domain)
  basePath: isProduction && !useCustomDomain ? '/pnpm-catalog-updates' : '',
  assetPrefix: isProduction && !useCustomDomain ? '/pnpm-catalog-updates/' : '',

  pageExtensions: ['js', 'jsx', 'ts', 'tsx', 'mdx'],
  outputFileTracingIncludes: {
    '/**/*': ['./src/app/**/*.mdx'],
  },
}

export default withNextIntl(withMDX(nextConfig))
