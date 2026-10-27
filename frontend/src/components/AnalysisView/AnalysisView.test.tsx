import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import i18n from '../../i18n'
import { useStore } from '../../store'
import { api, ApiError } from '../../api/client'
import { AnalysisView } from './AnalysisView'

const item = {
  id: 'an1',
  template: 'summary',
  language: 'en',
  llm_provider: null,
  llm_model: null,
  created_at: null,
  source: null,
}

const summary = {
  summary: 'Overall',
  chapters: [{ title: 'Intro', summary: 'Hello', start_time: 0, end_time: 5 }],
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
  useStore.setState({ transcriptionId: 't1', analyses: [item] })
  vi.spyOn(api, 'getAnalysisTemplates').mockResolvedValue([])
  vi.spyOn(api, 'listAnalyses').mockResolvedValue([item])
  vi.spyOn(api, 'getAnalysis').mockResolvedValue(summary)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('AnalysisView deleting an analysis', () => {
  it('shows the server detail when the delete fails and keeps the analysis', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.spyOn(api, 'deleteAnalysis').mockRejectedValue(new ApiError(500, 'Server said no'))
    render(<AnalysisView />)

    fireEvent.click(await screen.findByTitle('Delete'))

    expect(await screen.findByRole('alert')).toHaveTextContent('Server said no')
    expect(useStore.getState().analyses).toHaveLength(1)
  })

  it('shows a generic message for a non-API failure', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.spyOn(api, 'deleteAnalysis').mockRejectedValue(new TypeError('Failed to fetch'))
    render(<AnalysisView />)

    fireEvent.click(await screen.findByTitle('Delete'))

    expect(await screen.findByRole('alert')).toHaveTextContent('Deleting the analysis failed.')
  })
})

describe('AnalysisView removing an item', () => {
  async function openCard() {
    render(<AnalysisView />)
    fireEvent.click(await screen.findByText('Summary with chapters'))
    return screen.findByTitle('Remove chapter')
  }

  it('does not call the API when the confirmation is cancelled', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const del = vi.spyOn(api, 'deleteAnalysisItem').mockResolvedValue(summary)
    fireEvent.click(await openCard())

    expect(confirmSpy).toHaveBeenCalledWith('Remove this item from the analysis?')
    expect(del).not.toHaveBeenCalled()
  })

  it('calls the API when the confirmation is accepted', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const del = vi.spyOn(api, 'deleteAnalysisItem').mockResolvedValue(summary)
    fireEvent.click(await openCard())

    await waitFor(() => expect(del).toHaveBeenCalledWith('t1', 'an1', 'chapters', 0))
  })
})
