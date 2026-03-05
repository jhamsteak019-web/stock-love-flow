import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex min-h-[60vh] items-center justify-center p-6">
          <div className="flex flex-col items-center gap-4 text-center max-w-md">
            <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>
            <h2 className="text-xl font-bold text-foreground">
              May nangyaring error
            </h2>
            <p className="text-sm text-muted-foreground">
              May problema sa page na ito. Hindi nito apektado ang ibang bahagi ng website. I-try mo i-refresh ang page.
            </p>
            <div className="flex gap-3 mt-2">
              <Button onClick={this.handleReset} variant="outline" className="gap-2">
                <RefreshCw className="h-4 w-4" />
                I-retry
              </Button>
              <Button onClick={() => window.location.href = '/dashboard'} className="gap-2">
                Bumalik sa Dashboard
              </Button>
            </div>
            {this.state.error && (
              <details className="mt-4 w-full text-left">
                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                  Technical details
                </summary>
                <pre className="mt-2 text-xs bg-muted p-3 rounded-md overflow-auto max-h-32 text-muted-foreground">
                  {this.state.error.message}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
