# Third-Party Notices

Last reviewed: September 19, 2026

This file summarizes the primary third-party libraries directly used by Chess Arena. It does not replace the original license files shipped by each dependency.

| Package | Version in current lockfile | License |
|---|---:|---|
| React | 18.3.1 | MIT |
| React DOM | 18.3.1 | MIT |
| @supabase/supabase-js | 2.112.4 | MIT |
| chess.js | 1.4.0 | BSD-2-Clause |
| lucide-react | 0.468.0 | ISC |

Chess Arena also uses build/test/development dependencies listed in `package-lock.json`. Their original licenses continue to apply.

## Hosted services

The production architecture may use:

- **Supabase** for authentication, database, Realtime, and Edge Functions.
- **Netlify** for frontend hosting/deployment.
- **GitHub** for source control, CI, and issue reporting.

Those services are not bundled libraries and are governed by their own terms and policies.

## Fonts and visual assets

The core UI uses a system font stack rather than bundling a commercial font. Lucide provides the interface icons used by the app.

Do not add photos, illustrations, sound effects, fonts, logos, or other third-party assets unless their license/permission allows the intended use and the required attribution or notice is included.
