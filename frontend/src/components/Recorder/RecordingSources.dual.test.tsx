import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import i18n from '../../i18n'
import { RecordingSources } from './RecordingSources'

vi.mock('../../utils/devicePermissions', () => ({
  useDevicePermission: () => ({ state: 'granted', refresh: vi.fn() }),
}))

vi.mock('../../utils/platformDetect', () => ({
  getSystemAudioSupport: () => 'dual-device',
}))

const mic1 = { kind: 'audioinput', deviceId: 'mic1', label: 'Mic 1' }
const mic2 = { kind: 'audioinput', deviceId: 'mic2', label: 'Mic 2' }

function stubDevices(devices: object[]) {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      enumerateDevices: vi.fn().mockResolvedValue(devices),
      getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [] }),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
  })
}

function renderSources(overrides: Partial<React.ComponentProps<typeof RecordingSources>>) {
  const onSecondAudioDeviceChange = vi.fn()
  render(
    <RecordingSources
      useMicrophone
      onUseMicrophoneChange={vi.fn()}
      audioDeviceId="mic1"
      onAudioDeviceChange={vi.fn()}
      captureSystemAudio
      onCaptureSystemAudioChange={vi.fn()}
      secondAudioDeviceId=""
      onSecondAudioDeviceChange={onSecondAudioDeviceChange}
      useCamera={false}
      onUseCameraChange={vi.fn()}
      videoDeviceId=""
      onVideoDeviceChange={vi.fn()}
      {...overrides}
    />,
  )
  return onSecondAudioDeviceChange
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
})

describe('RecordingSources second device auto-select', () => {
  it('replaces a second device that equals the microphone', async () => {
    stubDevices([mic1, mic2])
    const onChange = renderSources({ secondAudioDeviceId: 'mic1' })
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('mic2'))
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('clears a second device that equals the microphone when no other device exists', async () => {
    stubDevices([mic1])
    const onChange = renderSources({ secondAudioDeviceId: 'mic1' })
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(''))
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('keeps a valid second device', async () => {
    stubDevices([mic1, mic2, { kind: 'audioinput', deviceId: 'mic3', label: 'Mic 3' }])
    const onChange = renderSources({ secondAudioDeviceId: 'mic3' })
    await new Promise((r) => setTimeout(r, 20))
    expect(onChange).not.toHaveBeenCalled()
  })
})
