# Footballer photo licensing notes

Auction Eleven v0.2 does not bundle scraped photographs or copy images from search engines.

The server follows this process:

1. Search Wikidata for the footballer.
2. Read the footballer's Wikimedia Commons image reference.
3. Request the Commons image URL and extended metadata.
4. Return the thumbnail, creator credit, licence name, licence URL and Commons file-page URL.
5. Display a `©` attribution link on the image.

## Before public release

- Open and review every Commons file page used by the game.
- Confirm that the exact licence allows your intended use.
- Preserve creator attribution and licence links.
- Follow ShareAlike requirements when they apply.
- Do not imply that a player, photographer, club or Wikimedia endorses the game.
- Replace any disputed, inaccurate or unsuitable image.
- Keep a release-time asset manifest containing the filename, author, source page, licence and date reviewed.

Hotlinking does not remove attribution or licence obligations. For a stable commercial release, consider downloading approved images, optimising them, keeping an attribution manifest, and serving them from your own licensed asset pipeline.

This file is practical project guidance, not legal advice.
