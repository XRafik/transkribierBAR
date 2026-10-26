import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useStore } from '../../store'
import { api } from '../../api/client'
import i18n from '../../i18n'
import { TranscriptionList } from './TranscriptionList'
import type { TranscriptionListItem } from '../../api/types'

vi.mock('../../api/client', () => ({
  api: {
    listTranscriptions: vi.fn(),
    getTranscription: vi.fn(),
    getRefinement: vi.fn(),
    getTranslation: vi.fn(),
  },
}))

function item(id: string, status: string): TranscriptionListItem {
  return {
    id,
    file_id: `f-${id}`,
    original_filename: `${id}.mp3`,
    status,
    language: 'en',
    model: 'm',
    created_at: '2026-01-01T00:00:00Z',
    file_size: 1,
    expires_at: '2026-04-01T00:00:00Z',
    archived: false,
    title: null,
    has_video: false,
  }
}

async function openItem(name: string, items: TranscriptionListItem[]) {
  vi.mocked(api.listTranscriptions).mockResolvedValue(items)
  render(<TranscriptionList />)
  fireEvent.click(await screen.findByText(name))
  await waitFor(() => expect(useStore.getState().currentView).toBe('detail'))
}

describe('TranscriptionList opening a transcription', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
    useStore.getState().reset()
  })

  it('opening a processing transcription after a translated one leaves no translated rows', async () => {
    useStore.setState({
      translatedUtterances: [{ start: 0, end: 1, text: 'old' }] as never,
      translationLanguage: 'de',
      activeView: 'translated',
    })
    await openItem('p1.mp3', [item('p1', 'processing')])
    const s = useStore.getState()
    expect(s.translatedUtterances).toBeNull()
    expect(s.activeView).toBe('original')
  })

  it('opening another transcription after leaving with unsaved edits clears the stale unsaved flag', async () => {
    useStore.setState({ unsavedEdits: true, currentView: 'archive' })
    await openItem('p2.mp3', [item('p2', 'processing')])
    expect(useStore.getState().leaveReason()).toBeNull()
  })
})

describe('TranscriptionList status badge', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
    useStore.getState().reset()
  })

  afterEach(async () => {
    await i18n.changeLanguage('en')
  })

  it('shows German status labels', async () => {
    await i18n.changeLanguage('de')
    vi.mocked(api.listTranscriptions).mockResolvedValue([
      item('a', 'completed'),
      item('b', 'failed'),
      item('c', 'pending'),
      item('d', 'processing'),
      item('e', 'weird'),
    ])
    render(<TranscriptionList />)
    await screen.findByText('a.mp3')
    expect(screen.getByText('Abgeschlossen')).toBeInTheDocument()
    expect(screen.getByText('Fehlgeschlagen')).toBeInTheDocument()
    expect(screen.getByText('Wartend')).toBeInTheDocument()
    expect(screen.getByText('In Bearbeitung')).toBeInTheDocument()
    expect(screen.getByText('weird')).toBeInTheDocument()
  })

  it('formats the creation date in the UI language', async () => {
    vi.mocked(api.listTranscriptions).mockResolvedValue([item('a', 'completed')])
    render(<TranscriptionList />)
    await screen.findByText('a.mp3')
    expect(screen.queryByText(/\d{2}\.\d{2}\.\d{4}/)).not.toBeInTheDocument()
    expect(screen.getByText(new Date('2026-01-01T00:00:00Z').toLocaleDateString('en'))).toBeInTheDocument()
  })

  it('shows English status labels', async () => {
    vi.mocked(api.listTranscriptions).mockResolvedValue([item('a', 'completed')])
    render(<TranscriptionList />)
    await screen.findByText('a.mp3')
    expect(screen.getByText('Completed')).toBeInTheDocument()
  })
})
