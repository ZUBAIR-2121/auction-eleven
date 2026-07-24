AUCTION ELEVEN COMPLETE UPGRADE

INCLUDED CHANGES
- Starting squad choices: 6, 7, 8, 9, 10, or 11.
- Every manager can purchase up to 10 substitutes after completing the starting squad, while budget remains.
- Maximum squad size is starting squad + 10 substitutes.
- Server validates the substitute limit and protects the budget needed to finish the starting squad.
- PASS PLAYER button for the current footballer.
- A manager who passes cannot bid again during that footballer's current round.
- If every eligible manager passes, the auction round ends immediately.
- Passed managers are excluded from automatic unsold-player assignment.
- Portrait phones/tablets show a rotate-device screen.
- Landscape gameplay is fitted to the device viewport.
- Main page scrolling is disabled during short landscape gameplay; only internal panels scroll.
- Compact phone and tablet landscape layouts are included.

HOW TO INSTALL
1. Close the running local game.
2. Extract this ZIP.
3. Copy the folders inside over your existing auction-eleven project folder.
4. Allow Windows to replace the six matching files.

BUILD FROM THE PROJECT ROOT
cd C:\Auction\auction-eleven
npm install
npm run build

UPDATE THE LIVE WEBSITE
After the build succeeds, run:
git add .
git commit -m "Add substitutes pass button and landscape gameplay"
git push origin main

WHAT HAPPENS NEXT
- Vercel automatically rebuilds the frontend.
- Render automatically rebuilds the backend.
- Keep the existing Vercel and Render projects and environment variables.
- Wait until both deployments show successful/live.
- Open https://auction-eleven-web.vercel.app
- On desktop, use Ctrl+Shift+R for a hard refresh.

IMPORTANT
Both Render and Vercel must finish deploying because this upgrade changes shared socket events, backend auction rules, and frontend controls.
