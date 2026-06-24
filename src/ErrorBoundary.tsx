import React from "react";

/**
 * Catches any render-time crash and shows a readable message + a one-tap
 * recovery button instead of a white screen. Critical on mobile, where there
 * are no devtools: "Reset app" unregisters the service worker and clears all
 * caches, which fixes a stale/broken cached shell from a previous deploy.
 */
export async function hardReset(): Promise<void> {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if (typeof caches !== "undefined") {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } finally {
    location.reload();
  }
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="crash">
          <h2>Something broke.</h2>
          <pre>{this.state.error.message}</pre>
          <p>
            This is often a stale cache from a previous version. Resetting clears
            it and reloads the latest.
          </p>
          <button className="btn-primary" onClick={() => void hardReset()}>
            Reset app
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
