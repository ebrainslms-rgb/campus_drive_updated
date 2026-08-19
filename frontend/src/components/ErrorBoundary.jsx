import React from 'react';

/* Surfaces render-time crashes with the error text instead of a blank
   white screen, so issues are visible and debuggable. */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6" style={{ background: '#0F172A' }}>
          <div className="max-w-lg w-full rounded-2xl p-6 border border-red-500/40 bg-slate-900">
            <h2 className="text-lg font-bold text-red-400 mb-2">Something went wrong</h2>
            <pre className="text-xs text-slate-300 whitespace-pre-wrap break-words">
              {String(this.state.error && this.state.error.stack || this.state.error)}
            </pre>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
