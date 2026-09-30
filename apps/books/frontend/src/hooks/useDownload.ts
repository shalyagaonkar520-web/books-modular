import { useCallback, useState } from 'react';

import { ApiError } from '@/api/client';
import { useAppContent } from '@/app/AppContentContext';
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
  const { t } = useAppContent();
  const [downloading, setDownloading] = useState(false);

  const download = useCallback(
    async (run: () => Promise<void>) => {
      setDownloading(true);
      try {
        await run();
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : t('common.error.download'));
      } finally {
        setDownloading(false);
      }
    },
    [toast, t],
  );

  return { download, downloading };
}
