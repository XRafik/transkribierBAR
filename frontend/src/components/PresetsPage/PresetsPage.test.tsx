import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useStore } from '../../store'
import i18n from '../../i18n'
import { api } from '../../api/client'
import { PresetsPage } from './PresetsPage'
import type { AnalysisPreset, ConfigResponse, PresetBundle, TranscriptionPreset } from '../../api/types'

vi.mock('../../api/client', () => ({
  api: {
    createTranscriptionPreset: vi.fn(),
    updateTranscriptionPreset: vi.fn(),
    updateAnalysisPreset: vi.fn(),
  },
}))

const config: ConfigResponse = {
  asr_backend: 'whisperx',
  whisper_models: ['large-v3-turbo'],
  default_model: 'large-v3-turbo',
  llm_available: false,
  logout_url: '',
  popular_languages: [],
  enabled_languages: [],
}

function buildPreset(overrides: Partial<TranscriptionPreset> = {}): TranscriptionPreset {
  return {
    id: 'p1',
    name: 'Interview',
    language: null,
    model: 'large-v3-turbo',
    min_speakers: 2,
    max_speakers: 4,
    initial_prompt: null,
    hotwords: null,
    created_at: null,
    updated_at: null,
    ...overrides,
  }
}

function renderPage(presets: TranscriptionPreset[] = []) {
  useStore.setState({ config, transcriptionPresets: presets })
  render(<PresetsPage />)
}

const initialState = useStore.getState()

beforeEach(async () => {
  vi.clearAllMocks()
  useStore.setState(initialState, true)
  await i18n.changeLanguage('en')
})

describe('PresetsPage — transcription preset speakers', () => {
  it('a new transcription preset saves speaker detection on with 1–2 speakers', async () => {
    vi.mocked(api.createTranscriptionPreset).mockResolvedValue(buildPreset())
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: /New preset/ }))
    fireEvent.change(screen.getByPlaceholderText('Preset name'), { target: { value: 'Mine' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(api.createTranscriptionPreset).toHaveBeenCalled())
    expect(api.createTranscriptionPreset).toHaveBeenCalledWith(
      expect.objectContaining({ min_speakers: 1, max_speakers: 2 }),
    )
  })

  it('editing a preset keeps its speaker counts', async () => {
    vi.mocked(api.updateTranscriptionPreset).mockResolvedValue(buildPreset({ name: 'Renamed' }))
    renderPage([buildPreset()])

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.change(screen.getByDisplayValue('Interview'), { target: { value: 'Renamed' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(api.updateTranscriptionPreset).toHaveBeenCalled())
    expect(api.updateTranscriptionPreset).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ name: 'Renamed', min_speakers: 2, max_speakers: 4 }),
    )
  })

  it('switching detection off saves 0/0', async () => {
    vi.mocked(api.updateTranscriptionPreset).mockResolvedValue(buildPreset({ min_speakers: 0, max_speakers: 0 }))
    renderPage([buildPreset()])

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Detect speakers' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(api.updateTranscriptionPreset).toHaveBeenCalled())
    expect(api.updateTranscriptionPreset).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ min_speakers: 0, max_speakers: 0 }),
    )
  })
})

describe('PresetsPage — analysis preset chapters and agenda', () => {
  it('editing an analysis preset keeps its chapters and agenda', async () => {
    const chapterHints = [
      { title: 'Intro', description: 'Welcome' },
      { title: 'Q&A', description: 'Questions' },
    ]
    const preset: AnalysisPreset = {
      id: 'a1',
      name: 'Lecture',
      template: 'summary',
      custom_prompt: null,
      language: null,
      chapter_hints: chapterHints,
      agenda: '1. Intro\n2. Q&A',
      created_at: null,
      updated_at: null,
    }
    vi.mocked(api.updateAnalysisPreset).mockResolvedValue({ ...preset, name: 'Renamed' })
    useStore.setState({ config, analysisPresets: [preset] })
    render(<PresetsPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Analysis' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.change(screen.getByDisplayValue('Lecture'), { target: { value: 'Renamed' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(api.updateAnalysisPreset).toHaveBeenCalled())
    expect(api.updateAnalysisPreset).toHaveBeenCalledWith(
      'a1',
      expect.objectContaining({ name: 'Renamed', chapter_hints: chapterHints, agenda: '1. Intro\n2. Q&A' }),
    )
  })
})

function buildBundle(overrides: Partial<PresetBundle> = {}): PresetBundle {
  return {
    id: 'b1',
    name: 'Bundle A',
    transcription_preset_id: null,
    analysis_preset_id: null,
    refinement_preset_id: null,
    translate_language: null,
    is_default: false,
    created_at: null,
    updated_at: null,
    ...overrides,
  }
}

function renderBundles(bundles: PresetBundle[]) {
  useStore.setState({ config, bundles })
  render(<PresetsPage />)
  fireEvent.click(screen.getByRole('button', { name: i18n.t('presets.bundles') }))
}

describe('PresetsPage — language names on cards', () => {
  it.each([
    ['en', 'English'],
    ['de', 'Englisch'],
  ])('shows the bundle translation language name in %s', async (lang, name) => {
    await i18n.changeLanguage(lang)
    renderBundles([buildBundle({ translate_language: 'en' })])
    expect(screen.getByText(new RegExp(`${name}$`))).toBeInTheDocument()
    expect(screen.queryByText(/: en$/)).not.toBeInTheDocument()
  })

  it('falls back to the code when a language has no translation', () => {
    renderBundles([buildBundle({ translate_language: 'xx' })])
    expect(screen.getByText(/: xx$/)).toBeInTheDocument()
  })

  it('shows the language name on a transcription preset card', async () => {
    await i18n.changeLanguage('de')
    renderPage([buildPreset({ language: 'de' })])
    expect(screen.getByText(/large-v3-turbo · Deutsch/)).toBeInTheDocument()
  })
})
