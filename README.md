# Obsidian Spire

A single-player electronic quest board game for the browser, in the style of the talking-tower games of the early 1980s. You play the Warden of Hearthmoor against a computer rival, Ser Vael of Frostvale. Both of you race to pull the Sun, Moon and Star shards out of six barrows, storm the Spire at the centre of the board, and kindle its crown. A shared Gloom track rises every other round, and if it fills, both of you lose.

The rules, map, art, pieces and sounds are all original to this project.

## Playing it

The quickest way is the bundled single file: open `dist/obsidian-spire.html` in a browser. It needs no server and no network access apart from Google Fonts (it falls back to system serif faces without them).

To run from source, serve the repository root over HTTP, since ES modules don't load from `file://`:

```sh
cd obsidian_spire
python3 -m http.server 8000
# then open http://localhost:8000/
```

## What's on the table

- **The board**: a painted disc of six provinces (Hearthmoor, Saltmere, Emberwold, Frostvale, Thornwood, Sunscar) around the Ashlands. Thirty spaces joined by roads, all drawn to a canvas texture at load time.
- **The Spire**: a black three.js tower with buttresses, glowing window slits, a rune band and a crystal crown that lights the board. It flares, pulses and changes colour with whatever the console is showing.
- **Plastic markers**: keeps, market tents, domed shrines and barrow mounds, plus the two Warden pawns, all procedural geometry with a clear-coated toy-plastic finish. Barrows grow a floating gem once their shard is known.
- **The console**: the tower's face pulled up beside the board. A crystal lamp, a backlit picture window with 54 slide glyphs, a red three-digit seven-segment LED, an amber ticker, three crown sockets and a nine-key pad (Yes, No, Next, Fight, Flee, Stay, Ledger, Repeat, End). Every event comes through it, with synthesised square-wave sound.
- **Peg ledgers**: one scorecard per Warden. Company, coin and provisions each have a tens row and a units row of holes with a coloured peg in each. Relics, the ward and Spire progress get their own holes, and shards sit in gem sockets. A purple peg on the Gloom strip at the top of the screen tracks the doom clock.

## Warden's eye: the first-person view

Press `V` (or the Warden's eye button) at any point in a game to switch from the board to your Warden's own eyes, and again to switch back. Both views run the same game; the board keeps track of everything while you ride.

- **The look.** The scene is rendered at 300 lines and every pixel is snapped to sixteen colours picked from the EGA's 64, with a 4x4 ordered dither, then scaled up with hard edges. Nothing is filtered or smoothed, so everything on screen reads like a 640x350 EGA display, only sharper.
- **Overland.** The board's map is rebuilt at walking scale (seven metres to a board unit). Keeps, market stalls, domed shrines, barrow mounds and the Spire are life size, the provinces are tiled with their own ground textures, mountains ring the horizon, and the Spire's crown glows in whatever colour the console is showing. `←`/`→` (or A/D) turn you toward each road, `↑` (or W) rides it, and the console's Stay key still works.
- **Barrows and the Spire.** These become grid dungeons. `W`/`S` step, `A`/`D` turn, `Q`/`E` sidestep and `Esc` climbs out. The automap fills in as your torch shows the way. Walking into a barrow's antechamber wakes its wights, the tomb gate brings out the Barrow King, and the shard sits on the altar behind him. The Spire is three floors: the Sentinels' gate hall, the Ash Warden's hall and the crown room, where the Crown Dragon lies coiled behind the crown and three sockets wait for the kindling song.
- **The art.** Every foe, townsperson, prop and texture is original pixel art in the 16-colour palette: brigands, dire wolves, Gloom Hounds, wraiths, Bog Trolls, Giant Spiders, Cinder Imps, Frost Ogres, Dune Scorpions, barrow-wights, the Barrow King, the Spire Sentinels, the Ash Warden, the Crown Dragon, the merchant, priest, steward, pilgrim, peddler, sellsword, raven and Ser Vael himself, plus your own sword hand at the bottom of the screen.

## Rules in brief

On your turn, click a glowing space to travel (two roads with a Swift Steed) or press Stay. Your company eats one provision per twelve soldiers afterwards.

| Space | What happens |
| --- | --- |
| Your keep | Collects 4 coin of tithes per round you're away, up to 32. Cheap men-at-arms and stores. |
| Market | Sellswords, provisions, and three of the six relics. |
| Shrine | Pray for pilgrims, pay the oracle to reveal a barrow's shard, buy a ward. |
| Barrow | Fight wights in the antechamber to read the sigil, then a Barrow King in the tomb for the shard. |
| Wilds | A random event: brigands, wolves, wraiths, fog, storms, fever, caches, sellswords, pilgrims, peddlers, omens, Gloom surges, or the province's own beast (Bog Trolls that heal, venomous Giant Spiders, coin-stealing Cinder Imps, hard-hitting Frost Ogres, armoured Dune Scorpions). |
| The Spire | With all three shards: beat the Sentinels, then the Ash Warden, then the fire-breathing Crown Dragon, then repeat the crown's note sequence on the sockets. The climb is one push: turn back before the dragon falls and every guardian rises again. A wrong note costs three of the company and the crown sings a new sequence. |

Battles are fought one exchange at a time. Each Fight press is a roll weighted by your company against the foe's strength. A lost exchange costs about one man per six points of the foe's remaining strength (more for fierce, venomous and fire-breathing foes), so big fights need big companies. You can Flee whenever you like, and a battle's result stays up until you press Next or Enter. If your company is wiped out you're routed: home with five survivors and half your purse, and the Gloom goes up a notch.

Keyboard: `Y` yes, `N` no, `X` next, `F` fight, `L` flee, `S` stay, `I` ledger, `R` repeat, `E` end, `1`/`2`/`3` crown sockets, `Space` hurries a message along.

## Campaign

Three chapters, each unlocked by clearing the one before. Progress and a mid-game save (taken at the start of each of your turns) are kept in the browser's local storage.

| Chapter | Gloom start / limit | Foe bonus | Crown song | Rival skill |
| --- | --- | --- | --- | --- |
| I. The Kindling Road | 0 / 24 | +0 | 5 notes and up | 0.7 |
| II. Ashfall | 2 / 26 | +1 | 6 notes and up | 0.85 |
| III. The Long Night | 2 / 26 | +2 | 7 notes and up | 0.95 |

## Source layout

```
index.html          page shell, screens and the rules
css/style.css       all styling
js/data.js          map, provinces, relics, foes, chapters (pure data)
js/engine.js        rules engine; talks to the page only through an io object
js/ai.js            Ser Vael's decisions
js/board3d.js       three.js scene, board painting, picking, pawn movement
js/models3d.js      procedural plastic models: Spire, buildings, pawns, scenery
js/glyphs.js        the console's SVG slide glyphs
js/console.js       the Spire console: LED, ticker, keypad, crown sockets
js/ledger.js        peg scorecards and the Gloom track
js/audio.js         Web Audio sound effects and tunes
js/main.js          wiring, screens, saves, view switching
js/fp/palette.js    the 16-colour EGA palette and pixel-art helpers
js/fp/gfx.js        pixel textures, sprites and the EGA dither pass
js/fp/world.js      the overland Reach at walking scale
js/fp/dungeon.js    barrow and Spire floor maps and their geometry
js/fp/view.js       first-person camera, controls, HUD and staging
js/fp/sprites-*.js  pixel art: foes, province beasts, people, props
js/fp/textures.js   procedural pixel textures and the mountain backdrop
vendor/             three.js r160 module build and OrbitControls (MIT)
tools/sim.mjs       headless balance simulation, the computer playing both seats
tools/sim-detail.mjs  the same, with where games are won and lost (climbs, army size, Gloom)
tools/build.mjs     esbuild bundle into dist/
tools/*-preview.html  contact sheets for the glyphs, 3D models and pixel art
```

The engine has no DOM dependency, so balance changes can be checked without a browser:

```sh
node tools/sim.mjs 300        # 300 games per chapter
```

To rebuild the single-file version after editing:

```sh
npm install
npm run build
```

three.js is MIT licensed; its licence is in `vendor/THREE-LICENSE`.
