/**
 * Where the other apps live. Set VITE_BOOKS_URL / VITE_BOOKINGS_URL at build
 * time; without them the URL is derived from this site's own host, so
 * id.<domain> (or <domain>) links to books.<domain>.
 */

function siblingUrl(app: string, location: Pick<Location, 'protocol' | 'hostname'> = window.location): string {
  const base = location.hostname.replace(/^(id|www)\./, '');
  return `${location.protocol}//${app}.${base}`;
}

export function appUrls(location?: Pick<Location, 'protocol' | 'hostname'>) {
  return {
    books: import.meta.env.VITE_BOOKS_URL || siblingUrl('books', location),
    bookings: import.meta.env.VITE_BOOKINGS_URL || siblingUrl('bookings', location),
  };
}
