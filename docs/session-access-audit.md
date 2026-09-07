# Cardfolio access checkpoint

Mission: improve the existing Cardfolio product on GitHub + Supabase + Vercel. Access audit remains in progress; no production completion claims.

## Verified
- Source: saadx200327/neonblock-city, branch cardfolio-mvp, inspected starting commit 821c99fb0c78d1376f74f0cc042e0a71b7edd794. Cloned successfully into the session workspace.
- GitHub connector: branch creation succeeded. This document tests repository file writes on an isolated audit branch.
- Supabase: Cardfolio project tvxwzkununcwxiwvrslh is active and SQL queries succeed.
- All ten public application tables report RLS enabled. Inspected holding, profile, watchlist and image-storage ownership policies. Cross-user behavior has not yet been tested.
- Storage: card-images is private, with 12 MiB limit and JPEG/PNG/WebP/HEIC/HEIF MIME allowlist.
- Public Auth settings: Google enabled, email enabled, signups enabled. End-to-end login has NOT been verified.

## Access blockers / unknowns
- Vercel connector lists team team_4sSd0YIrjh1mlefS95vYhY0q (saadahmed0020-3481s-projects), but its project list is empty. Production URL, deployment access, environment variables and logs remain unverified.
- No command-line GitHub/Vercel/Supabase credentials are configured. GitHub connector is the available write path.
- Google Cloud console renders Site Unavailable in the session browser; OAuth client configuration has not been inspected.
- Supabase dashboard access is now verified after GitHub email device verification and a fresh OAuth request. Google provider client ID and callback controls are accessible; no secret was revealed.
- P0 confirmed configuration defect: Site URL is http://localhost:3000 and Redirect URLs is empty. Exact production URL is required before correcting these settings.
- Vercel team/project listing was rechecked and still returns zero projects.

## Initial defect register
1. P0 access: establish Vercel project scope and exact live production URL before deployment.
2. P0 authentication: exercise real Google login, callback, persistence, refresh, logout and returning login after access is resolved.
3. P1 architecture: trace multiple layered cardfolio scripts before editing; repository README still describes NeonBlock City.
4. P1 verification: package.json test currently performs only JavaScript syntax checks on six files; it is not end-to-end validation.
5. P1 ingestion/security: verify persistence, durable processing, valuation provenance, upload validation and two-user isolation against the implementation.

No application logic or production database schema was changed by this checkpoint.
