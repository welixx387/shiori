import { useEffect } from 'react'
import { SITE } from '../lib/constants'

export function useTitle(title?: string | null) {
  useEffect(() => {
    document.title = title ? `${title} — ${SITE.name}` : `${SITE.name} — ранобэ онлайн`
  }, [title])
}
