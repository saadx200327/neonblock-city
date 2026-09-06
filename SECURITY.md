# Cardfolio security model

## Scope

Cardfolio stores user collection metadata, acquisition prices, optional grading/certification identifiers and optional card photos. It does not need payment-card data, government IDs or private location history.

## Authentication and authorization

- Cloud mode uses Supabase Auth.
- Every user-owned table has Row Level Security enabled.
- Policies require `auth.uid()` to equal the row owner for reads and writes.
- Supabase publishable keys may be sent to the browser; service-role/secret keys must never be exposed client-side.
- User metadata is not used to authorize data access.

## Storage

- `card-images` is private.
- Object paths begin with the authenticated user's UUID.
- Storage policies limit select/insert/update/delete to that path owner.
- Client uploads are limited to recognized image MIME types and 12 MiB; the app compresses normal photos before upload.

## Marketplace credentials

- eBay credentials are server-side environment variables only.
- The browser calls `/api/ebay`; it never receives the eBay client secret.
- Marketplace responses must be labeled according to what they actually represent (for example active asking prices rather than completed-sale comps).

## Scanner

- OCR runs on-device in the MVP where practical.
- OCR output is treated as untrusted candidate text, not verified card identity.
- A user review step is required before adding a scan.
- Scanner matching is not authentication or counterfeit detection.

## Web hardening

- Vercel sends `X-Content-Type-Options`, a restrictive referrer policy and a camera-only Permissions Policy.
- External links use a new browsing context and should use `noopener noreferrer`.
- Third-party scripts and APIs are minimized; any future CSP must account for Tesseract workers, TCGdex and Supabase.

## Threats to continue testing

- IDOR/BOLA across all portfolio CRUD actions.
- Storage path traversal and cross-user signed URL leakage.
- XSS through card names, notes, marketplace titles and OCR text.
- API abuse/rate exhaustion of marketplace providers.
- Oversized/decompression-bomb image uploads.
- Credential leakage in frontend bundles, logs and error messages.
- Price-poisoning or bad matching that could create misleading portfolio values.
