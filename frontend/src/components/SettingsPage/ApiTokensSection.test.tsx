import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { api } from '../../api/client'
import i18n from '../../i18n'
import { formatDateTime, parseServerDate } from '../../utils/format'
import { ApiTokensSection } from './ApiTokensSection'

vi.mock('../../api/client', () => ({
  api: {
    listApiTokens: vi.fn(),
    revokeApiToken: vi.fn(),
  },
}))

const token = {
  id: 'k1',
  name: 'ci',
  prefix: 'tw_abcd',
  created_at: '2026-10-01 08:00:00',
  expires_at: '2027-01-22 09:15:03',
  last_used_at: '2026-10-20 14:30:00',
  revoked_at: null,
}

describe('ApiTokensSection dates', () => {
  beforeEach(() => {
    vi.mocked(api.listApiTokens).mockResolvedValue([token])
  })

  afterEach(async () => {
    await i18n.changeLanguage('en')
  })

  it.each(['en', 'de'])('shows locale-formatted local dates in %s', async (lang) => {
    await i18n.changeLanguage(lang)
    render(<ApiTokensSection />)
    const exp = formatDateTime(parseServerDate(token.expires_at), lang)
    const used = formatDateTime(parseServerDate(token.last_used_at), lang)
    expect(await screen.findByText(new RegExp(exp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeInTheDocument()
    expect(screen.getByText(new RegExp(used.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeInTheDocument()
    expect(screen.queryByText(/2027-01-22 09:15:03/)).not.toBeInTheDocument()
    expect(screen.queryByText(/2026-10-20 14:30:00/)).not.toBeInTheDocument()
  })
})
