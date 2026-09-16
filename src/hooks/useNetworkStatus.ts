import { useState, useEffect } from 'react';

interface NetworkStatus {
  isOnline: boolean;
  lastSyncTime: string | null;
  queuedWrites: number;
}

/**
 * Hook to track real-time network/sync status from the Electron main process
 * or the web IndexedDB-backed adapter.
 *
 * Returns live isOnline flag, last sync timestamp, and number of queued offline writes.
 */
export function useNetworkStatus(): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>({
    isOnline: navigator.onLine,
    lastSyncTime: null,
    queuedWrites: 0,
  });

  useEffect(() => {
    // Initial fetch
    window.api.getNetworkStatus().then((res) => {
      if (res.success && res.data) {
        setStatus({
          isOnline: res.data.isOnline,
          lastSyncTime: res.data.lastSyncTime,
          queuedWrites: res.data.queuedWrites,
        });
      }
    }).catch(() => {});

    // Subscribe to live updates
    window.api.subscribeToSyncUpdates();

    const handleNetworkChange = (isOnline: boolean) => {
      setStatus((prev) => ({ ...prev, isOnline }));
      // Re-fetch full status when connectivity changes
      window.api.getNetworkStatus().then((res) => {
        if (res.success && res.data) {
          setStatus({
            isOnline: res.data.isOnline,
            lastSyncTime: res.data.lastSyncTime,
            queuedWrites: res.data.queuedWrites,
          });
        }
      }).catch(() => {});
    };

    window.api.onNetworkStatusChange(handleNetworkChange);

    // Also listen to browser online/offline events (web fallback)
    const handleBrowserOnline = () => handleNetworkChange(true);
    const handleBrowserOffline = () => handleNetworkChange(false);
    window.addEventListener('online', handleBrowserOnline);
    window.addEventListener('offline', handleBrowserOffline);

    // Poll every 10 seconds for status updates
    const interval = setInterval(() => {
      window.api.getNetworkStatus().then((res) => {
        if (res.success && res.data) {
          setStatus({
            isOnline: res.data.isOnline,
            lastSyncTime: res.data.lastSyncTime,
            queuedWrites: res.data.queuedWrites,
          });
        }
      }).catch(() => {});
    }, 10_000);

    return () => {
      window.removeEventListener('online', handleBrowserOnline);
      window.removeEventListener('offline', handleBrowserOffline);
      clearInterval(interval);
    };
  }, []);

  return status;
}

/**
 * Hook to get just the online/offline boolean with a simpler API.
 */
export function useIsOnline(): boolean {
  const { isOnline } = useNetworkStatus();
  return isOnline;
}

/**
 * Hook to get the number of pending offline writes.
 */
export function useOfflineQueueSize(): number {
  const { queuedWrites } = useNetworkStatus();
  return queuedWrites;
}
