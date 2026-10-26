import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useMediaRecorder } from './useMediaRecorder'

type FakeTrack = { kind: 'audio' | 'video'; stop: ReturnType<typeof vi.fn> }

class FakeMediaStream {
  tracks: FakeTrack[]
  constructor(tracks: FakeTrack[] = []) { this.tracks = tracks }
  getTracks() { return this.tracks }
  getAudioTracks() { return this.tracks.filter((t) => t.kind === 'audio') }
  getVideoTracks() { return this.tracks.filter((t) => t.kind === 'video') }
}

class FakeMediaRecorder {
  static isTypeSupported() { return true }
  state = 'inactive'
  mimeType = ''
  onstop: (() => void) | null = null
  start() { this.state = 'recording' }
  stop() {
    this.state = 'inactive'
    this.onstop?.()
  }
}

let micTrack: FakeTrack
let cameraTrack: FakeTrack

beforeEach(() => {
  micTrack = { kind: 'audio', stop: vi.fn() }
  cameraTrack = { kind: 'video', stop: vi.fn() }
  vi.stubGlobal('MediaStream', FakeMediaStream)
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder)
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn(async (c: MediaStreamConstraints) =>
        new FakeMediaStream([c.video ? cameraTrack : micTrack])),
    },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function startCameraRecording() {
  const hook = renderHook(() => useMediaRecorder({ useMicrophone: true, useCamera: true }))
  await act(() => hook.result.current.start())
  expect(hook.result.current.state).toBe('recording')
  expect(hook.result.current.stream?.getVideoTracks()).toEqual([cameraTrack])
  return hook
}

describe('useMediaRecorder camera track', () => {
  it('stops the camera when the recording is stopped', async () => {
    const { result } = await startCameraRecording()
    act(() => result.current.stop())
    expect(result.current.state).toBe('stopped')
    expect(micTrack.stop).toHaveBeenCalled()
    expect(cameraTrack.stop).toHaveBeenCalled()
  })

  it('stops the camera when the recording is discarded', async () => {
    const { result } = await startCameraRecording()
    act(() => result.current.discard())
    expect(micTrack.stop).toHaveBeenCalled()
    expect(cameraTrack.stop).toHaveBeenCalled()
  })

  it('stops the camera when the recorder unmounts', async () => {
    const { unmount } = await startCameraRecording()
    unmount()
    expect(micTrack.stop).toHaveBeenCalled()
    expect(cameraTrack.stop).toHaveBeenCalled()
  })
})
