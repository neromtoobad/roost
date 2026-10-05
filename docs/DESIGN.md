# Roost — design tokens (v3, Oct 4)

Locked decisions: matte-vinyl characters, a day/night UI driven by the market session, and Binance's palette — yellow as the single accent, Binance's light theme while the NYSE trades and its dark theme while it sleeps. Roost's own name and mark; no Binance logo or wordmark.

## Color

| Token | Day (market open / pre / post) | Night (overnight, weekend, holiday) | Role |
|---|---|---|---|
| `canvas` | `#FAFAFA` | `#0B0E11` | page ground |
| `surface` | `#FFFFFF` | `#181A20` | cards, top bar, tab bar |
| `surface-2` | `#F5F5F5` | `#1E2329` | secondary buttons, unselected options, table heads |
| `ink` | `#1E2329` | `#EAECEF` | text |
| `muted` | `#707A8A` | `#848E9C` | captions |
| `line` | `#EAECEF` | `#2B3139` | borders |
| `accent` | `#FCD535` | `#FCD535` (+ glow `0 0 24px #F0B90B59`) | primary buttons, selection, gauges |
| `accent-ink` | `#C99400` | `#FCD535` | yellow used as text (plain yellow does not read on white) |
| `on-accent` | `#202630` | `#202630` | text on yellow |
| `up` / `down` | `#03A66D` / `#CF304A` | `#0ECB81` / `#F6465D` | P&L only, never decoration |

Night mode adds one thing day mode doesn't: the buddy's floor glows yellow. Day is flat, night is lit.

## Shape

- Primary buttons (`.pill`): yellow, radius `12px`, height 52px. Secondary (`.btn-2`): `surface-2` with a `line` border, same radius.
- Cards: radius `16px`. Status badges and buddy chips stay fully round.
- Option selectors (amounts, cadence, issuer): `12px` rectangles; the selected one is yellow (or ink for cadence).
- Ring gauges: 3 per home screen, 72px, 8px stroke, yellow on `line`.

## Layout

- Phone: one column (max 430px) with a bottom tab bar of line icons.
- Desktop (≥1024px): a sticky top bar — Roost, the places (Buddy, Nest, Board, Diary, Fledglings), the NYSE session badge, Hatch and the wallet — over a 1200px content column, and a footer. Pages go two-up: the buddy's stage beside its numbers, totals beside the nest, the leaderboard table beside the duels, the diary as one ledger.

## Type

- Display and body: **IBM Plex Sans** 400–700 (the family Binance's own typeface builds on).
- Numbers: **IBM Plex Mono** 500 with `tabular-nums` — holdings, prices, timestamps.
- Scale: 36 / 28 / 24 / 18 / 16 / 14 / 12. Uppercase labels get `letter-spacing: .08em`.

## Characters (renders in `public/pets/`)

| Species | Name | Home stock | Wrong detail | Lime accent |
|---|---|---|---|---|
| Circuit pangolin | Pango | NVDA | one scale flipped up | circuit traces between the scales |
| Copper axolotl | Coil | TSLA | one gill shorter | plug tips on the coil gills |
| Shopping capybara | Bara | AAPL | a notch in one ear | the leaf in its tote bag |
| Jetpack beaver | Rivet | SPCX | one chipped tooth | jetpack thruster |
| Patchwork sheep | Patch | CRWV | one patch upside down | one quilt square |
| Dish-eared fennec | Fen | RDDT | one dented ear dish | signal lights on the ear tips |

Every creature is a soft-vinyl designer toy with a flocked finish and lime only on its signature detail — the buddies' own glow, apart from the UI's yellow.

Eight moods, same vocabulary for every species: Ecstatic, Happy, Chill, Nervous, Sulking (hoodie), Night Owl (coffee, blue vignette), Pajamas (nightcap), Hungry (bowl).

## v4: game lobby

The room is lit: a warm sky and a faint BNB-diamond lattice behind every page (`--sky`, `--lattice`). Cards catch the light on their edge (`--card-edge`); the primary button is a pressable gold key with a passing sheen; secondary buttons press too. Titles are Bricolage Grotesque, with one word in gold. Each creature brings its own colour (`lib/look.ts` HUE) to its stage, card, chip and bars. The stage is a box in that colour with slow light rays, drifting motes, and the creature standing on its habitat base; growth shows as a level bar. The needs are coloured rings round 3D icons; the board has a podium for the top three.

## Asset pipeline

1. A hero render per species: `gpt_image_2_5`, 4:5, `background: transparent`.
2. Eight moods per species, each generated with the hero as its reference image so the design holds (1:1, transparent).
3. A pod per species (the egg-shaped art in `public/pets/eggs/`), referencing the hero for palette and material only, its surface hinting at the creature.
4. Resized for the app: hero 896×1120, moods 512×512, pods 410×512.
5. Habitats and icons (v4, same model and material, each hero as the reference): a diorama base per creature in `public/pets/bases/` (circuit board, copper-ringed pond, mossy meadow, launch pad, quilt cushion, desert dune), the nest in `public/ui/nest.webp`, 3D icons for the four litters and the three needs in `public/ui/`. Trimmed and saved as webp; `BASE_TOP` in `components/Pet.tsx` says where each base's surface sits, so the feet land on it.
6. Motion in code: idle breathing (scale 1→1.02, 3s), blink (every 4–7s), mood switch = squash-and-stretch 200ms, feed = chomp + confetti burst.

## Copy voice

Short, first person, slightly unhinged, never explains finance. "Wall Street sleeps. I don't." "Feed me and I'll buy the dip." Diary entries ≤ 12 words with a timestamp.
