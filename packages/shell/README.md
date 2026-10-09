# @rooman/shell

The shared header, design tokens and light/dark theme for every Rooman One app, so they all look like one product.

```tsx
import '@rooman/shell/tokens.css';
import { ShellHeader } from '@rooman/shell';

<ShellHeader
  currentApp="books"
  apps={apps}            // from Core /api/me/apps; enabled: false shows "Upgrade"
  orgs={orgs}            // from Core /api/me/orgs
  currentOrgId={orgId}
  user={user}            // from Core /api/me
  upgradeUrl="https://id.<domain>/plans"
  onSwitchOrg={switchOrg}
  onSignOut={signOut}
/>
```

- `tokens.css` holds the palette, copied from Rooman Books. Dark mode lives under `:root[data-theme='dark']`.
- The theme uses the same storage key as Books (`rooman_theme`).
- Locked apps never link to a broken page. They show greyed out with an "Upgrade" link.

Books keeps its own header until it moves onto Core in Phase 2.
