'use client'

import { CloseButton } from '@headlessui/react'
import clsx from 'clsx'
import { AnimatePresence, motion, useIsPresent } from 'framer-motion'
import { useTranslations } from 'next-intl'
import { useRef } from 'react'
import { useIsInsideMobileNavigation } from '@/components/MobileNavigation'
import { useSectionStore } from '@/components/SectionProvider'
import { Tag } from '@/components/Tag'
import { Link, usePathname } from '@/i18n/navigation'
import type { routing } from '@/i18n/routing'
import { remToPx } from '@/utils/remToPx'

type ValidHref = keyof typeof routing.pathnames

interface NavGroup {
  title: string
  links: Array<{
    title: string
    href: string // Keep as string to allow anchor links for internal use
    tag?: string
  }>
}

function useInitialValue<T>(value: T, condition = true) {
  const initialValue = useRef(value).current
  return condition ? initialValue : value
}

function NavLink({
  href,
  children,
  tag,
  active = false,
  isAnchorLink = false,
}: {
  href: string
  children: React.ReactNode
  tag?: string
  active?: boolean
  isAnchorLink?: boolean
}) {
  return (
    <CloseButton
      as={Link}
      href={href as ValidHref}
      aria-current={active ? 'page' : undefined}
      className={clsx(
        'flex justify-between gap-2 py-1 pr-3 text-sm transition',
        isAnchorLink ? 'pl-7' : 'pl-4',
        active
          ? 'text-zinc-900 dark:text-white'
          : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white'
      )}
    >
      <span className="truncate">
        {children}
        {tag && (
          <>
            {' '}
            <Tag variant="small" color={tag === 'new' ? 'sky' : 'zinc'}>
              {tag}
            </Tag>
          </>
        )}
      </span>
    </CloseButton>
  )
}

function VisibleSectionHighlight({ group, pathname }: { group: NavGroup; pathname: string }) {
  const [sections, visibleSections] = useInitialValue(
    [useSectionStore((s) => s.sections), useSectionStore((s) => s.visibleSections)],
    useIsInsideMobileNavigation()
  )

  const isPresent = useIsPresent()
  const firstVisibleSectionIndex = Math.max(
    0,
    [{ id: '_top' }, ...sections].findIndex((section) => section.id === visibleSections[0])
  )
  const itemHeight = remToPx(2)
  const height = isPresent ? Math.max(1, visibleSections.length) * itemHeight : itemHeight
  const top =
    group.links.findIndex((link) => link.href === pathname) * itemHeight +
    firstVisibleSectionIndex * itemHeight

  return (
    <motion.div
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { delay: 0.2 } }}
      exit={{ opacity: 0 }}
      className="absolute inset-x-0 top-0 bg-zinc-800/2.5 will-change-transform dark:bg-white/2.5"
      style={{ borderRadius: 8, height, top }}
    />
  )
}

function ActivePageMarker({ group, pathname }: { group: NavGroup; pathname: string }) {
  const itemHeight = remToPx(2)
  const offset = remToPx(0.25)
  const activePageIndex = group.links.findIndex((link) => link.href === pathname)
  const top = offset + activePageIndex * itemHeight

  return (
    <motion.div
      layout
      className="absolute left-2 h-6 w-px bg-amber-500"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { delay: 0.2 } }}
      exit={{ opacity: 0 }}
      style={{ top }}
    />
  )
}

function NavigationGroup({ group, className }: { group: NavGroup; className?: string }) {
  // If this is the mobile navigation then we always render the initial
  // state, so that the state does not change during the close animation.
  // The state will still update when we re-open (re-render) the navigation.
  const isInsideMobileNavigation = useIsInsideMobileNavigation()
  const [pathname, sections] = useInitialValue(
    [usePathname(), useSectionStore((s) => s.sections)],
    isInsideMobileNavigation
  )

  const isActiveGroup = group.links.findIndex((link) => link.href === pathname) !== -1

  return (
    <li className={clsx('relative mt-6', className)}>
      <motion.h2 layout="position" className="text-xs font-semibold text-zinc-900 dark:text-white">
        {group.title}
      </motion.h2>
      <div className="relative mt-3 pl-2">
        <AnimatePresence initial={!isInsideMobileNavigation}>
          {isActiveGroup && <VisibleSectionHighlight group={group} pathname={pathname} />}
        </AnimatePresence>
        <motion.div
          layout
          className="absolute inset-y-0 left-2 w-px bg-zinc-900/10 dark:bg-white/5"
        />
        <AnimatePresence initial={false}>
          {isActiveGroup && <ActivePageMarker group={group} pathname={pathname} />}
        </AnimatePresence>
        <ul className="border-l border-transparent">
          {group.links.map((link) => (
            <motion.li key={link.href} layout="position" className="relative">
              <NavLink href={link.href} active={link.href === pathname} tag={link.tag}>
                {link.title}
              </NavLink>
              <AnimatePresence mode="popLayout" initial={false}>
                {link.href === pathname && sections.length > 0 && (
                  <motion.ul
                    role="list"
                    initial={{ opacity: 0 }}
                    animate={{
                      opacity: 1,
                      transition: { delay: 0.1 },
                    }}
                    exit={{
                      opacity: 0,
                      transition: { duration: 0.15 },
                    }}
                  >
                    {sections.map((section) => (
                      <li key={section.id}>
                        <NavLink href={`${link.href}#${section.id}`} tag={section.tag} isAnchorLink>
                          {section.title}
                        </NavLink>
                      </li>
                    ))}
                  </motion.ul>
                )}
              </AnimatePresence>
            </motion.li>
          ))}
        </ul>
      </div>
    </li>
  )
}

// Hook to get translated navigation
export function useNavigation(): Array<NavGroup> {
  const t = useTranslations('Navigation')
  const tCommon = useTranslations('Common')
  const isProduction = process.env.NODE_ENV === 'production'

  // Define which pages go in which sections
  const gettingStartedPages = [
    { page: 'quickstart' },
    { page: 'command-reference' },
    { page: 'configuration' },
    { page: 'ai-analysis', tag: 'new' },
  ]
  const guidesPages = [
    'examples',
    'development',
    'best-practices',
    'performance',
    'migration',
    'cicd',
    'faq',
    'troubleshooting',
  ]
  const writingPages = [
    'writing-basics',
    'writing-code',
    'writing-components',
    'writing-layout',
    'writing-api',
    'writing-advanced',
  ]

  const createNavLink = (page: string) => ({
    title: t(page),
    href: `/${page}`,
  })

  const createNavLinkWithTag = (item: { page: string; tag?: string }) => ({
    title: t(item.page),
    href: `/${item.page}`,
    tag: item.tag,
  })

  const navGroups = [
    {
      title: tCommon('gettingStarted'),
      links: [
        { title: tCommon('introduction'), href: '/' },
        ...gettingStartedPages.map(createNavLinkWithTag),
      ],
    },
    {
      title: tCommon('guidesAndExamples'),
      links: guidesPages.map(createNavLink),
    },
  ]

  // Only show Writing Documentation in development
  if (!isProduction) {
    navGroups.push({
      title: tCommon('writingDocumentation'),
      links: writingPages.map(createNavLink),
    })
  }

  return navGroups
}

// For backward compatibility - static navigation without translation
const createStaticNavigation = (): Array<NavGroup> => {
  const isProduction = process.env.NODE_ENV === 'production'

  const staticNavGroups = [
    {
      title: 'Getting Started',
      links: [
        { title: 'Introduction', href: '/' },
        { title: 'Quick Start', href: '/quickstart' },
        { title: 'Command Reference', href: '/command-reference' },
        { title: 'Configuration', href: '/configuration' },
        { title: 'AI Analysis', href: '/ai-analysis', tag: 'new' },
      ],
    },
    {
      title: 'Guides & Examples',
      links: [
        { title: 'Examples', href: '/examples' },
        { title: 'Development', href: '/development' },
        { title: 'Best Practices', href: '/best-practices' },
        { title: 'Performance', href: '/performance' },
        { title: 'Migration Guide', href: '/migration' },
        { title: 'CI/CD Integration', href: '/cicd' },
        { title: 'FAQ', href: '/faq' },
        { title: 'Troubleshooting', href: '/troubleshooting' },
      ],
    },
  ]

  // Only show Writing Docs in development
  if (!isProduction) {
    staticNavGroups.splice(1, 0, {
      title: 'Writing Docs',
      links: [
        { title: 'Writing Basics', href: '/writing-basics' },
        { title: 'Writing Code', href: '/writing-code' },
        { title: 'Writing Components', href: '/writing-components' },
        { title: 'Writing Layout', href: '/writing-layout' },
        { title: 'Writing API', href: '/writing-api' },
        { title: 'Writing Advanced', href: '/writing-advanced' },
      ],
    })
  }

  return staticNavGroups
}

export const navigation: Array<NavGroup> = createStaticNavigation()

export function Navigation(props: React.ComponentPropsWithoutRef<'nav'>) {
  const navigation = useNavigation()

  return (
    <nav {...props}>
      <ul>
        {navigation.map((group, groupIndex) => (
          <NavigationGroup
            key={group.title}
            group={group}
            className={groupIndex === 0 ? 'md:mt-0' : ''}
          />
        ))}
      </ul>
    </nav>
  )
}
