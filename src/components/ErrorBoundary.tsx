import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props { children: ReactNode; module?: string; }
interface State { hasError: boolean; error: Error | null; errorInfo: ErrorInfo | null; }

function safeStr(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (typeof val === 'bigint') return val.toString();
  if (typeof val === 'function' || typeof val === 'symbol') return '';
  if (val instanceof Error) return val.message;
  try { return JSON.stringify(val); } catch { return '[Object]'; }
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, errorInfo: null };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { hasError: true, error: error instanceof Error ? error : new Error(safeStr(error)) };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    console.error(`[ErrorBoundary${this.props.module ? `:${this.props.module}` : ''}]`, error, errorInfo);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleHardReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const msg = safeStr(this.state.error?.message) || 'Unknown error';
      const isStringError = msg.includes('replaceAll') || msg.includes('Cannot read propert') || msg.includes('objects are not valid');
      return (
        <div className="flex items-center justify-center min-h-[400px] p-6">
          <div className="bg-slate-900 border border-red-500/30 rounded-2xl p-8 max-w-md w-full text-center space-y-4">
            <AlertTriangle size={48} className="mx-auto text-red-400" />
            <h2 className="text-lg font-bold text-white">
              {safeStr(this.props.module) ? `${safeStr(this.props.module)} ` : ''}Something went wrong
            </h2>
            <p className="text-sm text-slate-400">
              {isStringError
                ? 'A data formatting error occurred. The module has been recovered.'
                : msg.length > 200 ? msg.slice(0, 200) + '...' : msg}
            </p>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={this.handleReload}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-semibold transition-colors"
              >
                <RefreshCw size={14} />
                Reload Module
              </button>
              <button
                onClick={this.handleHardReload}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm transition-colors"
              >
                Full Reload
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
