import { randomUUID } from "node:crypto";
import { COMPENSATION } from "./eligibility.ts";

export function seedData(): import("./demo-types.ts").DemoState {
  const now = new Date();
  const day = (offset: any) =>
    new Date(now.getTime() + offset * 86400000).toISOString().slice(0, 10);
  const projects = [
    {
      id: "greener-tomorrow",
      name: "A greener tomorrow",
      nonprofit: "One Tree Collective",
      category: "Environment",
      description:
        "Help us put down roots for a better future. Share the people, places, and small acts behind our community tree-planting mission.",
      brief:
        "Tell a hopeful, human story about a greener neighborhood. Keep it authentic, include a clear invitation to get involved, and credit One Tree Collective.",
      cover: "forest",
      color: "green",
      startDate: day(-12),
      endDate: day(62),
      status: "active",
      instagram: "",
      createdAt: now.toISOString(),
    },
    {
      id: "seat-at-the-table",
      name: "A seat at every table",
      nonprofit: "The Open Table",
      category: "Food & community",
      description:
        "Good food brings us together. Help tell the story of neighbors making sure everyone has a place at the table.",
      brief:
        "Show the care behind a community meal. Protect the privacy of guests and focus on the joy of sharing food.",
      cover: "food",
      color: "orange",
      startDate: day(-7),
      endDate: day(45),
      status: "active",
      instagram: "",
      createdAt: now.toISOString(),
    },
    {
      id: "room-to-grow",
      name: "Room to grow",
      nonprofit: "Bright Futures Foundation",
      category: "Education",
      description:
        "Every big dream starts with a little opportunity. Create a story about opening doors through books, learning, and community.",
      brief:
        "Celebrate curiosity and learning. Use only media you have permission to share; obtain appropriate consent for anyone featured.",
      cover: "education",
      color: "purple",
      startDate: day(5),
      endDate: day(80),
      status: "draft",
      instagram: "",
      createdAt: now.toISOString(),
    },
  ];
  const samples = [
    [
      "greener-tomorrow",
      "It starts with one tree",
      "Maya Chen",
      "photo",
      "forest",
      "A little shade. A little cleaner air. A whole lot of possibility. 🌱 Join One Tree Collective and help us grow a greener tomorrow, one neighborhood at a time. #GreenerTogether",
      "pending",
      3,
    ],
    [
      "seat-at-the-table",
      "More than a meal",
      "Alex Rivera",
      "photo",
      "food",
      "The best ingredient? Community. Pull up a chair with The Open Table and be part of something good. 🧡 #ASeatForEveryone",
      "pending",
      8,
    ],
    [
      "greener-tomorrow",
      "Small hands, big impact",
      "Jordan Ellis",
      "photo",
      "seedling",
      "Change grows when we show up together. Here’s to the neighbors planting a better future with One Tree Collective. #PlantWithPurpose",
      "pending",
      18,
    ],
    [
      "greener-tomorrow",
      "Rooted in community",
      "Sam Taylor",
      "photo",
      "forest",
      "Every tree has a story. Ours starts with you. Come plant with One Tree Collective this season. 🌳 #RootedInCommunity",
      "approved",
      30,
    ],
    [
      "seat-at-the-table",
      "Good things are shared",
      "Maya Chen",
      "photo",
      "food",
      "A table full of food, a room full of possibility. Share a little kindness with The Open Table. #CommunityFirst",
      "changes",
      42,
    ],
  ];
  const posts = samples.map(
    (
      [projectId, title, creator, format, cover, caption, status, hours]: any,
      i: any,
    ) => ({
      id: `sample-${i + 1}`,
      projectId,
      title,
      creator,
      format,
      caption,
      status,
      media: `/images/${cover}.jpg`,
      mediaType: "image",
      rights: status !== "changes",
      channel: "instagram",
      destination: `/campaigns/${projectId}/give`,
      acceptedTermsVersion: "local-v1",
      disclosures: {
        compensation: COMPENSATION,
        beneficiary: `Beneficiary: ${projects.find((p: any) => p.id === projectId)!.nonprofit}.`,
      },
      factualClaims: [] as any[],
      policy: {
        passed: true,
        reasons: [] as any[],
        version: "demo-submission-v1",
      },
      revision: 1,
      createdAt: new Date(now.getTime() - hours * 3600000).toISOString(),
      updatedAt: now.toISOString(),
      feedback:
        status === "changes"
          ? "Love the direction! Please add an invitation to volunteer and mention The Open Table in the first sentence."
          : "",
      history: [
        {
          id: randomUUID(),
          action: "submitted",
          actor: creator,
          note: "Submitted for nonprofit review.",
          at: new Date(now.getTime() - hours * 3600000).toISOString(),
        },
        ...(status !== "pending"
          ? [
              {
                id: randomUUID(),
                action: status === "approved" ? "approved" : "changes",
                actor: "Demo administrator",
                note:
                  status === "approved"
                    ? "A lovely fit for the project. Approved for handoff."
                    : "Please add an invitation to volunteer and mention The Open Table in the first sentence.",
                at: now.toISOString(),
              },
            ]
          : []),
      ],
    }),
  );
  return {
    projects,
    posts,
    activity: [
      {
        id: randomUUID(),
        action: "workspace",
        title: "Your workspace is ready",
        detail: "Sample projects and creators are here to help you explore.",
        at: now.toISOString(),
      },
    ],
  };
}
