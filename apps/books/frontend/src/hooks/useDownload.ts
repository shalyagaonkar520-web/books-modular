import { useCallback, useState } from 'react';

import { ApiError } from '@/api/client';
import { useToast } from '@/components/ui/Toast';

/**
 * Runs a file download (PDF/Excel extract) and surfaces failures.
 *
 * Export buttons used to call the API directly from onClick, so a rejected
 * promise became an unhandled rejection: the download just silently never
 * happened and the user was given no reason why.
 */
export function useDownload() {
  const toast = useToast();
  const [downloading, setDownloading] = useState(false);

  const download = useCallback(
    async (run: () => Promise<void>) => {
      setDownloading(true);
      try {
        await run();
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : 'The download could not be completed. Please try again.');
      } finally {
        setDownloading(false);
      }
    },
    [toast],
  );

  return { download, downloading };
}
