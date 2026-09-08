import { Link } from 'react-router-dom';

import { EmptyState } from '@/components/ui/Feedback';

export function NotFoundPage() {
  return (
    <EmptyState
      title="Page not found"
      description="The page you were looking for does not exist or has moved."
      action={
        <Link to="/" className="btn btn-primary btn-md">
          <span>Back to dashboard</span>
        </Link>
      }
    />
  );
}
