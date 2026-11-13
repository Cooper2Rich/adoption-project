import { createFundraisingService } from "../server/launch/fundraising.ts";

// Never let Vercel JSON parsing reserialize signed webhook bytes.
export const maxDuration = 30;
export function GET(request: Request) {
  return createFundraisingService({
    url: process.env.CONVEX_URL,
    secret: process.env.FUNDRAISING_RECEIPT_SECRET,
  })(request);
}
export const POST = GET;
