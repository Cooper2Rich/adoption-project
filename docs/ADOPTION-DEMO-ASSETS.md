# Adoption Is · ACU ad competition

The user requested the removal of **Duality** after the initial import. The demo now shows only **The Girl in the Middle** in the project and public catalog. Existing browsers receive an idempotent removal migration; funding records and a non-displayed copy of the removed creative are retained. The original media files remain available for historical references. Rebuilding the import no longer adds Duality.

The initial import created a campaign named **Adoption Is**, a child project named **ACU ad competition**, and two separate ads: **The Girl in the Middle** and **Duality**. These records are appended once to both new and existing public-demo browser workspaces. Existing campaigns, edits, archives, uploads, financial samples and contribution history are retained. This explicit demo-content import creates no setup charge or live transaction; the owner-request workflow remains unchanged.

Both are the user's supplied, full-length MP4 files, copied without re-encoding or trimming. Original audio is retained. The Girl in the Middle runs 60.08 seconds; Duality runs 60.12 seconds. Duration badges display `1:00`. Hover previews repeat the first five seconds, while Play opens full playback with sound.

| Ad                     | User-identified source                                                                                           | Published video                                     |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| The Girl in the Middle | `TGITM_60 Sec_WEB-MIX_FINAL_8.20.25.mp4`; the user confirmed the complete 28 MB temporary download was this film | `public/videos/adoption/the-girl-in-the-middle.mp4` |
| Duality                | `AIAO_Duality_60s_QRCode-3.4.26.mp4`                                                                             | `public/videos/adoption/duality.mp4`                |

The manifest in `src/public-demo/adoption-ads.ts` records original byte lengths, SHA-256 digests, durations and thumbnail paths. Thumbnails are frames extracted at 15 seconds. The import script verifies that each film has audio and video, decodes completely, fits the 30 MB media limit and has the expected duration. Tests compare the published bytes with the recorded hashes. Precomputed bundled-media evidence avoids downloading both complete films merely to initialize the workspace; playback uses ordinary video metadata and range requests.

The organization label **Adoption Is An Option** appears in the supplied films. The remaining active ad, **The Girl in the Middle**, is credited to **Yakira** at the user's request. Its clearly labeled demo performance includes 40,000 impressions, 1,600 total link clicks and $2,000 in funding, with $200 in sample creator earnings awaiting payout. The sample ad-fund allocation also includes $100 for the application and $1,700 for the nonprofit. Daily and weekly leaderboards use the existing weighted scoring and demo period fixtures. Saved giving, payouts and past leaderboard snapshots remain separate. The full original videos remain unchanged, including their end cards.

To rebuild from the supplied files, use an installed FFmpeg executable:

```powershell
node scripts/import-adoption-ads.ts --girl '<Girl in the Middle video>' --ffmpeg '<ffmpeg executable>'
npm run build:public
```

The script refuses to overwrite an existing published video with different bytes. A future replacement must use a new asset version so existing creative snapshots remain meaningful.
