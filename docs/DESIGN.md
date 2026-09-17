# Stocklings — design tokens (v1, Sept 16)

Locked decisions: matte-vinyl characters (direction A), day/night UI driven by the market session, lime as the single accent. No purple anywhere.

## Color

| Token | Day (market open / pre / post) | Night (overnight, weekend, holiday) | Role |
|---|---|---|---|
| `canvas` | `#F6F5EE` warm off-white | `#0B0F14` navy-black + dotted grid (`#1A2230` dots, 24px) | page ground |
| `surface` | `#FFFFFF` | `#131A22` | cards |
| `ink` | `#111111` | `#F2F4F1` | text |
| `muted` | `#6B6F66` | `#8C95A0` | captions |
| `line` | `#E4E3DA` | `#243040` | borders |
| `accent` | `#C8FF3D` lime | `#C8FF3D` lime (+ glow `0 0 24px #C8FF3D66`) | the one voltage |
| `on-accent` | `#111111` | `#111111` | text on lime |
| `up` / `down` | `#178F62` / `#D6403F` | `#3ED598` / `#FF7B7A` | P&L only, never decoration |

Night mode adds one thing day mode doesn't: the pet's LEDs glow and light the floor. Day is matte, night is lit.

## Shape

- Pill buttons: radius `999px`, height 56px, full width on the home screen.
- Cards: radius `28px`. Chips: `999px`. Nothing has a sharp corner.
- Ring gauges: 3 per home screen, 72px, 8px stroke, lime track on `line`.

## Type

- Display: **Fredoka** 600/700 (rounded, toy-like) — titles, pet names, the speech bubble.
- Body: **Nunito** 500/600 — everything else.
- Numbers: **JetBrains Mono** 500 with `tabular-nums` — holdings, prices, timestamps.
- Scale: 32 / 24 / 18 / 16 / 14 / 12. Uppercase labels get `letter-spacing: .08em`.

## Characters (canonical renders in `art/`)

| Species | Name | Home stock | Wrong detail | Mood carrier |
|---|---|---|---|---|
| Robot cat | Nova | NVDA | left ear bent | pixel eyes on visor |
| Lightning dog | Volt | TSLA | right ear folded | red LED visor band |
| Earbud hedgehog | Pip | AAPL | one bent spine | eyes + spine fan |
| Space frog | Booster | SPCX | mismatched eyes, crooked patch | eyes inside helmet |
| Cloud | Nimbus | OpenAI (pre-IPO) | drooping puff | embossed line face + inflation |
| Night owl | Lurk | RDDT | one eye half closed | eyes + beanie |

Eight moods, same vocabulary for every species: Ecstatic, Happy, Chill, Nervous, Sulking (hoodie), Night Owl (coffee, blue vignette), Pajamas (nightcap), Hungry (bowl).

## Asset pipeline

1. Canonical hero render per species (4:5, off-white) — done.
2. Mood sheet per species referencing the hero + Nova's sheet — in progress.
3. Transparent cutouts: `gpt_image_2_5` with `background: transparent`, referencing the hero — verified RGBA on Nova.
4. Crop mood panels from sheets into individual 512px PNGs for the app.
5. Motion in code: idle breathing (scale 1→1.02, 3s), blink (every 4–7s), mood switch = squash-and-stretch 200ms, feed = chomp + confetti burst.

## Copy voice

Short, first person, slightly unhinged, never explains finance. "Wall Street sleeps. I don't." "Feed me and I'll buy the dip." Diary entries ≤ 12 words with a timestamp.
