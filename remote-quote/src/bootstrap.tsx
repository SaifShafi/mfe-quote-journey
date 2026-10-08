import { createRoot } from 'react-dom/client'
import { VehicleDetails } from './VehicleDetails'
// Standalone only. Inside the shell these come from the host, which is the
// point: the remote does not own the tokens it styles itself with.
import '../../host-shell/src/tokens.css'

// Standalone mode: the remote runs on its own at :3001 as a normal app.
// This file is NOT used when the host consumes the remote.
const el = document.getElementById('root')
if (el) {
  createRoot(el).render(
    <main style={{ maxWidth: '40rem', margin: '0 auto', padding: '2rem 1rem' }}>
      <h1 style={{ fontFamily: 'var(--font-sans)', color: 'var(--color-text)' }}>
        remote-quote, standalone
      </h1>
      <VehicleDetails />
    </main>,
  )
}
