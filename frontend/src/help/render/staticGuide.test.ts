// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderGuidePage, renderPrivacyShell } from './staticGuide.ts'
import type { GuidePageInput } from './staticGuide.ts'
import type { ShotMeta } from '../shotMeta.ts'

const UNIVERSITY_LINKS = [
  'https://www.uni-osnabrueck.de/datenschutzerklaerung',
  'https://www.uni-osnabrueck.de/impressum',
  'https://www.uni-osnabrueck.de/barrierefreiheit',
]

const LOGO = '<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h10v10z"/></svg>\n'

// Same marker as the Task 12 drawer test: x 100 of 1000 px wide is left:10%.
const META: ShotMeta = { width: 1000, height: 300, marks: [{ n: 2, x: 100, y: 30, w: 200, h: 60 }] }

const UPLOAD_MD = `# Hochladen

Schreiben Sie an [{{contact_email}}](mailto:{{contact_email}}). Gelöscht nach {{retention_days}} Tagen.

![Die Seite „Hochladen“](shots/upload.png)

1. Die Einstellungen.
2. **Transkribieren** startet die Transkription.

## Seite verlassen

![Ablauf](./assets/main-flow.svg)

\`\`\`
curl -d '{"model": "{{default_model}}"}'
\`\`\`

> **Große Dateien.** Lassen Sie den Tab geöffnet.

| Feld | Bedeutung |
| --- | --- |
| \`file_id\` | Pflicht. |
`

const ANALYSIS_MD = `# Analyse

## Seite verlassen

Text.
`

function input(lang: 'de' | 'en', shotMeta: (id: string) => ShotMeta | undefined = (id) => (id === 'upload' ? META : undefined)): GuidePageInput {
  return {
    lang,
    sections: [
      { id: 'upload', tocLabel: lang === 'de' ? 'Hochladen' : 'Upload', markdown: UPLOAD_MD },
      { id: 'analysis', tocLabel: lang === 'de' ? 'Analyse' : 'Analysis', markdown: ANALYSIS_MD, feature: 'llm' },
    ],
    shotMeta,
    logoSvg: LOGO,
    builtOn: '2026-10-22',
  }
}

/** What the backend does (Task 15): drop disabled blocks entirely, keep only the content of enabled ones. */
function applyFeatures(html: string, enabled: Record<string, boolean>): string {
  return html.replace(/<!--tw-feature:(\w+)-->([\s\S]*?)<!--\/tw-feature:\1-->/g, (_m, name: string, body: string) =>
    enabled[name] ? body : '',
  )
}

function absoluteUrls(html: string): string[] {
  return [...html.matchAll(/https?:\/\/[^\s"'<>)]+/g)].map((m) => m[0])
}

const de = renderGuidePage(input('de'))
const en = renderGuidePage(input('en'))

describe('renderGuidePage: feature blocks', () => {
  it('wraps the gated section and its TOC entry in tw-feature markers', () => {
    expect(de).toMatch(/<!--tw-feature:llm-->\s*<section id="analysis">[\s\S]*?<\/section>\s*<!--\/tw-feature:llm-->/)
    expect(de).toMatch(/<!--tw-feature:llm-->\s*<li><a href="#analysis">Analyse<\/a><\/li>\s*<!--\/tw-feature:llm-->/)
    expect(de).not.toMatch(/<!--tw-feature:\w+-->\s*<section id="upload">/)
  })

  it('removes the section, its TOC entry and its empty group cleanly when the feature is off', () => {
    const off = applyFeatures(de, { llm: false, privacy: false })
    expect(off).not.toContain('analysis')
    expect(off).not.toContain('KI-Funktionen')
    expect(off).not.toContain('tw-feature')
    expect(off).toContain('<section id="upload">')
    expect(off).toContain('<a href="#upload">Hochladen</a>')
    expect(off).not.toContain('datenschutz/')
  })

  it('keeps everything but the markers when the feature is on', () => {
    const on = applyFeatures(de, { llm: true, privacy: true })
    expect(on).toContain('<section id="analysis">')
    expect(on).toContain('<a href="#analysis">Analyse</a>')
    expect(on).toContain('KI-Funktionen')
    expect(on).toContain('href="datenschutz/"')
    expect(on).not.toContain('tw-feature')
  })
})

describe('renderGuidePage: settings', () => {
  it('turns placeholders into sentinels in link text and href', () => {
    expect(de).toContain('<a href="mailto:__TW_SETTING_contact_email__">__TW_SETTING_contact_email__</a>')
  })

  it('keeps sentinels literal instead of reading their underscores as emphasis', () => {
    expect(de).toContain('Gelöscht nach __TW_SETTING_retention_days__ Tagen.')
    expect(de).not.toMatch(/<(strong|em)>TW_SETTING/)
    expect(de).not.toContain('{{')
  })

  it('fills sentinels inside code blocks too', () => {
    expect(de).toMatch(/<code>[^<]*"model": "__TW_SETTING_default_model__"[^<]*<\/code>/)
  })

  it('shows the app version and the build date in the masthead', () => {
    expect(de).toContain('__TW_SETTING_app_version__')
    expect(de).toContain('<time datetime="2026-10-22">22. Oktober 2026</time>')
    expect(en).toContain('<time datetime="2026-10-22">22 October 2026</time>')
  })
})

describe('renderGuidePage: contact feature', () => {
  const ABOUT = '# Über\n\nText.\n\n## Fragen\n\nSchreiben Sie an [{{contact_email}}](mailto:{{contact_email}}).\n'

  function about(markdown: string, lang: 'de' | 'en' = 'de') {
    return renderGuidePage({ ...input(lang), sections: [{ id: 'about', tocLabel: 'Über', markdown }] })
  }

  it('gates the footer sentence', () => {
    expect(de).toMatch(/<!--tw-feature:contact--><p>Fragen oder Probleme\?[^<]*<a href="mailto:__TW_SETTING_contact_email__">[\s\S]*?<\/p><!--\/tw-feature:contact-->/)
  })

  it('gates the about sentence together with the heading that only introduces it', () => {
    const page = about(ABOUT)
    expect(page).toMatch(/<!--tw-feature:contact--><h3 id="about--fragen">Fragen<\/h3>\s*<p>Schreiben Sie an <a href="mailto:__TW_SETTING_contact_email__">[\s\S]*?<\/p><!--\/tw-feature:contact-->\s*<\/section>/)
  })

  it('keeps a heading that is followed by other content', () => {
    const page = about(ABOUT + '\nNoch ein Absatz.\n')
    expect(page).toMatch(/<h3 id="about--fragen">Fragen<\/h3>\s*<!--tw-feature:contact--><p>Schreiben/)
  })

  it('leaves no empty contact sentence, no mailto and no nesting once the backend strips it', () => {
    const off = applyFeatures(about(ABOUT), { contact: false, privacy: true })
    expect(off).not.toContain('contact_email')
    expect(off).not.toContain('mailto:')
    expect(off).not.toContain('Fragen')
    expect(off).not.toContain('tw-feature')
    const on = applyFeatures(about(ABOUT), { contact: true, privacy: true })
    expect(on).toContain('mailto:__TW_SETTING_contact_email__')
    for (const page of [de, en, about(ABOUT)]) {
      const stripped = page.replace(/<!--tw-feature:contact-->[\s\S]*?<!--\/tw-feature:contact-->/g, '')
      expect(stripped).not.toMatch(/tw-feature:contact/)
      expect(stripped).not.toContain('mailto:__TW')
    }
  })

  it('refuses to put the contact sentence into a gated section', () => {
    expect(() => renderGuidePage({ ...input('de'), sections: [
      { id: 'analysis', tocLabel: 'A', markdown: ABOUT, feature: 'llm' },
    ] })).toThrow(/nest/)
  })
})

describe('renderGuidePage: AI notice', () => {
  const DE_NOTE = '<p class="note"><b>Hinweis</b> Dieses Handbuch wurde mit Unterstützung von KI erstellt und mit dem laufenden System abgeglichen. Fehler sind trotzdem möglich.'
  const EN_NOTE = '<p class="note"><b>Note</b> This guide was written with the help of AI and checked against the running system. Errors are still possible.'

  function masthead(page: string): string {
    return page.slice(page.indexOf('<header class="masthead">'), page.indexOf('</header>'))
  }

  it('shows the note in the masthead of both languages', () => {
    expect(masthead(de)).toContain(DE_NOTE)
    expect(masthead(en)).toContain(EN_NOTE)
  })

  it('gates only the sentence with the contact address', () => {
    expect(de).toContain(`${DE_NOTE}<!--tw-feature:contact--> Hinweise bitte an <a href="mailto:__TW_SETTING_contact_email__">__TW_SETTING_contact_email__</a>.<!--/tw-feature:contact--></p>`)
    expect(en).toContain(`${EN_NOTE}<!--tw-feature:contact--> Please report them to <a href="mailto:__TW_SETTING_contact_email__">__TW_SETTING_contact_email__</a>.<!--/tw-feature:contact--></p>`)
  })

  it('keeps the note, without a dangling address, when no contact is configured', () => {
    const off = applyFeatures(de, { contact: false, privacy: true, llm: true })
    expect(off).toContain(`${DE_NOTE}</p>`)
    expect(off).not.toContain('Hinweise bitte an')
    expect(off).not.toContain('mailto:')
  })

  it('shows no note on the privacy page', () => {
    for (const page of [renderPrivacyShell('de', LOGO, '2026-10-22'), renderPrivacyShell('en', LOGO, '2026-10-22')]) {
      expect(page).not.toContain('class="note"')
      expect(page).not.toMatch(/KI erstellt|help of AI/)
    }
  })
})

describe('renderGuidePage: headings', () => {
  it('shifts headings down one level and prefixes their ids with the section id', () => {
    expect(de).toContain('<h2 id="upload--hochladen">Hochladen</h2>')
    expect(de).toContain('<h3 id="upload--seite-verlassen">Seite verlassen</h3>')
    expect(de).toContain('<h3 id="analysis--seite-verlassen">Seite verlassen</h3>')
    expect(de).not.toMatch(/<h1 id=/)
  })

  it('anchors each section on its bare section id', () => {
    expect(de).toContain('<section id="upload">')
    expect(de).toContain('<a href="#upload">Hochladen</a>')
  })
})

describe('renderGuidePage: shots and assets', () => {
  it('renders a shot paragraph as a figure with marker overlays', () => {
    expect(de).not.toMatch(/<p>\s*<figure/)
    expect(de).toContain('<figure class="shot" id="shot-upload-upload">')
    expect(de).toContain('<a class="shotbox" href="#shot-upload-upload-zoom">')
    expect(de).toContain('<img src="static/shots/de/upload.png?v=2026-10-22" width="1000" height="300" alt="Die Seite „Hochladen“">')
    expect(de).toContain('<span class="mark" style="left:10%;top:10%;width:20%;height:20%" aria-hidden="true"><i>2</i></span>')
  })

  it('enlarges a shot with a :target overlay that keeps every marker and needs no script', () => {
    const start = de.indexOf('<div class="zoom" id="shot-upload-upload-zoom">')
    expect(start).toBeGreaterThan(-1)
    const zoom = de.slice(start, de.indexOf('</div></div></div>', start))
    expect(zoom).toContain('<a class="zoom-close" href="#shot-upload-upload">Schließen</a>')
    expect(zoom).toContain('style="max-width:1024px"')
    expect(zoom).toContain('src="static/shots/de/upload.png?v=2026-10-22"')
    expect(zoom.match(/class="mark"/g)).toHaveLength(META.marks.length)
    expect(en).toContain('<a class="zoom-close" href="#shot-upload-upload">Close</a>')
    expect(de).not.toContain('<script')
  })

  it('gives repeated shots unique anchors', () => {
    const page = renderGuidePage({ ...input('de'), sections: [
      { id: 'upload', tocLabel: 'Hochladen', markdown: '![A](shots/upload.png)\n\n![B](shots/upload.png)\n' },
    ] })
    const ids = [...page.matchAll(/\bid="(shot-[^"]+)"/g)].map((m) => m[1])
    expect(ids).toEqual(['shot-upload-upload', 'shot-upload-upload-zoom', 'shot-upload-upload-2', 'shot-upload-upload-2-zoom'])
  })

  it('points asset images at static/assets', () => {
    expect(de).toContain('src="static/assets/de/main-flow.svg?v=2026-10-22"')
    expect(de).not.toContain('./assets/')
  })

  it('uses ../static/ on the English page', () => {
    expect(en).toContain('href="../static/guide.css?v=2026-10-22"')
    expect(en).toContain('src="../static/shots/en/upload.png?v=2026-10-22"')
    expect(en).toContain('src="../static/assets/en/main-flow.svg?v=2026-10-22"')
    expect(en).not.toMatch(/(src|href)="static\//)
  })

  it('versions the css, logo, shot and diagram URLs with the build date', () => {
    for (const page of [de, en, renderPrivacyShell('de', LOGO, '2026-10-22')]) {
      const urls = [...page.matchAll(/\b(?:href|src)="((?:\.\.\/)*static\/[^"]+)"/g)].map((m) => m[1])
      expect(urls.length).toBeGreaterThan(1)
      for (const u of urls) expect(u).toMatch(/\?v=2026-10-22$/)
    }
  })

  it('fails the build when a shot has no recorded markers', () => {
    expect(() => renderGuidePage(input('de', () => undefined))).toThrow(/upload/)
  })
})

describe('renderGuidePage: links and page frame', () => {
  it('links the language switch and the app', () => {
    expect(de).toContain('<html lang="de">')
    expect(en).toContain('<html lang="en">')
    expect(de).toMatch(/<a href="en\/" hreflang="en" lang="en">English<\/a>/)
    expect(en).toMatch(/<a href="\.\.\/" hreflang="de" lang="de">Deutsch<\/a>/)
    expect(de).toMatch(/<a class="cta" href="\.\.\/">Direkt zu transkribierBAR/)
    expect(en).toMatch(/<a class="cta" href="\.\.\/\.\.\/">Open transkribierBAR/)
  })

  it('has the contact, the gated privacy link and the three university links in the footer', () => {
    expect(de).toMatch(/<footer[\s\S]*mailto:__TW_SETTING_contact_email__[\s\S]*<\/footer>/)
    expect(de).toMatch(/<!--tw-feature:privacy--><li><a href="datenschutz\/">Datenschutzhinweise<\/a><\/li><!--\/tw-feature:privacy-->/)
    expect(en).toMatch(/<!--tw-feature:privacy--><li><a href="privacy\/">Privacy notice<\/a><\/li><!--\/tw-feature:privacy-->/)
    for (const url of UNIVERSITY_LINKS) {
      expect(de).toContain(`<a href="${url}" target="_blank" rel="noopener">`)
    }
  })

  it('has a skip link, a labelled TOC and the brand name with BAR in the accent span', () => {
    expect(de).toContain('<a class="skip" href="#main">')
    expect(de).toContain('<main id="main">')
    expect(de).toContain('<nav class="toc" aria-label="Inhalt">')
    expect(de).toContain('<h1>transkribier<span class="bar">BAR</span></h1>')
    expect(de).toContain('aria-hidden="true"')
  })

  it('groups the TOC like the mockup', () => {
    const page = renderGuidePage({ ...input('de'), sections: [
      { id: 'about', tocLabel: 'Über', markdown: '# Über\n' },
      { id: 'refinement', tocLabel: 'Verfeinerung', markdown: '# Verfeinerung\n', feature: 'llm' },
      { id: 'format-viewer', tocLabel: 'Formatansicht', markdown: '# Formatansicht\n' },
      { id: 'presets', tocLabel: 'Voreinstellungen', markdown: '# Voreinstellungen\n' },
    ] })
    const toc = page.slice(page.indexOf('<nav class="toc"'), page.indexOf('</nav>', page.indexOf('<nav class="toc"')))
    const order = [...toc.matchAll(/class="grp">([^<]+)<|href="#([\w-]+)"/g)].map((m) => m[1] ?? m[2])
    expect(order).toEqual(['Überblick', 'about', 'Transkribieren', 'format-viewer', 'KI-Funktionen', 'refinement', 'Weiteres', 'presets'])
    // The body follows the TOC.
    const body = [...page.matchAll(/<section id="([\w-]+)">/g)].map((m) => m[1])
    expect(body).toEqual(['about', 'format-viewer', 'refinement', 'presets'])
  })

  it('makes no third-party references and has no script', () => {
    for (const page of [de, en]) {
      expect(page).not.toContain('<script')
      for (const url of absoluteUrls(page)) expect(UNIVERSITY_LINKS).toContain(url)
    }
  })
})

describe('guide.css', () => {
  const css = readFileSync(new URL('./guide.css', import.meta.url), 'utf8')

  it('numbers list steps from the list item counter, so start="3" resumes at 3', () => {
    expect(css).toMatch(/main ol > li::before \{ content: counter\(list-item\)/)
    expect(css).not.toContain('counter-reset')
    expect(css).not.toContain('counter(step)')
    const html = renderGuidePage({ ...input('de'), sections: [{ id: 'upload', tocLabel: 'U', markdown: '3. drei\n4. vier\n' }] })
    expect(html).toContain('<ol start="3">')
  })

  it('sets the masthead note in the small sans of the meta row', () => {
    expect(css).toMatch(/\.note \{[^}]*var\(--sans\)/)
  })

  it('does not clip marker badges at the image edge', () => {
    expect(css).not.toMatch(/\.shotbox \{[^}]*overflow: hidden/)
  })

  it('uses one colour pair for list steps and marker badges in both themes', () => {
    expect(css).toMatch(/main ol > li::before \{[^}]*background: var\(--badge-bg\); color: var\(--badge-ink\)/)
    expect(css).toMatch(/\.mark i \{[^}]*background: var\(--badge-bg\); color: var\(--badge-ink\)/)
    const dark = css.slice(css.indexOf('prefers-color-scheme: dark'), css.indexOf('* { box-sizing'))
    expect(dark).not.toMatch(/--(mark|badge)/)
  })
})

describe('renderPrivacyShell', () => {
  const pde = renderPrivacyShell('de', LOGO, '2026-10-22')
  const pen = renderPrivacyShell('en', LOGO, '2026-10-22')

  it('carries the notice sentinels', () => {
    expect(pde).toContain('<article class="notice" lang="__TW_NOTICE_LANG__">__TW_PRIVACY_NOTICE__</article>')
    for (const page of [pde, pen]) {
      // The language note sits on its own line before the article, so an empty fill leaves no markup.
      expect(page).toMatch(/<main id="main">\n__TW_NOTICE_FALLBACK__\n<article/)
    }
    expect(pen).toContain('__TW_PRIVACY_NOTICE__')
  })

  it('shows no date next to the operator notice', () => {
    for (const page of [pde, pen]) {
      expect(page).not.toContain('<time')
      expect(page).not.toMatch(/Oktober|October|Stand|As of/)
    }
  })

  it('resolves its links from one or two levels below the guide', () => {
    expect(pde).toContain('<html lang="de">')
    expect(pde).toContain('href="../static/guide.css?v=2026-10-22"')
    expect(pen).toContain('href="../../static/guide.css?v=2026-10-22"')
    expect(pde).toMatch(/<a href="\.\.\/en\/privacy\/" hreflang="en" lang="en">English<\/a>/)
    expect(pen).toMatch(/<a href="\.\.\/\.\.\/datenschutz\/" hreflang="de" lang="de">Deutsch<\/a>/)
    expect(pde).toMatch(/<a class="cta" href="\.\.\/\.\.\/">/)
    expect(pen).toMatch(/<a class="cta" href="\.\.\/\.\.\/\.\.\/">/)
    expect(pde).toContain('<a href="../">')
    expect(pen).toContain('<a href="../">')
  })

  it('has the footer links and no third-party references', () => {
    for (const page of [pde, pen]) {
      expect(page).not.toContain('<script')
      expect(page).toContain('mailto:__TW_SETTING_contact_email__')
      for (const url of absoluteUrls(page)) expect(UNIVERSITY_LINKS).toContain(url)
      for (const url of UNIVERSITY_LINKS) expect(page).toContain(url)
    }
  })
})
