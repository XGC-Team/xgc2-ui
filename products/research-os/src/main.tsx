import { MotionConfig } from 'framer-motion'
import { lazy, Suspense, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

const Preview = lazy(() => import('./design-system/Preview'))

document.documentElement.lang = localStorage.getItem('research-ui-locale') === 'en' ? 'en' : 'zh'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <Suspense fallback={null}>
        {new URLSearchParams(window.location.search).has('ui-kit') ? <Preview /> : <App />}
      </Suspense>
    </MotionConfig>
  </StrictMode>,
)
