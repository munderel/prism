'use client';

import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage?: string;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error?.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="flex min-h-screen items-center justify-center bg-background">
            <div className="text-center">
              <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
                Something went wrong
              </h2>
              <p className="text-[var(--text-secondary)] mb-4">
                An unexpected error occurred.
              </p>
              {process.env.NODE_ENV !== 'production' && this.state.errorMessage && (
                <p className="text-xs text-red-400 font-mono mb-4 max-w-md mx-auto break-words">
                  {this.state.errorMessage}
                </p>
              )}
              <button
                onClick={() => this.setState({ hasError: false, errorMessage: undefined })}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-colors"
              >
                Try again
              </button>
            </div>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
