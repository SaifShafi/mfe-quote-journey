import { Component, type ReactNode } from 'react'
import { RemoteUnavailable } from './RemoteUnavailable'

/**
 * One of these per remote. A remote that fails to load must cost you that
 * remote and not the page, so the shell degrades instead of going blank.
 *
 * This is the piece you can only test by killing the remote's server, which is
 * also the proof that composition is happening over the network.
 */
export class RemoteBoundary extends Component<
  { name: string; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    // In production this is where the remote's name and build version belong,
    // otherwise a stack trace from a composed app tells you almost nothing.
    console.error(`[shell] remote "${this.props.name}" failed to load`, error)
  }

  render() {
    if (this.state.failed) {
      return <RemoteUnavailable name={this.props.name} />
    }
    return this.props.children
  }
}
