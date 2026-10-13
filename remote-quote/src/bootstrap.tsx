import { createRoot } from 'react-dom/client'
import { VehicleDetails } from './VehicleDetails'
// Standalone only. Inside the shell these come from the host: the remote does
// not own the tokens it styles itself with.
import '../../host-shell/src/tokens.css'
import '../../host-shell/src/shell.css'

// Standalone mode: the remote runs on its own at :3001 as a normal app. This
// file is not used when the host consumes the remote.
//
// Standalone is also one half of the Stage 2 axe experiment: the isolated run
// happens against this page, the composed run against the shell.
const el = document.getElementById('root')
if (el) {
  createRoot(el).render(
    <main className="shell-main">
      <h1>remote-quote, standalone</h1>
      <VehicleDetails />
    </main>,
  )
}
