import { Trophy } from "lucide-react";
import type { Post } from "../types.ts";
import { Avatar } from "./ui.tsx";

export function Leaderboard({ posts }: { posts: Post[] }) {
  const creators = new Map<string, { name: string; count: number }>();
  for (const post of posts) {
    const row = creators.get(post.creatorId) || {
      name: post.creator,
      count: 0,
    };
    row.count += 1;
    creators.set(post.creatorId, row);
  }
  const ranked = [...creators.entries()].sort(
    (a, b) => b[1].count - a[1].count || a[1].name.localeCompare(b[1].name),
  );
  return (
    <section className="leaderboard">
      <div className="leaderboard-heading">
        <span className="stat-icon amber">
          <Trophy size={22} />
        </span>
        <div>
          <h2>Creator leaderboard</h2>
          <p>
            Eligible creatives per creator, one point per current creative. This
            demonstration board is not a performance grade or payout formula.
          </p>
        </div>
      </div>
      {ranked.length ? (
        <ol>
          {ranked.map(([id, creator], index) => (
            <li key={id}>
              <span className="leaderboard-rank">
                {1 +
                  ranked.filter(([, other]) => other.count > creator.count)
                    .length}
              </span>
              <Avatar name={creator.name} index={index} />
              <strong>{creator.name}</strong>
              <span>
                {creator.count} eligible{" "}
                {creator.count === 1 ? "post" : "posts"}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="leaderboard-empty">
          The first eligible creative will put a creator on the board.
        </p>
      )}
    </section>
  );
}
