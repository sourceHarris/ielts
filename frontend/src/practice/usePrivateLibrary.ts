import { useEffect, useState } from 'react'
import type { PrivateLibrary } from './privatePractice'

export function usePrivateLibrary() {
  const [library, setLibrary] = useState<PrivateLibrary | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/private/library', { signal: controller.signal })
      .then(response => { if (!response.ok) throw Error('Your private library is not connected on this server.'); return response.json() })
      .then(value => {
        if (!Array.isArray(value.books) || !Array.isArray(value.assets)) throw Error('The private catalog needs to be imported again.')
        setLibrary(value)
      }).catch(error => { if (!controller.signal.aborted) setError(error.message) })
    return () => controller.abort()
  }, [])
  return { library, error }
}
