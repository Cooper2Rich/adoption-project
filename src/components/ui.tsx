import { useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { WorkspaceContext } from "../context";
import { mediaResponse } from "../api";
import { APP_NAME, demoAsset } from "../runtime";
import { useAdPreview } from "./useAdPreview";
import {
  ArrowUpRight,
  Check,
  Clock3,
  MessageSquare,
  X,
  XCircle,
  Image as ImageIcon,
  Film,
  Layers,
  Sparkles,
} from "lucide-react";
import type { PostStatus, Post } from "../types";

export function Logo({ small = false }: { small?: boolean }) {
  return (
    <span
      className={`logo adoption-logo ${small ? "small" : ""}`}
      role="img"
      aria-label={APP_NAME}
    >
      <img
        className="adoption-mark"
        src={demoAsset("brand/adoption-is-mark.png")}
        width={44}
        height={44}
        alt=""
      />
      {!small && <span className="adoption-wordmark">{APP_NAME}</span>}
    </span>
  );
}
export function Instagram({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r=".6" fill="currentColor" stroke="none" />
    </svg>
  );
}
export const statusLabels: Record<PostStatus, string> = {
  pending: "Checking",
  approved: "Eligible",
  changes: "Needs fixes",
  rejected: "Blocked",
  held: "On hold",
};
export function StatusBadge({ status }: { status: PostStatus }) {
  const Icon = {
    pending: Clock3,
    approved: Check,
    changes: MessageSquare,
    rejected: XCircle,
    held: Clock3,
  }[status];
  return (
    <span className={`badge ${status}`}>
      <Icon size={12} />
      {statusLabels[status]}
    </span>
  );
}
export function Avatar({
  name,
  index = 0,
  src,
  alt,
  logo = false,
}: {
  name: string;
  index?: number;
  src?: string;
  alt?: string;
  logo?: boolean;
}) {
  const [failedSrc, setFailedSrc] = useState<string>();
  const showImage = src && src !== failedSrc;
  return (
    <span
      className={`avatar avatar-${index % 4} ${logo ? "avatar-logo" : ""}`}
      aria-label={showImage ? undefined : name}
    >
      {showImage ? (
        <img
          src={src}
          alt={
            alt || `${name} ${logo ? "organization logo" : "profile picture"}`
          }
          onError={() => setFailedSrc(src)}
        />
      ) : (
        name
          .split(" ")
          .map((x) => x[0])
          .slice(0, 2)
          .join("")
      )}
    </span>
  );
}
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Sparkles size={24} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "wide" : ""}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-labelledby="modal-title"
    >
      <div className="modal-header">
        <div>
          <h2 id="modal-title">{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close dialog"
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Media({
  post,
  className = "",
  controls = true,
  poster,
}: {
  post: Pick<Post, "media" | "mediaType" | "title">;
  className?: string;
  controls?: boolean;
  poster?: string;
}) {
  const workspace = useContext(WorkspaceContext);
  const [source, setSource] = useState("");
  const access = workspace?.access;
  const scoped =
    post.media.startsWith("/api/media/") || post.media.startsWith("/uploads/");
  useEffect(() => {
    if (!scoped) return;
    const controller = new AbortController();
    let url = "";
    setSource("");
    void mediaResponse(post.media, access, controller.signal)
      .then(async (response) => {
        if (!response.ok) throw new Error("Media unavailable");
        const blob = await response.blob();
        if (!controller.signal.aborted) {
          url = URL.createObjectURL(blob);
          setSource(url);
        }
      })
      .catch(() => {});
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [
    post.media,
    scoped,
    access?.role,
    access?.creatorId,
    access?.nonprofitId,
  ]);
  const src = scoped
    ? source
    : post.media.startsWith("/images/") || post.media.startsWith("/videos/")
      ? demoAsset(post.media)
      : post.media;
  const { video } = useAdPreview(src);
  return post.mediaType === "video" ? (
    <video
      ref={video}
      className={className}
      src={src || undefined}
      controls={controls}
      muted={!controls}
      poster={poster}
      playsInline
      preload="metadata"
      aria-label={post.title}
    />
  ) : (
    <img className={className} src={src || undefined} alt={post.title} />
  );
}
export function FormatLabel({ format }: { format: string }) {
  const Icon =
    format === "reel" ? Film : format === "carousel" ? Layers : ImageIcon;
  return (
    <span className="format">
      <Icon size={13} />
      {format === "photo"
        ? "Photo post"
        : format[0].toUpperCase() + format.slice(1)}
    </span>
  );
}
export function ExternalIcon() {
  return <ArrowUpRight size={16} />;
}
export function dateLabel(value: string, short = false) {
  return new Date(
    value.length === 10 ? `${value}T12:00:00` : value,
  ).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(!short ? { year: "numeric" } : {}),
  });
}
export function relativeTime(value: string) {
  const hours = Math.max(
    0,
    Math.floor((Date.now() - Date.parse(value)) / 3600000),
  );
  return hours === 0
    ? "Just now"
    : hours < 24
      ? `${hours}h ago`
      : `${Math.floor(hours / 24)}d ago`;
}
