AUCTION ELEVEN — PRE-V4 RESTORE + MOBILE PLAYABILITY PATCH

WHAT THIS DOES
1. Restores apps/web/src/main.tsx to the Premium UI + 30 manager badges build that existed immediately BEFORE the Cinematic UI v4 patch.
2. Restores apps/web/src/styles.css to that same pre-v4 build.
3. Adds a mobile-only responsiveness layer for 320px+ phones, portrait + landscape.
4. Keeps the 30 manager crest system, Blind Auction Blur + Random Wipe, player-image fit improvements, multiplayer, formation, results, chat, and the older built-in SFX system that existed before v4.
5. Removes the v4-only local WAV and stadium UI assets when you run the included cleanup script.

IMPORTANT
- Do NOT delete apps/server/player-images.
- Do NOT delete apps/web/public/manager-badges.
- The obsolete v4-only folders are apps/web/public/sfx and apps/web/public/ui.

HOW TO APPLY
Copy/merge this patch into your Auction Eleven project root, replacing files when Windows asks.
Then run APPLY-REVERT-V4-MOBILE.ps1 from the project root, or use the manual commands given by ChatGPT.
