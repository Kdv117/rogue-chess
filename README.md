# Limp Longbow

An original ragdoll-physics archery duel that runs in the browser (phone or computer). No build step: just `index.html`, `style.css`, `config.js` and `game.js`.

## How to play
- **Drag anywhere and let go** to shoot. Pull farther for more power; dotted line shows the path.
- Headshots do 3x damage. Arrows stick in bodies, and kills send the enemy ragdolling off their platform.
- Every 5th stage is a boss. Coins buy upgrades and special arrows in the **Shop**.
- Tap an arrow type at the bottom to switch: Normal, Fire (burn), Ice (slows enemy), Boom (explodes), Triple.
- **II** button pauses (shop, mods, restart).

The first launch starts with a **maxed-out save** (all upgrades maxed, all arrows unlocked, 99,999 coins). The Mods menu has *Max out save* / *Reset save* buttons.

## Mods menu
Gravity, game speed (slow-mo), enemy fire rate, aim preview, god mode, one-hit kills, big heads, hit sparks, and jump to any stage.

## Adding your own stuff
Open `config.js`:
- **New arrow type**: add an entry to `ARROWS` (color, price, `spread`, `damageMult`, `knockback`, and `onHitFighter` / `onImpact` hooks).
- **New upgrade**: add to `UPGRADES`, then use `upLvl('yourId')` in `game.js`.
- **Balance**: everything in `CONFIG` (gravity, HP, damage, enemy accuracy, boss frequency, rewards).

## Play it on your phone (GitHub Pages)
1. Open this repo on github.com (desktop site view helps): **Settings → Pages**.
2. Under *Build and deployment*, Source: **Deploy from a branch**.
3. Pick the branch with the game and folder **/ (root)**, then **Save**.
4. After a minute the page shows your link (`https://<you>.github.io/rogue-chess/`). Open it and turn your phone sideways.
