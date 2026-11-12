import { Play } from "lucide-react";
import { useEffect, useState } from "react";
import { mediaResponse } from "../api.ts";
import { useAdPreview } from "../components/useAdPreview.ts";
import { demoAsset } from "../runtime.ts";
import type { DemoAccess, Post } from "../types.ts";
import { adoptionAds } from "./adoption-ads.ts";
import { mediaFile } from "./media.ts";

export function AdMedia({
  ad,
  full = false,
  access,
  previewOnly = false,
  autoPreview = false,
  previewPaused = false,
}: {
  ad: Pick<Post, "media" | "mediaType" | "title"> & { poster?: string };
  full?: boolean;
  access?: DemoAccess;
  previewOnly?: boolean;
  autoPreview?: boolean;
  previewPaused?: boolean;
}) {
  const [source, setSource] = useState("");
  const [watching, setWatching] = useState(false);
  const scoped =
    ad.media.startsWith("/api/media/") || ad.media.startsWith("/uploads/");
  useEffect(() => {
    if (!scoped) return;
    let disposed = false,
      url = "";
    setSource("");
    // Creator uploads use the existing scoped media adapter; public cards only
    // receive media already included in the eligible public projection.
    const request = access
      ? mediaResponse(ad.media, access).then((response) =>
          response.ok ? response.blob() : undefined,
        )
      : mediaFile(ad.media);
    void request
      .then((blob) => {
        if (blob && !disposed) {
          url = URL.createObjectURL(blob);
          setSource(url);
        }
      })
      .catch(() => {});
    return () => {
      disposed = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [ad.media, scoped, access?.role, access?.creatorId, access?.nonprofitId]);
  const src = scoped ? source : demoAsset(ad.media);
  const poster =
    ad.poster || adoptionAds.find((entry) => entry.media === ad.media)?.poster;
  const { video, startFullPlayback } = useAdPreview(
    src,
    autoPreview,
    !previewPaused,
  );
  return ad.mediaType === "video" ? (
    <>
      <video
        ref={video}
        src={src || undefined}
        poster={poster ? demoAsset(poster) : undefined}
        muted={!full && !watching}
        loop={false}
        controls={full || watching}
        tabIndex={previewOnly || full || watching ? undefined : 0}
        playsInline
        preload="metadata"
        aria-label={ad.title}
        data-auto-preview={autoPreview || undefined}
        aria-hidden={previewOnly || undefined}
      />
      {!full && !watching && !previewOnly && (
        <button
          className="inline-play"
          aria-label={`Play ${ad.title}`}
          onClick={() => {
            setWatching(true);
            startFullPlayback();
          }}
        >
          <Play size={14} fill="currentColor" /> Play
        </button>
      )}
    </>
  ) : (
    <img src={src || undefined} alt={ad.title} />
  );
}
