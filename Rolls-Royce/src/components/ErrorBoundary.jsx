import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { reportError } from '../../utils/telemetry';

class ErrorBoundary extends Component {
  static propTypes = {
    children: PropTypes.node.isRequired,
    fallback: PropTypes.node,
    fallbackRender: PropTypes.func,
    onError: PropTypes.func,
    onReset: PropTypes.func,
    resetKeys: PropTypes.arrayOf(PropTypes.any),
    resetOnPropsChange: PropTypes.bool,
    showDetails: PropTypes.bool,
    logLevel: PropTypes.oneOf(['error', 'warn', 'info']),
  };

  static defaultProps = {
    fallback: null,
    fallbackRender: null,
    onError: null,
    onReset: null,
    resetKeys: [],
    resetOnPropsChange: false,
    showDetails: process.env.NODE_ENV !== 'production',
    logLevel: 'error',
  };

  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null,
    };
    this.resetErrorBoundary = this.resetErrorBoundary.bind(this);
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      error,
      errorInfo: null,
      errorId: `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    };
  }

  componentDidCatch(error, errorInfo) {
    const { onError, logLevel } = this.props;
    const { errorId } = this.state;

    const errorContext = {
      errorId,
      componentStack: errorInfo?.componentStack || '',
      props: this.sanitizeProps(this.props),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      timestamp: new Date().toISOString(),
      url: typeof window !== 'undefined' ? window.location.href : 'unknown',
    };

    reportError(error, errorContext, logLevel);

    if (onError) {
      try {
        onError(error, errorInfo, errorContext);
      } catch (callbackError) {
        console.error('Error in onError callback:', callbackError);
      }
    }
  }

  componentDidUpdate(prevProps) {
    const { resetKeys, resetOnPropsChange } = this.props;
    const { hasError } = this.state;

    if (hasError) {
      if (resetOnPropsChange && this.props !== prevProps) {
        this.resetErrorBoundary();
      } else if (resetKeys.length > 0) {
        const hasResetKeyChanged = resetKeys.some(
          (key, index) => key !== prevProps.resetKeys?.[index]
        );
        if (hasResetKeyChanged) {
          this.resetErrorBoundary();
        }
      }
    }
  }

  sanitizeProps(props) {
    const sanitized = {};
    const excludeKeys = ['children', 'fallback', 'fallbackRender', 'onError', 'onReset'];
    
    for (const key of Object.keys(props)) {
      if (excludeKeys.includes(key)) continue;
      
      const value = props[key];
      if (typeof value === 'function') {
        sanitized[key] = `[Function: ${value.name || 'anonymous'}]`;
      } else if (value && typeof value === 'object' && value.$$typeof) {
        sanitized[key] = `[React Element: ${value.type?.displayName || value.type?.name || 'unknown'}]`;
      } else {
        try {
          JSON.stringify(value);
          sanitized[key] = value;
        } catch {
          sanitized[key] = '[Non-serializable]';
        }
      }
    }
    return sanitized;
  }

  resetErrorBoundary() {
    const { onReset } = this.props;
    
    this.setState(
      {
        hasError: false,
        error: null,
        errorInfo: null,
        errorId: null,
      },
      () => {
        if (onReset) {
          try {
            onReset();
          } catch (resetError) {
            console.error('Error in onReset callback:', resetError);
          }
        }
      }
    );
  }

  renderFallback() {
    const { fallback, fallbackRender, showDetails } = this.props;
    const { error, errorId, errorInfo } = this.state;

    if (fallbackRender) {
      return fallbackRender({
        error,
        errorId,
        errorInfo,
        resetErrorBoundary: this.resetErrorBoundary,
        showDetails,
      });
    }

    if (fallback) {
      return typeof fallback === 'function' 
        ? fallback({ error, errorId, resetErrorBoundary: this.resetErrorBoundary })
        : fallback;
    }

    return (
      <div
        style={{
          padding: '24px',
          margin: '16px',
          borderRadius: '8px',
          backgroundColor: '#fff5f5',
          border: '1px solid #fc8181',
          color: '#c53030',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
        role="alert"
      >
        <h2 style={{ margin: '0 0 12px', fontSize: '18px', fontWeight: 600 }}>
          Something went wrong
        </h2>
        <p style={{ margin: '0 0 16px', lineHeight: 1.5 }}>
          We apologize for the inconvenience. The error has been logged and our team has been notified.
        </p>
        
        {showDetails && error && (
          <details style={{ marginBottom: '16px' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 500 }}>
              Error Details
            </summary>
            <pre
              style={{
                marginTop: '8px',
                padding: '12px',
                backgroundColor: '#fff',
                borderRadius: '4px',
                overflow: 'auto',
                fontSize: '12px',
                lineHeight: 1.4,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {error.message || String(error)}
              {errorId && `\n\nError ID: ${errorId}`}
            </pre>
          </details>
        )}

        <button
          onClick={this.resetErrorBoundary}
          style={{
            padding: '10px 20px',
            backgroundColor: '#e53e3e',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            fontSize: '14px',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'background-color 0.2s',
          }}
          onMouseOver={(e) => (e.target.style.backgroundColor = '#c53030')}
          onMouseOut={(e) => (e.target.style.backgroundColor = '#e53e3e')}
        >
          Try Again
        </button>
      </div>
    );
  }

  render() {
    const { hasError } = this.state;
    const { children } = this.props;

    if (hasError) {
      return this.renderFallback();
    }

    return children;
  }
}

export const withErrorBoundary = (WrappedComponent, errorBoundaryProps = {}) => {
  const displayName = WrappedComponent.displayName || WrappedComponent.name || 'Component';
  
  const WithErrorBoundary = (props) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <WrappedComponent {...props} />
    </ErrorBoundary>
  );

  WithErrorBoundary.displayName = `withErrorBoundary(${displayName})`;
  WithErrorBoundary.WrappedComponent = WrappedComponent;

  return WithErrorBoundary;
};

export default ErrorBoundary;