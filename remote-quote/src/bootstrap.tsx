import { createRoot } from 'react-dom/client'
import { VehicleDetails } from './VehicleDetails'

// Standalone mode: the remote runs on its own at :3001 as a normal app.
// This file is NOT used when the host consumes the remote.
const el = document.getElementById('root')
if (el) {
  createRoot(el).render(
    <main>
      <h1>remote-quote, standalone</h1>
      <VehicleDetails />
    </main>,
  )
}
