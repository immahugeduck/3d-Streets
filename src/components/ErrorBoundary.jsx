import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, message: '' }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || 'Unknown error' }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  handleReset() {
    this.setState({ hasError: false, message: '' })
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100dvh', gap: 16,
        background: '#0a0a0f', color: '#e0e0e0', padding: 24,
        fontFamily: 'system-ui, sans-serif', textAlign: 'center',
      }}>
        <div style={{ fontSize: 40 }}>⚠️</div>
        <div style={{ fontSize: 18, fontWeight: 600 }}>Something went wrong</div>
        <div style={{ fontSize: 13, color: '#888', maxWidth: 320 }}>{this.state.message}</div>
        <button
          onClick={() => this.handleReset()}
          style={{
            marginTop: 8, padding: '10px 24px', borderRadius: 8,
            background: '#2563eb', color: '#fff', border: 'none',
            fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Try again
        </button>
      </div>
    )
  }
}
