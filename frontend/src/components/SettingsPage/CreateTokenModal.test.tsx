import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import i18n from '../../i18n'
import { useStore } from '../../store'
import type { ConfigResponse } from '../../api/types'
import { CreateTokenModal } from './CreateTokenModal'

const createApiToken = vi.hoisted(() => vi.fn())

vi.mock('../../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/client')>()),
  api: { createApiToken },
}))

function setDefaultExpiry(days: number) {
  useStore.setState({ config: { api_token_default_expiry_days: days } as ConfigResponse })
}

beforeEach(async () => {
  createApiToken.mockReset()
  await i18n.changeLanguage('en')
  setDefaultExpiry(90)
})

describe('CreateTokenModal expiry', () => {
  it('offers a configured default that is not a preset, selected and used', async () => {
    setDefaultExpiry(60)
    createApiToken.mockResolvedValue({ id: '1', token: 'tw_x', name: 'a' })
    render(<CreateTokenModal onClose={vi.fn()} onCreated={vi.fn()} />)

    const select = screen.getByLabelText('Expires in') as HTMLSelectElement
    expect(select.selectedOptions[0]).toHaveTextContent('60 days')
    expect(Array.from(select.options).map((o) => o.value)).toEqual(['30', '60', '90', '365'])

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'my-script' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(createApiToken).toHaveBeenCalledWith('my-script', 60))
  })

  it('does not duplicate a default that is already a preset', () => {
    render(<CreateTokenModal onClose={vi.fn()} onCreated={vi.fn()} />)
    const select = screen.getByLabelText('Expires in') as HTMLSelectElement
    expect(Array.from(select.options).map((o) => o.value)).toEqual(['30', '90', '365'])
  })

  it('labels a one-day default in the singular and in German', async () => {
    setDefaultExpiry(1)
    render(<CreateTokenModal onClose={vi.fn()} onCreated={vi.fn()} />)
    expect(screen.getByRole('option', { name: '1 day' })).toBeInTheDocument()
    await act(() => i18n.changeLanguage('de'))
    expect(screen.getByRole('option', { name: '1 Tag' })).toBeInTheDocument()
  })
})
