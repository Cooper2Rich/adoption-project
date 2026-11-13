import { useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { useEffect, useRef, useState } from "react";
import type { Doc } from "../../convex/functions.ts";
import { DonationCheckout } from "./Fundraising.tsx";

type Entry = {
  id: Doc<"photoEntries">["_id"];
  version: number;
  title: string;
  description: string;
  creator: string;
  photoCount: number;
  video: boolean;
  trackedPath: string;
};
const campaignRef = makeFunctionReference<
  "query",
  Record<string, never>,
  { slug: string; name: string; entries: Entry[] } | null
>("publicViewer:campaign");
const entryRef = makeFunctionReference<
  "query",
  { entryId: Doc<"photoEntries">["_id"] },
  Entry | null
>("publicViewer:entry");
const fundraisingRef = makeFunctionReference<
  "query",
  { entryId: Doc<"photoEntries">["_id"] },
  {
    originEntryId: string;
    entry: Entry | null;
    trackedPath: string;
    checkout: "unavailable";
  } | null
>("publicViewer:fundraising");

function PublicMedia({ entry }: { entry: Entry }) {
  const [attempt, setAttempt] = useState(0),
    [failed, setFailed] = useState(false),
    [url, setUrl] = useState("");
  const player = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    let active = true;
    setFailed(false);
    setUrl("");
    if (entry.video)
      void (async () => {
        try {
          const result = await fetch(
            `/api/videos?action=public&entryId=${entry.id}`,
            { cache: "no-store" },
          );
          if (!result.ok) throw new Error();
          const body = await result.json();
          if (active) setUrl(body.url);
        } catch {
          if (active) setFailed(true);
        }
      })();
    return () => {
      active = false;
    };
  }, [entry.id, entry.version, entry.video, attempt]);
  useEffect(() => {
    const video = player.current;
    if (!video || !url || failed) return;
    let active = true,
      destroy = () => {};
    if (
      url.includes(".m3u8") &&
      !video.canPlayType("application/vnd.apple.mpegurl")
    ) {
      void import("hls.js")
        .then(({ default: Hls }) => {
          if (!active) return;
          if (!Hls.isSupported()) {
            setFailed(true);
            return;
          }
          const hls = new Hls();
          hls.on(Hls.Events.ERROR, (_, data) => {
            if (data.fatal) setFailed(true);
          });
          hls.loadSource(url);
          hls.attachMedia(video);
          destroy = () => hls.destroy();
        })
        .catch(() => {
          if (active) setFailed(true);
        });
    } else video.src = url;
    return () => {
      active = false;
      destroy();
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [url, failed]);
  if (failed)
    return (
      <div role="status" className="public-media-error">
        <p>This ad's media is unavailable</p>
        <button
          onClick={() => {
            setFailed(false);
            setAttempt(attempt + 1);
          }}
        >
          Retry media
        </button>
      </div>
    );
  return (
    <div className="public-media" key={`${entry.version}-${attempt}`}>
      {entry.video ? (
        url ? (
          <video
            ref={player}
            controls
            playsInline
            preload="metadata"
            aria-label={`${entry.title} video`}
            onError={() => setFailed(true)}
          />
        ) : (
          <p role="status">Loading ad media…</p>
        )
      ) : (
        Array.from({ length: entry.photoCount }, (_, index) => (
          <img
            key={index}
            src={`/api/photos?action=public&entryId=${entry.id}&index=${index}&retry=${attempt}`}
            alt={`${entry.title} — photo ${index + 1}`}
            onError={() => setFailed(true)}
          />
        ))
      )}
    </div>
  );
}
function Ad({ entry, detail = false }: { entry: Entry; detail?: boolean }) {
  return (
    <article className="public-ad" aria-label={`Approved ad ${entry.title}`}>
      <PublicMedia entry={entry} />
      <div className="public-ad-copy">
        <p className="eyebrow">adoption.is · Approved creative</p>
        {detail ? (
          <h1>{entry.title}</h1>
        ) : (
          <h3>
            <a href={`/entries/${entry.id}`}>{entry.title}</a>
          </h3>
        )}
        <p>By {entry.creator}</p>
        <p className="public-description">{entry.description}</p>
        <a className="primary-button public-action" href={entry.trackedPath}>
          Support adoption.is through this ad
        </a>
        {!detail && <a href={`/entries/${entry.id}`}>View ad and share</a>}
      </div>
    </article>
  );
}
export function PublicCampaign() {
  const parts =
    location.pathname === "/launch-preview.html"
      ? []
      : location.pathname.split("/").filter(Boolean);
  const id =
    parts[0] === "entries" || parts[0] === "fundraise" ? parts[1] : undefined;
  return (
    <>
      <header className="public-header">
        <a className="wordmark" href="/">
          adoption.is
        </a>
        <nav aria-label="Campaign navigation">
          <a href="/#approved">Browse approved ads</a>
          <a href="/?workspace=creator">Creator sign-in</a>
        </nav>
      </header>
      <main className="public-layout">
        {id ? (
          <PublicDetail
            id={id as Entry["id"]}
            fundraising={parts[0] === "fundraise"}
          />
        ) : parts[0] === "fundraise" ? (
          <section className="panel">
            <h1>Support adoption.is</h1>
            <DonationCheckout />
          </section>
        ) : parts.length ? (
          <Unavailable />
        ) : (
          <Home />
        )}
      </main>
      <footer className="public-footer">
        adoption.is · A shared campaign, made possible by its creators.
      </footer>
    </>
  );
}
function Unavailable() {
  return (
    <section className="panel">
      <h1>Ad unavailable</h1>
      <p>This ad is not available for public viewing.</p>
      <a href="/">Return to the campaign</a>
    </section>
  );
}
function PublicDetail({
  id,
  fundraising,
}: {
  id: Entry["id"];
  fundraising: boolean;
}) {
  const entry = useQuery(entryRef, { entryId: id });
  const origin = useQuery(
    fundraisingRef,
    fundraising ? { entryId: id } : "skip",
  );
  const [shared, setShared] = useState("");
  if (entry === undefined || (fundraising && origin === undefined))
    return <p role="status">Loading campaign ad…</p>;
  if ((!fundraising && !entry) || (fundraising && !origin))
    return <Unavailable />;
  const displayEntry = fundraising ? origin!.entry : entry;
  return (
    <>
      <a href="/#approved">← All approved ads</a>
      {displayEntry && entry ? (
        <Ad entry={displayEntry} detail />
      ) : (
        <section className="panel">
          <h1>Support adoption.is</h1>
          <p>This preserved link continues supporting the nonprofit.</p>
        </section>
      )}
      {fundraising ? (
        <section className="panel" aria-label="Tracked fundraising">
          <h2>Support adoption.is</h2>
          {displayEntry && (
            <p>
              You reached adoption.is through {displayEntry.creator}'s ad, “
              {displayEntry.title}”.
            </p>
          )}
          <DonationCheckout entryId={id} />
          <p>Share this same link from any platform:</p>
          <a className="public-link" href={origin!.trackedPath}>
            {location.origin}
            {origin!.trackedPath}
          </a>
        </section>
      ) : (
        <section className="panel">
          <h2>Share this ad</h2>
          <p>
            Every platform uses the same entry and tracked fundraising link.
          </p>
          <a className="public-link" href={entry!.trackedPath}>
            {location.origin}
            {entry!.trackedPath}
          </a>
          <p>
            <button
              onClick={() => {
                void navigator.clipboard
                  .writeText(`${location.origin}${entry!.trackedPath}`)
                  .then(
                    () => setShared("Tracked link copied."),
                    () =>
                      setShared("Copy the link shown above to share this ad."),
                  );
              }}
            >
              Copy tracked fundraising link
            </button>
          </p>
          {shared && <p role="status">{shared}</p>}
        </section>
      )}
    </>
  );
}
function Home() {
  const campaign = useQuery(campaignRef, {});
  return (
    <>
      <section className="public-hero">
        <p className="eyebrow">Creators for adoption.is</p>
        <h1>adoption.is</h1>
        <p className="public-lead">
          Discover the creative voices supporting adoption.is.
        </p>
        <p>
          Explore approved campaign ads, meet the creators behind them, and
          share an ad's fundraising link to support the campaign. Everyone can
          browse without an account.
        </p>
        <a className="primary-button public-action" href="#approved">
          Explore approved ads
        </a>
      </section>
      <section id="approved" aria-label="Approved campaign ads">
        <div className="public-section-title">
          <h2>Approved campaign ads</h2>
          {campaign && <p>{campaign.name}</p>}
        </div>
        {campaign === undefined ? (
          <p role="status">Loading campaign…</p>
        ) : !campaign ? (
          <section className="panel">
            <p role="alert">Campaign unavailable. Reconnect and retry.</p>
            <button onClick={() => location.reload()}>Retry campaign</button>
          </section>
        ) : campaign.entries.length ? (
          <div className="public-ad-grid">
            {campaign.entries.map((entry) => (
              <Ad key={`${entry.id}-${entry.version}`} entry={entry} />
            ))}
          </div>
        ) : (
          <p className="panel" role="status">
            No approved ads yet
          </p>
        )}
      </section>
    </>
  );
}
