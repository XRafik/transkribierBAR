import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import i18n from '../../i18n'
import { useStore } from '../../store'
import { SubtitleEditor } from './SubtitleEditor'
import type { TranscriptionResult } from '../../api/types'

function transcript(): TranscriptionResult {
  return {
    id: 't1',
    status: 'completed',
    text: '',
    language: 'en',
    speaker_mappings: {},
    summary: null,
    protocol: null,
    utterances: [
      { start: 1500, end: 4000, text: 'Hello there', speaker: 'SPEAKER_00' },
      { start: 100000, end: 120000, text: 'General Kenobi', speaker: 'SPEAKER_01' },
    ],
  }
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
  useStore.getState().reset()
  useStore.setState({
    transcriptionId: 't1',
    transcriptionResult: transcript(),
    speakerMappings: { SPEAKER_00: 'Alice' },
  })
})

describe('SubtitleEditor speaker field', () => {
  it('leaving the field with the shown name keeps the speaker ID and the transcript clean', () => {
    const before = useStore.getState().transcriptionResult
    render(<SubtitleEditor />)
    fireEvent.click(screen.getAllByTitle('Edit speaker name')[0])
    fireEvent.blur(screen.getByDisplayValue('Alice'))
    expect(useStore.getState().transcriptionResult).toBe(before)
    expect(useStore.getState().unsavedEdits).toBe(false)
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull()
  })

  it('typing another name changes the speaker of that row', () => {
    render(<SubtitleEditor />)
    fireEvent.click(screen.getAllByTitle('Edit speaker name')[0])
    const input = screen.getByDisplayValue('Alice')
    fireEvent.change(input, { target: { value: 'Bob' } })
    fireEvent.blur(input)
    const utterances = useStore.getState().transcriptionResult!.utterances
    expect(utterances[0].speaker).toBe('Bob')
    expect(utterances[1].speaker).toBe('SPEAKER_01')
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument()
  })
})
