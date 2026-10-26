import { describe, it, expect } from 'vitest'
import { formatFileSize, parseServerDate } from './format'

describe('formatFileSize', () => {
  it('formats bytes below 1 KB', () => {
    expect(formatFileSize(500)).toBe('500 B')
  })

  it('formats kilobytes with one decimal place', () => {
    expect(formatFileSize(1536)).toBe('1.5 KB')
  })

  it('formats megabytes with one decimal place', () => {
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5.0 MB')
  })

  it('treats exactly 1024 bytes as the KB boundary', () => {
    expect(formatFileSize(1024)).toBe('1.0 KB')
  })

  it('treats exactly 1 MB as the MB boundary, not KB', () => {
    expect(formatFileSize(1024 * 1024)).toBe('1.0 MB')
  })
})

describe('parseServerDate', () => {
  it('treats the server format as UTC', () => {
    expect(parseServerDate('2027-01-22 09:15:03').toISOString()).toBe('2027-01-22T09:15:03.000Z')
  })

  it('treats a T-separated value without designator as UTC', () => {
    expect(parseServerDate('2027-01-22T09:15:03').toISOString()).toBe('2027-01-22T09:15:03.000Z')
  })

  it('leaves an ISO string with Z alone', () => {
    expect(parseServerDate('2027-01-22T09:15:03.000Z').toISOString()).toBe('2027-01-22T09:15:03.000Z')
  })

  it('leaves an ISO string with an offset alone', () => {
    expect(parseServerDate('2027-01-22T09:15:03+02:00').toISOString()).toBe('2027-01-22T07:15:03.000Z')
  })
})
