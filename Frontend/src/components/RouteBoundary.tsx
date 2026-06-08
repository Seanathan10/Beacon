import { Component, ReactNode, Suspense } from "react";

/**
 * Visible fallback shown while a lazy-loaded route chunk is being fetched.
 * Replaces the previous `fallback={null}`, which rendered a blank screen.
 */
export function RouteLoading() {
    return (
        <div
            role="status"
            aria-live="polite"
            className="flex min-h-screen w-full items-center justify-center bg-white dark:bg-neutral-900"
        >
            <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-neutral-300 border-t-emerald-500 dark:border-neutral-700 dark:border-t-emerald-400" />
                <span className="text-sm text-neutral-500 dark:text-neutral-400">Loading…</span>
            </div>
        </div>
    );
}

/**
 * Shown when a chunk fails to load (network error, mid-deploy rollout) so the
 * user gets an actionable message and a retry instead of a silent blank page.
 */
function RouteError() {
    return (
        <div className="flex min-h-screen w-full items-center justify-center bg-white px-6 dark:bg-neutral-900">
            <div className="flex max-w-sm flex-col items-center gap-4 text-center">
                <h1 className="text-lg font-semibold text-neutral-800 dark:text-neutral-100">
                    Something went wrong
                </h1>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    We couldn’t load this page. This can happen after an update or with a flaky
                    connection.
                </p>
                <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600"
                >
                    Reload
                </button>
            </div>
        </div>
    );
}

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
    constructor(props: { children: ReactNode }) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidCatch(error: unknown) {
        console.error("Route render error:", error);
    }

    render() {
        if (this.state.hasError) return <RouteError />;
        return this.props.children;
    }
}

/**
 * Wraps a lazy-loaded route element with an error boundary and a Suspense
 * fallback so chunk-load failures and pending loads are both handled gracefully.
 */
export function RouteBoundary({ children }: { children: ReactNode }) {
    return (
        <ErrorBoundary>
            <Suspense fallback={<RouteLoading />}>{children}</Suspense>
        </ErrorBoundary>
    );
}
