import { slugifyWithCounter } from '@sindresorhus/slugify'
import { toString } from 'mdast-util-to-string'
import { visit } from 'unist-util-visit'

export default function rehypeSlugify() {
  return (tree) => {
    const slugify = slugifyWithCounter()

    visit(tree, 'element', (node) => {
      if (node.tagName === 'h2' && !node.properties.id) {
        node.properties.id = slugify(toString(node))
      }
    })
  }
}
