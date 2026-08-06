import { Component } from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';

export class ErrorBoundary extends Component {
    state = {
        hasError: false,
    };

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('Uncaught error:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-paper flex items-center justify-center p-6">
                    <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-8 border border-neutral-100 text-center relative overflow-hidden">
                        <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
                            <AlertTriangle className="text-red-500" size={32} />
                        </div>

                        <h2 className="text-2xl font-bold text-neutral-900 mb-2">
                            Something went wrong
                        </h2>
                        <p className="text-neutral-500 mb-8 text-sm leading-relaxed">
                            Our ink spilled! We apologize for the inconvenience.
                            <br />
                            <span className="font-mono text-xs bg-neutral-100 px-2 py-1 rounded mt-2 inline-block text-neutral-600 max-w-full truncate">
                                {this.state.error?.message || 'Unknown Error'}
                            </span>
                        </p>

                        <button
                            onClick={() => window.location.reload()}
                            className="w-full py-4 bg-neutral-900 text-white rounded-xl font-bold hover:shadow-lg transition-all flex items-center justify-center gap-2"
                        >
                            <RefreshCcw size={18} />
                            Reload Application
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
