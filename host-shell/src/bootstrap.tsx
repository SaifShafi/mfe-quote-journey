import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from './App'

const el = document.getElementById('root')
if (el) {
  createRoot(el).render(
    <BrowserRouter>
      <App />
    </BrowserRouter>,
  )
}
