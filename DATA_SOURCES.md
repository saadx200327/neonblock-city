# Cardfolio data sources

Cardfolio must never represent unsupported, stale, or fabricated marketplace data as live market value.

## TCGdex

Use: Pokémon card catalog metadata, images, and any pricing fields actually returned by TCGdex.

Policy: No price is shown unless the API response contains a usable numeric observation. Missing values remain unpriced. TCGdex catalog matching is a candidate-resolution aid, not authentication of a physical card.

## eBay Browse API

Use: Current active listings only when valid eBay application credentials are configured server-side.

Policy: Active listing prices are asking prices, not completed-sale comps. Cardfolio may summarize active listing observations (for example median/low/high) only when clearly labeled as active asking-price data. It must not call these sold comps. Credentials remain server-side.

## eBay web search links

Use: Outbound links to active and completed/sold search result pages when an exact marketplace API source is not available.

Policy: Cardfolio does not scrape these pages or ingest their results automatically in the MVP.

## Grading companies

PSA, Beckett/BGS, CGC, SGC, TAG and other graders are third parties. Cardfolio stores the user's declared grader, grade and certification number and provides official outbound submission/lookup paths where available. Cardfolio does not claim to authenticate, grade, certify or submit a card unless a documented first-party integration is actually configured.

## Unsupported marketplaces

OfferUp, Facebook Marketplace, Poshmark, Whatnot, COMC, Goldin, Fanatics Collect/PWCC, Card Ladder, Alt and other services must not appear as integrated live feeds unless Cardfolio has a documented, authorized data-access method. Stable outbound links may be added where lawful and useful.

## Valuation principles

- Every automated quote must retain provider/source type, currency, observation time and methodology.
- Missing market data stays missing.
- Manual values are visibly labeled manual.
- Portfolio charts use stored observations; no synthetic historical backfill.
- Estimated values are not guarantees of sale price, liquidity, authenticity, grade or future performance.
