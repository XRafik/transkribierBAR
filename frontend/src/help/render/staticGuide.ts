/**
 * Renders the public user guide (`/handbuch/`) and the privacy page shell as
 * static HTML from the help markdown. Pure: no fs, no Vite APIs. Imported by
 * `scripts/build-guide.ts` under Node's type stripping, so: explicit `.ts`
 * extensions on local imports, erasable TypeScript only.
 *
 * Output contract, filled in by the backend when it serves the pages:
 * - every `{{key}}` becomes `__TW_SETTING_key__`; the masthead has `__TW_SETTING_app_version__`;
 * - gated blocks are wrapped in `<!--tw-feature:X-->…<!--/tw-feature:X-->`, never nested; `contact`
 *   wraps every sentence with the contact address (masthead note, footer, about section);
 * - the privacy shell has `__TW_PRIVACY_NOTICE__`, `__TW_NOTICE_LANG__` and `__TW_NOTICE_FALLBACK__`
 *   (a one-line note when the notice is in the other language, else empty);
 * - asset URLs (css, logo, shots, diagrams) end in `?v=<build date>`; fonts are referenced from the CSS;
 * - no `<script>`, and no absolute URL other than the three university links.
 */
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypeSlug from 'rehype-slug'
import rehypeStringify from 'rehype-stringify'
import { SKIP, visit } from 'unist-util-visit'
import type { Element, ElementContent, Properties, Root as HastRoot } from 'hast'
import type { Root as MdastRoot } from 'mdast'
import { toSentinels } from '../helpText.ts'
import type { HelpFeature, HelpSectionId } from '../sectionList.ts'
import type { ShotMeta } from '../shotMeta.ts'

export type GuideLang = 'de' | 'en'

export interface GuideSectionInput {
  id: HelpSectionId
  tocLabel: string
  markdown: string
  feature?: HelpFeature
}

export interface GuidePageInput {
  lang: GuideLang
  sections: GuideSectionInput[]
  shotMeta(id: string): ShotMeta | undefined
  logoSvg: string
  /** YYYY-MM-DD */
  builtOn: string
}

/** The only absolute URLs the pages may contain. */
export const UNIVERSITY_LINKS = {
  privacyUniversity: 'https://www.uni-osnabrueck.de/datenschutzerklaerung',
  imprint: 'https://www.uni-osnabrueck.de/impressum',
  accessibility: 'https://www.uni-osnabrueck.de/barrierefreiheit',
} as const

const TEXT = {
  de: {
    guide: 'Handbuch',
    lede: 'Gesprochene Sprache aus Audio- und Videodateien in Text umwandeln, im Browser korrigieren und als Untertitel oder Text herunterladen.',
    asOf: 'Stand',
    version: 'Version',
    language: 'Sprache',
    langName: 'Deutsch',
    toc: 'Inhalt',
    skip: 'Zum Inhalt springen',
    cta: 'Direkt zu transkribierBAR',
    enlarge: 'Zum Vergrößern klicken',
    close: 'Schließen',
    contact: 'Fragen oder Probleme? Schreiben Sie an',
    noteLabel: 'Hinweis',
    note: 'Dieses Handbuch wurde mit Unterstützung von KI erstellt und mit dem laufenden System abgeglichen. Fehler sind trotzdem möglich.',
    noteContact: 'Hinweise bitte an',
    legal: 'Rechtliches',
    privacy: 'Datenschutzhinweise',
    privacyUniversity: 'Datenschutzerklärung der Universität',
    imprint: 'Impressum',
    accessibility: 'Barrierefreiheit',
    backToGuide: 'Zum Handbuch',
    groups: { overview: 'Überblick', transcribe: 'Transkribieren', ai: 'KI-Funktionen', more: 'Weiteres' },
  },
  en: {
    guide: 'User guide',
    lede: 'Turn speech in audio and video files into text, correct it in the browser and download it as subtitles or text.',
    asOf: 'As of',
    version: 'Version',
    language: 'Language',
    langName: 'English',
    toc: 'Contents',
    skip: 'Skip to content',
    cta: 'Open transkribierBAR',
    enlarge: 'Click to enlarge',
    close: 'Close',
    contact: 'Questions or problems? Write to',
    noteLabel: 'Note',
    note: 'This guide was written with the help of AI and checked against the running system. Errors are still possible.',
    noteContact: 'Please report them to',
    legal: 'Legal',
    privacy: 'Privacy notice',
    privacyUniversity: 'University privacy policy',
    imprint: 'Imprint',
    accessibility: 'Accessibility',
    backToGuide: 'Back to the user guide',
    groups: { overview: 'Overview', transcribe: 'Transcribe', ai: 'AI features', more: 'More' },
  },
} as const

type GroupId = keyof (typeof TEXT)['de']['groups']

/** TOC groups as in the mockup; the body follows the same order. */
const GROUPS: readonly { id: GroupId; sections: readonly HelpSectionId[] }[] = [
  { id: 'overview', sections: ['about', 'getting-started', 'archive'] },
  { id: 'transcribe', sections: ['upload', 'record', 'transcription-settings', 'subtitle-editor', 'speaker-mapping', 'format-viewer'] },
  { id: 'ai', sections: ['analysis', 'translation', 'refinement'] },
  { id: 'more', sections: ['presets', 'bundles', 'api-access'] },
]

/** Relative links from one page; `root` leads to `/handbuch/`. */
interface PageLinks {
  root: string
  switchTo: Record<GuideLang, string>
  app: string
  privacy: string
}

const GUIDE_LINKS: Record<GuideLang, PageLinks> = {
  de: { root: '', switchTo: { de: './', en: 'en/' }, app: '../', privacy: 'datenschutz/' },
  en: { root: '../', switchTo: { de: '../', en: './' }, app: '../../', privacy: 'privacy/' },
}

const PRIVACY_LINKS: Record<GuideLang, PageLinks> = {
  de: { root: '../', switchTo: { de: './', en: '../en/privacy/' }, app: '../../', privacy: './' },
  en: { root: '../../', switchTo: { de: '../../datenschutz/', en: './' }, app: '../../../', privacy: './' },
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function gated(feature: string | undefined, html: string): string {
  return feature ? `<!--tw-feature:${feature}-->${html}<!--/tw-feature:${feature}-->` : html
}

/** Asset names are not hashed, so a re-shoot is picked up through the build date. */
function versionQuery(builtOn: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(builtOn)) throw new Error(`builtOn must be YYYY-MM-DD, got "${builtOn}"`)
  return `?v=${builtOn}`
}

function formatDate(builtOn: string, lang: GuideLang): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(builtOn)) throw new Error(`builtOn must be YYYY-MM-DD, got "${builtOn}"`)
  return new Intl.DateTimeFormat(lang === 'de' ? 'de-DE' : 'en-GB', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(`${builtOn}T00:00:00Z`))
}

/** The logo inline, decorative (the H1 names the product), without namespace URLs. */
function inlineLogo(svg: string): string {
  const body = svg
    .replace(/<\?xml[\s\S]*?\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s+xmlns(:\w+)?="[^"]*"/g, '')
    .trim()
  if (!body.startsWith('<svg')) throw new Error('logoSvg is not an <svg> element')
  return body.replace(/^<svg\b/, '<svg class="logo" aria-hidden="true" focusable="false"')
}

// ---------------------------------------------------------------------------
// Markdown → HTML for one section

interface SectionOptions {
  sectionId: HelpSectionId
  lang: GuideLang
  prefix: string
  shotMeta: (id: string) => ShotMeta | undefined
  enlarge: string
  close: string
  /** Cache-busting suffix for asset URLs, e.g. `?v=2026-10-22`. */
  version: string
  /** Occurrences of each shot in this section, for unique anchors. */
  shotSeen: Map<string, number>
}

/**
 * Placeholders become sentinels on the parsed tree, not on the markdown string:
 * `__TW_SETTING_x__` in markdown source would be read as strong emphasis.
 */
function remarkSentinels() {
  return (tree: MdastRoot) => {
    visit(tree, (node) => {
      if ('value' in node && typeof node.value === 'string') node.value = toSentinels(node.value)
      if ('url' in node && typeof node.url === 'string') node.url = toSentinels(node.url)
      if ('alt' in node && typeof node.alt === 'string') node.alt = toSentinels(node.alt)
      if ('title' in node && typeof node.title === 'string') node.title = toSentinels(node.title)
    })
  }
}

function el(tagName: string, properties: Properties, children: ElementContent[] = []): Element {
  return { type: 'element', tagName, properties, children }
}

function pct(part: number, whole: number): string {
  return `${Number(((part / whole) * 100).toFixed(3))}%`
}

const SHOT_SRC = /^shots\/([\w-]+)\.png$/
const ASSET_SRC = /^\.\/assets\/([\w-]+\.svg)$/

function shotFigure(id: string, alt: string, o: SectionOptions): Element[] {
  const meta = o.shotMeta(id)
  if (!meta) throw new Error(`Section "${o.sectionId}" (${o.lang}) shows shots/${id}.png, which has no recorded markers`)
  const src = `${o.prefix}static/shots/${o.lang}/${id}.png${o.version}`
  const seen = (o.shotSeen.get(id) ?? 0) + 1
  o.shotSeen.set(id, seen)
  const anchor = `shot-${o.sectionId}-${id}${seen > 1 ? `-${seen}` : ''}`
  const marks = () => meta.marks.map((m) =>
    el('span', {
      className: ['mark'],
      style: `left:${pct(m.x, meta.width)};top:${pct(m.y, meta.height)};width:${pct(m.w, meta.width)};height:${pct(m.h, meta.height)}`,
      ariaHidden: 'true',
    }, [el('i', {}, [{ type: 'text', value: String(m.n) }])]),
  )
  const figure = el('figure', { className: ['shot'], id: anchor }, [
    el('a', { className: ['shotbox'], href: `#${anchor}-zoom` }, [el('img', { src, width: meta.width, height: meta.height, alt }), ...marks()]),
    el('figcaption', {}, [{ type: 'text', value: o.enlarge }]),
  ])
  // CSS-only enlargement: the link above targets this overlay, which :target reveals.
  const zoom = el('div', { className: ['zoom'], id: `${anchor}-zoom` }, [
    el('a', { className: ['zoom-close'], href: `#${anchor}` }, [{ type: 'text', value: o.close }]),
    el('div', { className: ['zoom-inner'], style: `max-width:${meta.width + 24}px` }, [
      el('div', { className: ['zoom-box'] }, [el('img', { src, width: meta.width, height: meta.height, alt, loading: 'lazy' }), ...marks()]),
    ]),
  ])
  return [figure, zoom]
}

function assetSrc(src: string, o: SectionOptions): string | null {
  const m = ASSET_SRC.exec(src)
  return m ? `${o.prefix}static/assets/${o.lang}/${m[1]}${o.version}` : null
}

const CONTACT = '__TW_SETTING_contact_email__'
const CONTACT_HREF = `mailto:${CONTACT}`

function linksToContact(node: ElementContent): boolean {
  if (node.type !== 'element') return false
  if (node.tagName === 'a' && node.properties.href === CONTACT_HREF) return true
  return node.children.some(linksToContact)
}

/**
 * A top-level paragraph that links the contact address is wrapped in the `contact`
 * feature, so the backend can drop it when no address is configured. A heading that
 * then introduces nothing else (the paragraph ends the section) goes with it.
 */
function rehypeContactBlock() {
  return (tree: HastRoot) => {
    const kids = tree.children
    const at = kids.findIndex((n) => n.type === 'element' && n.tagName === 'p' && linksToContact(n))
    if (at < 0) return
    const rest = kids.slice(at + 1).filter((n) => !(n.type === 'text' && n.value.trim() === ''))
    const prev = kids.slice(0, at).reverse().find((n) => !(n.type === 'text' && n.value.trim() === ''))
    const headingIndex = prev && prev.type === 'element' && /^h[1-6]$/.test(prev.tagName) ? kids.indexOf(prev) : -1
    const start = headingIndex >= 0 && rest.length === 0 ? headingIndex : at
    kids.splice(at + 1, 0, { type: 'raw', value: '<!--/tw-feature:contact-->' } as unknown as ElementContent)
    kids.splice(start, 0, { type: 'raw', value: '<!--tw-feature:contact-->' } as unknown as ElementContent)
  }
}

/** Shots and assets, heading shift (`#` → h2) and section-prefixed heading ids, scrollable tables. */
function rehypeGuide(o: SectionOptions) {
  return (tree: HastRoot) => {
    visit(tree, 'element', (node, index, parent) => {
      const heading = /^h([1-6])$/.exec(node.tagName)
      if (heading) {
        node.tagName = `h${Math.min(Number(heading[1]) + 1, 6)}`
        if (typeof node.properties.id === 'string') node.properties.id = `${o.sectionId}--${node.properties.id}`
        return
      }
      if (!parent || index === undefined) return
      if (node.tagName === 'table') {
        parent.children[index] = el('div', { className: ['table'] }, [node])
        return SKIP
      }
      if (node.tagName === 'p') {
        const kids = node.children.filter((c) => !(c.type === 'text' && c.value.trim() === ''))
        const only = kids.length === 1 && kids[0].type === 'element' && kids[0].tagName === 'img' ? kids[0] : null
        if (!only) return
        const src = String(only.properties.src ?? '')
        const alt = String(only.properties.alt ?? '')
        const shot = SHOT_SRC.exec(src)
        if (shot) {
          const nodes = shotFigure(shot[1], alt, o)
          parent.children.splice(index, 1, ...nodes)
          return [SKIP, index + nodes.length]
        }
        const asset = assetSrc(src, o)
        if (asset) {
          parent.children[index] = el('figure', { className: ['diagram'] }, [el('img', { src: asset, alt })])
          return SKIP
        }
        return
      }
      if (node.tagName === 'img') {
        const src = String(node.properties.src ?? '')
        const asset = assetSrc(src, o)
        if (!asset) throw new Error(`Section "${o.sectionId}" (${o.lang}): image "${src}" must be ./assets/*.svg, or a shot on its own line`)
        node.properties.src = asset
      }
    })
  }
}

function renderSection(section: GuideSectionInput, o: SectionOptions): string {
  const html = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkSentinels)
    .use(remarkRehype)
    .use(rehypeSlug)
    .use(rehypeGuide, o)
    .use(rehypeContactBlock)
    .use(rehypeStringify, { allowDangerousHtml: true })
    .processSync(section.markdown)
  const out = String(html)
  if (section.feature && out.includes('tw-feature:contact')) {
    throw new Error(`Section "${section.id}" is gated and shows the contact address; feature blocks must not nest`)
  }
  return out
}

// ---------------------------------------------------------------------------
// Page frame

function head(lang: GuideLang, title: string, description: string, root: string, version: string): string {
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${esc(title)} · transkribierBAR</title>
<meta name="description" content="${esc(description)}">
<link rel="icon" href="${root}static/favicon.svg${version}" type="image/svg+xml">
<link rel="stylesheet" href="${root}static/guide.css${version}">
</head>`
}

function languageSwitch(lang: GuideLang, links: PageLinks): string {
  const items = (['de', 'en'] as const).map((l) =>
    l === lang
      ? `<a class="on" href="./" aria-current="page">${TEXT[l].langName}</a>`
      : `<a href="${links.switchTo[l]}" hreflang="${l}" lang="${l}">${TEXT[l].langName}</a>`,
  )
  return `<nav class="lang" aria-label="${TEXT[lang].language}">${items.join('')}</nav>`
}

function masthead(lang: GuideLang, logoSvg: string, eyebrow: string, lede: string | null, meta: string[], note: string | null, links: PageLinks): string {
  const t = TEXT[lang]
  return `<header class="masthead">
<div class="masthead-inner">
${inlineLogo(logoSvg)}
<div>
<p class="eyebrow">${esc(eyebrow)}</p>
<h1>transkribier<span class="bar">BAR</span></h1>
${lede ? `<p class="lede">${esc(lede)}</p>\n` : ''}<div class="meta">
${meta.join('\n')}
${languageSwitch(lang, links)}
</div>
${note ? `${note}\n` : ''}</div>
<a class="cta" href="${links.app}">${esc(t.cta)} <span aria-hidden="true">→</span></a>
</div>
</header>`
}

function footer(lang: GuideLang, links: PageLinks, privacyIsCurrent: boolean): string {
  const t = TEXT[lang]
  const privacy = `<li><a href="${links.privacy}"${privacyIsCurrent ? ' aria-current="page"' : ''}>${esc(t.privacy)}</a></li>`
  const external = (['privacyUniversity', 'imprint', 'accessibility'] as const).map(
    (k) => `<li><a href="${UNIVERSITY_LINKS[k]}" target="_blank" rel="noopener">${esc(t[k])}</a></li>`,
  )
  return `<footer class="foot">
<div class="foot-inner">
${gated('contact', `<p>${esc(t.contact)} <a href="${CONTACT_HREF}">${CONTACT}</a>.</p>`)}
<nav aria-label="${esc(t.legal)}"><ul class="legal">
${gated('privacy', privacy)}
${external.join('\n')}
</ul></nav>
</div>
</footer>`
}

// ---------------------------------------------------------------------------
// Pages

export function renderGuidePage(input: GuidePageInput): string {
  const { lang } = input
  const t = TEXT[lang]
  const links = GUIDE_LINKS[lang]

  for (const s of input.sections) {
    if (!GROUPS.some((g) => g.sections.includes(s.id))) throw new Error(`Section "${s.id}" belongs to no TOC group`)
  }
  const groups = GROUPS.map((g) => ({ id: g.id, items: input.sections.filter((s) => g.sections.includes(s.id)) }))
    .filter((g) => g.items.length > 0)

  const toc = groups.map((g) => {
    const first = g.items[0].feature
    const shared = g.items.every((s) => s.feature === first) ? first : undefined
    const items = g.items.map((s) => gated(s.feature, `<li><a href="#${s.id}">${esc(s.tocLabel)}</a></li>`))
    return `${gated(shared, `<p class="grp">${esc(t.groups[g.id])}</p>`)}\n<ol>\n${items.join('\n')}\n</ol>`
  })

  const body = groups.flatMap((g) => g.items).map((s) => {
    const content = renderSection(s, { sectionId: s.id, lang, prefix: links.root, shotMeta: input.shotMeta, enlarge: t.enlarge, close: t.close, version: versionQuery(input.builtOn), shotSeen: new Map() })
    return gated(s.feature, `<section id="${s.id}">\n${content}\n</section>`)
  })

  const meta = [
    `<span><b>${t.asOf}</b> <time datetime="${input.builtOn}">${formatDate(input.builtOn, lang)}</time></span>`,
    `<span><b>${t.version}</b> __TW_SETTING_app_version__</span>`,
  ]
  // The guide is AI-assisted and checked against the running app; the privacy page is the operator's own text.
  const note = `<p class="note"><b>${esc(t.noteLabel)}</b> ${esc(t.note)}${gated('contact', ` ${esc(t.noteContact)} <a href="${CONTACT_HREF}">${CONTACT}</a>.`)}</p>`

  return `${head(lang, t.guide, t.lede, links.root, versionQuery(input.builtOn))}
<body>
<a class="skip" href="#main">${esc(t.skip)}</a>
${masthead(lang, input.logoSvg, t.guide, t.lede, meta, note, links)}
<div class="wrap">
<nav class="toc" aria-label="${esc(t.toc)}">
${toc.join('\n')}
</nav>
<main id="main">
${body.join('\n')}
</main>
</div>
${footer(lang, links, false)}
</body>
</html>
`
}

export function renderPrivacyShell(lang: GuideLang, logoSvg: string, builtOn: string): string {
  const t = TEXT[lang]
  const links = PRIVACY_LINKS[lang]
  const back = `<a href="../"><span aria-hidden="true">← </span>${esc(t.backToGuide)}</a>`
  return `${head(lang, t.privacy, t.privacy, links.root, versionQuery(builtOn))}
<body>
<a class="skip" href="#main">${esc(t.skip)}</a>
${masthead(lang, logoSvg, t.privacy, null, [`<span>${back}</span>`], null, links)}
<div class="wrap single">
<main id="main">
__TW_NOTICE_FALLBACK__
<article class="notice" lang="__TW_NOTICE_LANG__">__TW_PRIVACY_NOTICE__</article>
</main>
</div>
${footer(lang, links, true)}
</body>
</html>
`
}
