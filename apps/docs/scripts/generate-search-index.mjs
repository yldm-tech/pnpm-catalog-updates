import fs from 'node:fs'
import path from 'node:path'
import { slugifyWithCounter } from '@sindresorhus/slugify'
import glob from 'fast-glob'
import { toString } from 'mdast-util-to-string'
import { remark } from 'remark'
import remarkMdx from 'remark-mdx'
import { filter } from 'unist-util-filter'
import { SKIP, visit } from 'unist-util-visit'

const slugify = slugifyWithCounter()
const processor = remark().use(remarkMdx).use(extractSections)

function isObjectExpression(node) {
  return (
    node.type === 'mdxTextExpression' &&
    node.data?.estree?.body?.[0]?.expression?.type === 'ObjectExpression'
  )
}

function excludeObjectExpressions(tree) {
  return filter(tree, (node) => !isObjectExpression(node))
}

function extractSections() {
  return (tree, file) => {
    slugify.reset()

    visit(tree, (node) => {
      if (node.type === 'heading' || node.type === 'paragraph') {
        const content = toString(excludeObjectExpressions(node))

        if (node.type === 'heading' && node.depth <= 2) {
          const hash = node.depth === 1 ? null : slugify(content)
          file.sections.push([content, hash, []])
        } else {
          file.sections.at(-1)?.[2].push(content)
        }

        return SKIP
      }
    })
  }
}

function buildSearchData() {
  const contentRoot = path.join(process.cwd(), 'src', 'content')
  const localeDirs = fs
    .readdirSync(contentRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
  const searchData = {}

  for (const localeDir of localeDirs) {
    const locale = localeDir.name
    const localeDirPath = path.join(contentRoot, locale)
    const files = glob.sync('**/*.mdx', { cwd: localeDirPath })

    searchData[locale] = files.map((file) => {
      const sections = []
      const source = fs.readFileSync(path.join(localeDirPath, file), 'utf8')
      const vfile = { value: source, sections }

      processor.runSync(processor.parse(vfile), vfile)

      return {
        url: `/${file.replace(/\.mdx$/, '')}`,
        sections,
      }
    })
  }

  return searchData
}

function writeSearchIndexFile(searchData) {
  const outputDir = path.join(process.cwd(), 'src', 'generated')
  const outputFile = path.join(outputDir, 'search-index.ts')

  fs.mkdirSync(outputDir, { recursive: true })
  fs.writeFileSync(
    outputFile,
    `export const searchData = ${JSON.stringify(searchData, null, 2)} as const\n`,
    'utf8'
  )
}

writeSearchIndexFile(buildSearchData())
