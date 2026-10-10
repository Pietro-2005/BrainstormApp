import { describe, expect, it } from 'vitest'
import { fileExtensionForMime, formatBytes, formatDuration, titleFromText } from './format'

describe('formatDuration', () => {
  it('formats minutes and hours', () => {
    expect(formatDuration(0)).toBe('0:00')
    expect(formatDuration(65_000)).toBe('1:05')
    expect(formatDuration(30 * 60_000)).toBe('30:00')
    expect(formatDuration(3_725_000)).toBe('1:02:05')
  })
})

describe('titleFromText', () => {
  it('uses the first words and marks truncation', () => {
    expect(titleFromText('Buy milk.')).toBe('Buy milk')
    expect(titleFromText('  This is a quick voice note to test the recorder.  ')).toBe('This is a quick voice note to…')
    expect(titleFromText('')).toBe('')
  })
})

describe('formatBytes / fileExtensionForMime', () => {
  it('formats sizes', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(80 * 1024 * 1024)).toBe('80 MB')
    expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5 MB')
  })
  it('maps recorder mime types to extensions', () => {
    expect(fileExtensionForMime('audio/webm;codecs=opus')).toBe('webm')
    expect(fileExtensionForMime('audio/mp4')).toBe('m4a')
    expect(fileExtensionForMime('audio/mpeg')).toBe('mp3')
  })
})
