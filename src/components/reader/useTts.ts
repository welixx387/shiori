import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { plainText, type Block } from '../../lib/text'

export type TtsStatus = 'idle' | 'playing' | 'paused'

interface Options {
  blocks: Block[]
  rate: number
  voiceURI: string | null
  onFinished?: () => void
}

/** Озвучка главы через Web Speech API: по абзацу за раз, с подсветкой текущего. */
export function useTts({ blocks, rate, voiceURI, onFinished }: Options) {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window
  const [status, setStatus] = useState<TtsStatus>('idle')
  const [active, setActive] = useState<number | null>(null)
  const queue = useMemo(
    () => blocks.map((b, i) => ({ b, i })).filter(({ b }) => b.type === 'p' || b.type === 'quote' || b.type === 'h'),
    [blocks]
  )
  const pos = useRef(0)
  const runId = useRef(0)
  const onFinishedRef = useRef(onFinished)
  onFinishedRef.current = onFinished
  const settings = useRef({ rate, voiceURI })
  settings.current = { rate, voiceURI }

  const speakAt = useCallback(
    (qi: number, run: number) => {
      if (run !== runId.current) return
      const item = queue[qi]
      if (!item) {
        setStatus('idle')
        setActive(null)
        onFinishedRef.current?.()
        return
      }
      pos.current = qi
      setActive(item.i)
      const block = item.b
      const text = block.type === 'img' || block.type === 'break' ? '' : plainText(block.text)
      const u = new SpeechSynthesisUtterance(text)
      u.lang = 'ru-RU'
      u.rate = settings.current.rate
      const voice = speechSynthesis.getVoices().find((v) => v.voiceURI === settings.current.voiceURI)
      if (voice) u.voice = voice
      u.onend = () => speakAt(qi + 1, run)
      u.onerror = (e) => {
        if (e.error === 'interrupted' || e.error === 'canceled') return
        speakAt(qi + 1, run)
      }
      speechSynthesis.speak(u)
    },
    [queue]
  )

  const start = useCallback(
    (fromBlock?: number) => {
      if (!supported) return
      speechSynthesis.cancel()
      const run = ++runId.current
      let qi = 0
      if (fromBlock !== undefined) {
        const idx = queue.findIndex((q) => q.i >= fromBlock)
        qi = idx === -1 ? 0 : idx
      }
      setStatus('playing')
      // Небольшая пауза после cancel() — иначе Chrome иногда «проглатывает» первую фразу.
      setTimeout(() => speakAt(qi, run), 80)
    },
    [queue, speakAt, supported]
  )

  const stop = useCallback(() => {
    if (!supported) return
    runId.current++
    speechSynthesis.cancel()
    setStatus('idle')
    setActive(null)
  }, [supported])

  const pause = useCallback(() => {
    if (!supported) return
    speechSynthesis.pause()
    setStatus('paused')
  }, [supported])

  const resume = useCallback(() => {
    if (!supported) return
    speechSynthesis.resume()
    setStatus('playing')
  }, [supported])

  const skip = useCallback(
    (delta: number) => {
      const next = Math.max(0, Math.min(queue.length - 1, pos.current + delta))
      speechSynthesis.cancel()
      const run = ++runId.current
      setStatus('playing')
      setTimeout(() => speakAt(next, run), 60)
    },
    [queue.length, speakAt]
  )

  // Chrome останавливает длинную озвучку через ~15 секунд — периодически «будим» синтезатор.
  useEffect(() => {
    if (status !== 'playing' || !supported) return
    const t = setInterval(() => {
      if (speechSynthesis.speaking && !speechSynthesis.paused) {
        speechSynthesis.pause()
        speechSynthesis.resume()
      }
    }, 10000)
    return () => clearInterval(t)
  }, [status, supported])

  // При смене главы или уходе со страницы — тишина.
  useEffect(() => () => {
    runId.current++
    if (supported) speechSynthesis.cancel()
  }, [blocks, supported])

  return { supported, status, active, start, stop, pause, resume, skip }
}
