import { useToast } from '@/components/ui/Toast';

/** Copy text to the clipboard and say so (or that it failed). */
export function useCopy() {
  const toast = useToast();
  return (text: string, what: string) => {
    void navigator.clipboard?.writeText(text).then(
      () => toast.success(`${what} copied.`),
      () => toast.error(`Could not copy the ${what.toLowerCase()}.`),
    );
  };
}
