import * as shiki from 'shiki'
import { visit } from 'unist-util-visit'

const cssVariablesTheme = shiki.createCssVariablesTheme()
let highlighterPromise

async function getHighlighter() {
  highlighterPromise ??= shiki.createHighlighter({
    themes: [cssVariablesTheme],
  })

  return highlighterPromise
}

async function highlightCodeBlock(code, language) {
  const highlighter = await getHighlighter()
  const normalizedLanguage = highlighter.resolveLangAlias(language) || language

  try {
    return highlighter.codeToHtml(code, {
      lang: normalizedLanguage,
      theme: cssVariablesTheme.name,
    })
  } catch (_error) {
    try {
      await highlighter.loadLanguage(normalizedLanguage)
      return highlighter.codeToHtml(code, {
        lang: normalizedLanguage,
        theme: cssVariablesTheme.name,
      })
    } catch (_loadError) {
      return highlighter.codeToHtml(code, {
        lang: 'text',
        theme: cssVariablesTheme.name,
      })
    }
  }
}

function unwrapHighlightedCode(highlightedCode) {
  return highlightedCode.replace(/^<pre[^>]*><code>/, '').replace(/<\/code><\/pre>$/, '')
}

export default function rehypeShiki() {
  return async (tree) => {
    const highlightTasks = []

    visit(tree, 'element', (node) => {
      if (node.tagName !== 'pre' || node.children[0]?.tagName !== 'code') {
        return
      }

      const codeNode = node.children[0]
      const textNode = codeNode.children[0]
      const code = textNode.value

      node.properties.code = code

      if (!node.properties.language) {
        return
      }

      highlightTasks.push(
        highlightCodeBlock(code, node.properties.language).then((highlightedCode) => {
          textNode.value = unwrapHighlightedCode(highlightedCode)

          if (node.properties.language === 'diff') {
            textNode.value = textNode.value
              .replace(
                /<span style="color:var\(--shiki-token-deleted\)">-([^<]*)<\/span>/g,
                '<span style="color: var(--color-red-300); background-color: rgb(254 202 202 / 0.1);">-$1</span>'
              )
              .replace(
                /<span style="color:var\(--shiki-token-inserted\)">\+([^<]*)<\/span>/g,
                '<span style="color: var(--color-green-300); background-color: rgb(187 247 208 / 0.1);">+$1</span>'
              )
          }
        })
      )
    })

    await Promise.all(highlightTasks)
  }
}
