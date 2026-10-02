import { QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { api } from './lib/api'
import { queryClient } from './lib/queries'
import { useAuth } from './store/auth'
import { bindPrefsToDocument } from './store/prefs'

bindPrefsToDocument()
useAuth.getState().init()

// Вход/выход — сбрасываем личные данные; изменения в другой вкладке — перечитываем всё.
api.onAuthChange(() => queryClient.invalidateQueries({ queryKey: ['user-data'] }))
api.onExternalChange?.(() => queryClient.invalidateQueries())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>
)
