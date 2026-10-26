import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import i18n from './i18n'
import { useStore } from './store'
import { api } from './api/client'
import App from './App'
import type { ConfigResponse, PresetBundle, PresetBundleExpanded, TranscriptionPreset } from './api/types'

vi.mock('./api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api/client')>()
  return {
    ...actual,
    api: {
      getConfig: vi.fn(),
      getTranscriptionPresets: vi.fn(),
      getAnalysisPresets: vi.fn(),
      getRefinementPresets: vi.fn(),
      getBundles: vi.fn(),
      getDefaultBundle: vi.fn(),
    },
  }
})

const config: ConfigResponse = {
  asr_backend: 'murmurai',
  whisper_models: ['base', 'large-v3'],
  default_model: 'base',
  llm_available: false,
  logout_url: '',
  popular_languages: [],
  enabled_languages: [],
}

function preset(id: string, overrides: Partial<TranscriptionPreset>): TranscriptionPreset {
  return {
    id,
    name: id,
    language: null,
    model: 'base',
    min_speakers: 1,
    max_speakers: 2,
    initial_prompt: null,
    hotwords: null,
    created_at: null,
    updated_at: null,
    ...overrides,
  }
}

function bundle(id: string, transcriptionPresetId: string | null, isDefault = false): PresetBundle {
  return {
    id,
    name: id,
    transcription_preset_id: transcriptionPresetId,
    analysis_preset_id: null,
    refinement_preset_id: null,
    translate_language: null,
    is_default: isDefault,
    created_at: null,
    updated_at: null,
  }
}

const germanNoSpeakers = preset('P', { language: 'de', model: 'large-v3', min_speakers: 0, max_speakers: 0 })
const frenchTwoSpeakers = preset('Q', { language: 'fr', min_speakers: 2, max_speakers: 2 })

function serve(bundles: PresetBundle[]) {
  const presets = [germanNoSpeakers, frenchTwoSpeakers]
  const defaultBundle = bundles.find((b) => b.is_default)
  vi.mocked(api.getConfig).mockResolvedValue(config)
  vi.mocked(api.getTranscriptionPresets).mockResolvedValue(presets)
  vi.mocked(api.getAnalysisPresets).mockResolvedValue([])
  vi.mocked(api.getRefinementPresets).mockResolvedValue([])
  vi.mocked(api.getBundles).mockResolvedValue(bundles)
  vi.mocked(api.getDefaultBundle).mockResolvedValue(defaultBundle
    ? {
        ...defaultBundle,
        transcription_preset: presets.find((p) => p.id === defaultBundle.transcription_preset_id) ?? null,
        analysis_preset: null,
        refinement_preset: null,
      } satisfies PresetBundleExpanded
    : null)
}

// The bundle field's label is not tied to it, so find it through its placeholder option
async function bundleSelect(): Promise<HTMLSelectElement> {
  return (await screen.findByRole('option', { name: 'Select a bundle...' })).closest('select')!
}

beforeEach(async () => {
  vi.clearAllMocks()
  await i18n.changeLanguage('en')
  useStore.getState().reset()
  useStore.setState({
    config: null,
    currentView: 'upload',
    file: { id: 'f1', original_filename: 'talk.mp3', media_type: 'audio/mpeg', file_size: 1, has_video: false },
    bundles: [],
    activeBundleId: null,
    transcriptionPresets: [],
  })
})

describe('Upload settings and the default bundle', () => {
  it('applies the default bundle\'s transcription preset at startup', async () => {
    serve([bundle('A', 'P', true)])
    render(<App />)
    expect((await bundleSelect()).value).toBe('A')
    expect(screen.getByLabelText('Transcription language')).toHaveValue('de')
    expect(screen.getByLabelText('Detect speakers')).not.toBeChecked()
    expect(screen.getByLabelText('Quality')).toHaveValue('large-v3')

    // Applied once: a later change by hand survives the next render
    fireEvent.change(screen.getByLabelText('Transcription language'), { target: { value: 'en' } })
    act(() => useStore.getState().setBundles([bundle('A', 'P', true)]))
    expect(screen.getByLabelText('Transcription language')).toHaveValue('en')
  })

  it('keeps the default bundle\'s model when the configuration arrives after the bundles', async () => {
    serve([bundle('A', 'P', true)])
    let sendConfig!: (value: ConfigResponse) => void
    vi.mocked(api.getConfig).mockReturnValue(new Promise((resolve) => { sendConfig = resolve }))
    render(<App />)
    await waitFor(() => expect(useStore.getState().activeBundleId).toBe('A'))
    await act(async () => sendConfig(config))
    expect(screen.getByLabelText('Quality')).toHaveValue('large-v3')
    expect(screen.getByLabelText('Transcription language')).toHaveValue('de')
  })

  it('leaves the settings alone when the default bundle has no transcription preset', async () => {
    serve([bundle('A', null, true)])
    render(<App />)
    expect((await bundleSelect()).value).toBe('A')
    expect(screen.getByLabelText('Transcription language')).toHaveValue('auto')
    expect(screen.getByLabelText('Detect speakers')).toBeChecked()
    expect(screen.getByLabelText('Quality')).toHaveValue('base')
  })

  it('applies the preset of a bundle chosen by hand', async () => {
    serve([bundle('A', 'P', true), bundle('B', 'Q')])
    render(<App />)
    const select = await bundleSelect()
    fireEvent.change(select, { target: { value: 'B' } })
    expect(select.value).toBe('B')
    expect(screen.getByLabelText('Transcription language')).toHaveValue('fr')
    expect(screen.getByLabelText('Detect speakers')).toBeChecked()
  })
})
