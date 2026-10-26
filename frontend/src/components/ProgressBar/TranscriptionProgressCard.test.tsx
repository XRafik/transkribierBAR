import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { useStore } from '../../store'
import { api } from '../../api/client'
import i18n from '../../i18n'
import { TranscriptionProgressCard } from './TranscriptionProgressCard'

vi.mock('../../api/client', () => ({
  api: {
    connectWebSocket: vi.fn(),
    getStatus: vi.fn(),
    getTranscription: vi.fn(),
  },
}))

class FakeSocket {
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  close = vi.fn()
  receive(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) })
  }
}

const RESTART_TEXT = 'The server restarted while this transcription was running.'

// The detail line as the German UI shows it, failing if the reason has no German text.
function germanDetail(reasonKey: string): string {
  const reason = i18n.getResource('de', 'translation', reasonKey)
  expect(reason).toEqual(expect.any(String))
  return i18n.t('transcription.failedDetail', { lng: 'de', message: reason })
}

describe('TranscriptionProgressCard failure reason', () => {
  let sockets: FakeSocket[]

  beforeEach(async () => {
    vi.clearAllMocks()
    useStore.getState().reset()
    await i18n.changeLanguage('de')
    sockets = []
    vi.mocked(api.connectWebSocket).mockImplementation(() => {
      const socket = new FakeSocket()
      sockets.push(socket)
      return socket as unknown as WebSocket
    })
    useStore.setState({ transcriptionId: 't1', transcriptionStatus: 'processing' })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows a known reason from the WebSocket in the German UI', () => {
    render(<TranscriptionProgressCard />)

    act(() => sockets[0].receive({
      type: 'status', status: 'failed', error: RESTART_TEXT, error_code: 'server_restarted',
    }))

    expect(screen.getByText(germanDetail('transcription.errors.server_restarted'))).toBeInTheDocument()
    expect(screen.queryByText(new RegExp(RESTART_TEXT))).toBeNull()
  })

  it('shows the server text for a failure without a known code', () => {
    render(<TranscriptionProgressCard />)

    act(() => sockets[0].receive({ type: 'status', status: 'failed', error: 'asr exploded', error_code: 'unknown' }))

    expect(screen.getByText(/asr exploded/)).toBeInTheDocument()
  })

  it('shows a known reason from the status poll in the German UI', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
    vi.mocked(api.getStatus).mockResolvedValue({
      id: 't1', status: 'failed', progress: null, error: 'ASR job x stuck', error_code: 'timeout',
    })
    render(<TranscriptionProgressCard />)

    // Five reconnects fail, then the card falls back to polling the status.
    for (let i = 0; i < 6; i++) {
      act(() => sockets[i].onclose?.())
      await act(() => vi.advanceTimersByTimeAsync(30000))
    }

    expect(screen.getByText(germanDetail('transcription.errors.timeout'))).toBeInTheDocument()
    expect(screen.queryByText(/ASR job x stuck/)).toBeNull()
  })
})
