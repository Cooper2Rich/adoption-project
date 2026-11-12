# Nocturne Coffee demo assets

Public-demo experiment on `demo-2`; no PRD change. The three current ads are 16.4-second landscape videos using continuous, real filmed coffee footage at its original playback speed, with Nocturne copy/CTAs and original synthesized ambient audio. Every frame of the underlying image comes from a playing video. The current ads do not use image pans, photo crossfades, looping or stretched short clips. Nocturne is a fictional coffee shop; performance/funding figures remain illustrative.

| Film                              | Saved video                                        | Poster extracted from footage                     |
| --------------------------------- | -------------------------------------------------- | ------------------------------------------------- |
| Your midnight ritual              | `public/videos/nocturne-midnight-filmed-v2.webm`   | `public/images/nocturne-midnight-filmed-v2.jpg`   |
| A little obsession, in every shot | `public/videos/nocturne-espresso-filmed-v2.webm`   | `public/images/nocturne-espresso-filmed-v2.jpg`   |
| A seat after dark                 | `public/videos/nocturne-afterhours-filmed-v2.webm` | `public/images/nocturne-afterhours-filmed-v2.jpg` |

Rebuild with `node scripts/generate-coffee-videos.ts`. Copy definitions live in `src/public-demo/coffee-ads.ts`; source URLs, chosen start times and SHA-256 digests live in `scripts/coffee-footage.ts`. The renderer downloads the selected sources if missing, verifies their digests, and caches them under ignored `outputs/coffee-footage/`. Local Chromium decodes the source videos and renders 1280×720 VP9/Opus files. Rendering rejects a clip with fewer than 16 seconds of source playback or fewer than 300 decoded source frames. The website serves bundled output files, without a third-party video dependency at runtime.

Existing browser workspaces receive a new media revision for the old stock creatives, retaining historical snapshots, stable ad IDs, custom text, withdrawals, holds, and giving history. User-uploaded replacements are preserved. Original photo ads elsewhere in the demo remain images. The public palette uses the supplied Blue Ripple Media logo, its sampled blues, black panels and high-contrast white text. [Brand assets and palette](BRAND.md). Normal text/control combinations are checked against a minimum 4.5:1 contrast ratio in public and creator views. The local backend keeps its existing theme.

## Filmed footage credits

The October 24 preview update repairs an earlier duration patch that shifted WebM byte offsets and made players skip the opening segment. The films retain their original footage and audio. The generator now preserves Chromium's native duration and seek index. Playback URLs carry a media revision to refresh previously cached copies; browser checks verify that five-second previews return to the opening frame.

All three selected item pages identify the **Mixkit Stock Video Free License**, permitting commercial and personal use. See the [Mixkit license](https://mixkit.co/license/). The footage is used in a fictional demo advertisement, without suggesting that any depicted person or venue endorses Nocturne.

| Ad              | Source clip                                                                                                                                       | Source duration | Selected continuous segment |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | --------------------------- |
| Midnight ritual | [Water poured into a coffee filter — Mixkit 816](https://mixkit.co/free-stock-video/water-poured-into-a-coffee-filter-816/)                       | 24 seconds      | 2.0–18.4 seconds            |
| Espresso craft  | [Latte art — Mixkit 810](https://mixkit.co/free-stock-video/latte-art-810/)                                                                       | 34 seconds      | 3.0–19.4 seconds            |
| After hours     | [A barista preparing coffee with milk and ice — Mixkit 796](https://mixkit.co/free-stock-video/a-barista-preparing-coffee-with-milk-and-ice-796/) | 17 seconds      | 0.0–16.4 seconds            |

## Earlier generated artwork

The image prompts below document the earlier photo-animation experiment. These images are retained as historical assets; the current filmed videos use none of them. They were created with the built-in imagegen tool and saved in `public/images/coffee-midnight.png`, `public/images/coffee-espresso.png`, and `public/images/coffee-afterhours.png`.

### Original image prompts

### Midnight ritual

Use case: ads-marketing. Create a cinematic photorealistic background photograph for a fictional independent coffee shop ad. A beautiful dark ceramic espresso cup with crema on a black stone counter in a mysterious late-night coffee bar. Steam rises from cup. In background an elegant espresso machine, softly blurred warm amber lamps, deep plum shadows and midnight-blue interior, rain-streaked window catching a faint violet glow. Premium editorial coffee advertising, tactile details, shallow depth of field, restrained and atmospheric, plausible real cafe, portrait 2:3 composition with cup in center lower half and usable darker negative space in upper third for typography added later by code. Palette charcoal, aubergine, muted brass amber, ivory. No text, no logos, no watermark. This is a background for finished 16-second animated video ads and a website hero.

### Espresso craft

Use case: ads-marketing. Cinematic photorealistic portrait 2:3 background photograph for a fictional independent coffee shop video ad. Extreme close-up of espresso pouring in two beautiful golden streams from a professional espresso machine into a matte black ceramic cup on the grate, rich crema, a trace of steam, tactile metal reflections. Midnight and deep plum shadows, selective warm amber lighting, ivory highlights. Premium restrained atmospheric coffee advertising, shallow depth of field, beautiful real physical detail, no people, no text or logos or watermark. Keep room toward upper left for editorial typography added later. Visually distinct from a cafe wide shot; focus on craft and espresso.

### A seat after dark

Use case: ads-marketing. Cinematic photorealistic portrait 2:3 background photograph for a fictional neighborhood coffee shop video ad. Inviting small late-night coffee shop interior viewed through a rainy window, a cozy rounded booth with two cups of coffee on a little black stone table, amber pendant light and moody midnight blue/deep plum walls, shelves of coffee cups, faint violet reflections on rain droplets. No people. Premium editorial photography, intimate mysterious atmosphere, real plausible small cafe. Strong composition emphasizing booth and room, with subtle empty darker space for typography added later. No lettering, no signage, no logo, no watermark.
