AUCTION ELEVEN — FIX: PLAYER IMAGE STILL NOT APPEARING (photo coverage gap)
================================================================================

WHY THE LAST FIX WASN'T ENOUGH
----------------------------------
The previous fix stopped a TRANSIENT hiccup from being cached forever.
But your new screenshots showed the fallback silhouette consistently
across multiple stages (2/6, 4/6, 5/6) of the SAME round for the SAME
player — that's not a transient hiccup, that's a real, permanent "no
photo found" case for that specific player, which no amount of retrying
would ever fix.

THE REAL GAP
------------
Your photo resolver only trusts a Wikidata "P18" (image) claim. Plenty
of real, well-known footballers have a perfectly good photo on their
Wikipedia article's infobox but no formal P18 statement attached in
Wikidata — P18 has to be manually added by a Wikidata editor, while an
infobox photo just needs someone to upload one on Wikipedia itself.
These are common, and every one of them was permanently falling back
to the silhouette with no way to ever recover.

THE FIX
-------
apps/server/src/photoResolver.ts now tries a second, independent data
source when Wikidata has no P18 image: Wikipedia's own public REST
summary API (a stable, well-documented, unauthenticated endpoint),
which resolves the same underlying Wikimedia-hosted lead image without
needing the stricter Wikidata claim. It also sanity-checks the summary's
description/extract actually looks like a footballer before accepting
it, so it won't accidentally pick up an unrelated person who happens to
share a name.

apps/server/src/blindReveal.ts: the fallback-fetch failure is now
always logged (previously only outside production) so you can check
your Render logs for the exact reason (which data source failed and
why) if a specific player is still showing the silhouette.

WHAT'S IN THIS FOLDER
------------------------
  apps/server/src/photoResolver.ts        — the real fix
  apps/server/src/blindReveal.ts          — always-on failure logging
  apps/server/test/photoResolver.test.ts  — new test file (didn't
    exist before), 4 tests covering: normal Wikidata success, the new
    Wikipedia-summary fallback succeeding, a summary that's clearly
    not a footballer being rejected, and the original Wikidata error
    surfacing correctly when both sources fail.

VERIFIED
--------
  npm run typecheck  -> pass
  npm test           -> 150/150 pass (146 previous + 4 new)
  npm run build      -> pass

HOW TO APPLY (PowerShell)
---------------------------
1. Unzip this folder, then copy the 3 files into your project,
   overwriting the originals at the same paths:
     apps/server/src/photoResolver.ts
     apps/server/src/blindReveal.ts
     apps/server/test/photoResolver.test.ts

2. Verify locally:
     cd apps\server
     npm run typecheck
     npm test
     npm run build

3. Commit and push:
     git add -A
     git commit -m "Add Wikipedia-summary photo fallback for players with no Wikidata P18 image"
     git push

WHAT TO EXPECT AFTER DEPLOYING
---------------------------------
Real photos should now appear for meaningfully more players, including
ones that were permanently stuck on the silhouette before. It's still
possible for a genuinely obscure player to have no usable photo on
EITHER Wikidata or Wikipedia — that's a real data-coverage limit, not
a bug, and the game correctly falls back to the silhouette rather than
breaking. If you spot a SPECIFIC player still always failing after
this, check your Render logs for the "blind_reveal_asset_fallback"
warning — it now always logs the exact reason.
