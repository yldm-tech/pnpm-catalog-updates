import { visit } from 'unist-util-visit'

export default function rehypeParseCodeBlocks() {
  return (tree) => {
    visit(tree, 'element', (node, _nodeIndex, parentNode) => {
      if (node.tagName !== 'code') {
        return
      }

      parentNode.properties.language = node.properties.className
        ? node.properties?.className[0]?.replace(/^language-/, '')
        : 'txt'

      let title = null

      if (parentNode.data?.meta) {
        const titleMatch = parentNode.data.meta.match(/title:\s*['"]([^'"]*)['"]/)
        if (titleMatch) title = titleMatch[1]
      }

      if (parentNode.properties?.annotation) {
        try {
          let annotationStr = parentNode.properties.annotation
          if (typeof annotationStr === 'string') {
            annotationStr = annotationStr.replace(/'/g, '"')
            const annotation = JSON.parse(annotationStr)
            if (annotation.title) title = annotation.title
          }
        } catch (_error) {
          const titleMatch = parentNode.properties.annotation.match(/title:\s*['"]([^'"]*)['"]/)
          if (titleMatch) title = titleMatch[1]
        }
      }

      if (title) {
        parentNode.properties.title = title
      }
    })
  }
}
