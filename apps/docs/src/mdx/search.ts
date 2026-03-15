import FlexSearch from 'flexsearch'
import { searchData } from '@/generated/search-index'
import { defaultLocale, type Locale, locales } from '@/i18n'
import type { Result } from './search-types'

type SearchDocument = {
  url: string
  sections: Array<[string, string | null, string[]]>
}

type SearchResultItem = {
  id: string | number
  doc: Result | null
}

const indexCache = new Map<Locale, ReturnType<typeof createSearchIndex>>()

function normalizeLocale(locale: string): Locale {
  return locales.includes(locale as Locale) ? (locale as Locale) : defaultLocale
}

function createSearchIndex(locale: Locale) {
  const index = new FlexSearch.Document({
    tokenize: 'full',
    document: {
      id: 'url',
      index: 'content',
      store: ['title', 'pageTitle'],
    },
    context: {
      resolution: 9,
      depth: 2,
      bidirectional: true,
    },
  })

  for (const { url, sections } of searchData[locale] as unknown as SearchDocument[]) {
    for (const [title, hash, content] of sections) {
      index.add({
        url: url + (hash ? `#${hash}` : ''),
        title,
        content: [title, ...content].join('\n'),
        pageTitle: hash ? (sections[0]?.[0] ?? '') : '',
      })
    }
  }

  return index
}

function getSearchIndex(locale: string) {
  const normalizedLocale = normalizeLocale(locale)
  const cachedIndex = indexCache.get(normalizedLocale)
  if (cachedIndex) {
    return cachedIndex
  }

  const index = createSearchIndex(normalizedLocale)
  indexCache.set(normalizedLocale, index)
  return index
}

export function search(
  locale: string,
  query: string,
  options: Record<string, unknown> = {}
): Result[] {
  const trimmedQuery = query.trim()
  if (!trimmedQuery) {
    return []
  }

  const result = getSearchIndex(locale).search(trimmedQuery, {
    ...options,
    enrich: true,
  }) as Array<{ result: SearchResultItem[] }>

  if (result.length === 0) {
    return []
  }

  return result[0].result
    .filter((item) => item.doc)
    .map((item) => ({
      url: String(item.id),
      title: item.doc?.title ?? '',
      pageTitle: item.doc?.pageTitle || undefined,
    }))
}
