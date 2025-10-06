import React from 'react'

type State = { hasError: boolean; message?: string; stack?: string }

export default class ErrorBoundary extends React.Component<
  React.PropsWithChildren<{}>,
  State
> {
  state: State = { hasError: false }

  static getDerivedStateFromError(err: any): State {
    return { hasError: true, message: String(err?.message || err), stack: String(err?.stack || '') }
  }

  componentDidCatch(err: any) {
    console.error('[App Error]', err)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 text-sm">
          <h1 className="mb-2 text-lg font-semibold">Something went wrong.</h1>
          {this.state.message && <div className="mb-2 text-error">{this.state.message}</div>}
          <pre className="rounded-md bg-[#111] p-3 text-xs text-[#ddd] overflow-auto ring-1 ring-border max-h-[40vh]">
            {this.state.stack}
          </pre>
        </div>
      )
    }
    return this.props.children
  }
}
