import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    // Check if this is a ResizeObserver error
    const errorMessage = error?.message || error?.toString() || '';
    if (
      typeof errorMessage === 'string' &&
      (errorMessage.includes('ResizeObserver loop') ||
       errorMessage.includes('ResizeObserver loop completed with undelivered notifications'))
    ) {
      // Suppress ResizeObserver errors - don't update state
      return null;
    }
    // For other errors, update state to show error UI
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Check if this is a ResizeObserver error
    const errorMessage = error?.message || error?.toString() || '';
    if (
      typeof errorMessage === 'string' &&
      (errorMessage.includes('ResizeObserver loop') ||
       errorMessage.includes('ResizeObserver loop completed with undelivered notifications'))
    ) {
      // Suppress ResizeObserver errors - don't log or show
      return;
    }
    // Log other errors
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      // Only show error UI for non-ResizeObserver errors
      return (
        <div style={{ padding: 20, textAlign: 'center' }}>
          <h2>Something went wrong.</h2>
          <p>{this.state.error?.message || 'An unexpected error occurred'}</p>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

