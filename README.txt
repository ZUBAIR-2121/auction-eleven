Auction Eleven SFX Volume Fix
=============================

Replacement file:
apps/web/src/main.tsx

Changes:
- Raises the audible volume of every built-in SFX substantially.
- Correct/sold sounds now play at full browser volume.
- Bid/round/wrong/ready sounds are near full volume.
- Countdown tick and UI click are also much easier to hear.
- Fallback WebAudio tones are louder too.

Paste this patch into the project root and replace the existing file.
