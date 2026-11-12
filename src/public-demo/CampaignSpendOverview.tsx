import { Wallet } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useWorkspace } from "../context.tsx";
import type { CampaignAdSetup } from "./ad-platforms.ts";
import { AdPlatformsPage } from "./AdPlatforms.tsx";
import { CampaignBudgetBreakdown } from "./CampaignBudgetBreakdown.tsx";
import { CompletedAdSpend } from "./CompletedAdSpend.tsx";

export function CampaignSpendOverview() {
  const { campaignScope } = useWorkspace();
  const [setup, setSetup] = useState<CampaignAdSetup>();
  return (
    <section className="campaign-spend-overview" aria-label="Campaign ad spend">
      <div className="campaign-spend-heading">
        <div>
          <Wallet size={20} />
          <h2>Campaign ad spend</h2>
        </div>
        <Link
          className="text-button"
          to={`/campaigns/${campaignScope!.id}/ad-platforms`}
        >
          Platform connections ↗
        </Link>
      </div>
      {setup && (
        <CampaignBudgetBreakdown
          rules={setup.rules}
          connections={setup.connections}
        />
      )}
      <details className="campaign-allocation-setup">
        <summary>
          Set ad spend allocation{" "}
          <span>Daily limit, campaign cap and Meta / TikTok split</span>
        </summary>
        <AdPlatformsPage embedded onSetupChange={setSetup} />
      </details>
      <CompletedAdSpend />
    </section>
  );
}
