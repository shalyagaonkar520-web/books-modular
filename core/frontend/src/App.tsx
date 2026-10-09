/**
 * Two pages, so no router library: the public landing page at "/" and the
 * sign-in page at "/signin". nginx serves index.html for every path.
 */
import { Landing } from './pages/Landing';
import { SignIn } from './pages/SignIn';

export function App({ path = window.location.pathname }: { path?: string }) {
  return path.replace(/\/+$/, '') === '/signin' ? <SignIn /> : <Landing />;
}
