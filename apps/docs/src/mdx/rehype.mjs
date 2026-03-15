import rehypeAddSectionExports from './plugins/rehype-add-section-exports.mjs'
import rehypeAnnotations from './plugins/rehype-annotations.mjs'
import rehypeParseCodeBlocks from './plugins/rehype-parse-code-blocks.mjs'
import rehypeShiki from './plugins/rehype-shiki.mjs'
import rehypeSlugify from './plugins/rehype-slugify.mjs'

export const rehypePlugins = [
  rehypeAnnotations,
  rehypeParseCodeBlocks,
  rehypeShiki,
  rehypeSlugify,
  rehypeAddSectionExports,
]
