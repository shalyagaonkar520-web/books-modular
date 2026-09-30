import { useEffect, useState } from 'react';

import { DEFAULT_MODULE_PRICING, fetchModulePricing, type ModulePricing } from '@/api/modulePricing';

/**
 * The module price catalog. Starts with the bundled copy (so prices show
 * immediately) and swaps in the server's once it arrives; a failed fetch
 * keeps the bundled copy.
 */
export function useModulePricing(): ModulePricing {
  const [catalog, setCatalog] = useState<ModulePricing>(DEFAULT_MODULE_PRICING);

  useEffect(() => {
    const controller = new AbortController();
    void fetchModulePricing(controller.signal).then((next) => {
      if (!controller.signal.aborted) setCatalog(next);
    });
    return () => controller.abort();
  }, []);

  return catalog;
}
