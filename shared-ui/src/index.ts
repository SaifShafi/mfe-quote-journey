// The whole package surface. Both remotes import from here and nothing else,
// so this file is the shared-ui contract.
//
// Importing the stylesheet from the barrel means the CSS arrives with the
// components whoever loads them first, and arrives exactly once when the
// package is a federated singleton. See webpack configs.
import './ui.css'

export { Button, type ButtonProps } from './Button'
export { Input, type InputProps } from './Input'
export { Panel, type PanelProps } from './Panel'

// Bumped by hand when the public surface changes. Stage 5 ships a breaking
// change to this package deliberately and watches what the host does, which
// needs a version the runtime can actually compare.
export const SHARED_UI_VERSION = '0.1.0'
