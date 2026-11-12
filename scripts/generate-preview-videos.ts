// Create fictional motion-story previews from the repository's bundled images.
// No external media, connected platform data, or user uploads are used.
import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto("about:blank");
  await mkdir("public/videos", { recursive: true });
  const samples = [
    ["sample-1", "forest", "It starts with one tree", "ONE TREE COLLECTIVE"],
    ["sample-2", "food", "More than a meal", "THE OPEN TABLE"],
    ["sample-3", "seedling", "Small hands, big impact", "ONE TREE COLLECTIVE"],
  ];
  for (const [id, image, headline, cause] of samples) {
    const bytes = await readFile(`public/images/${image}.jpg`);
    const video = await page.evaluate(
      async ({ source, headline, cause }: any) => {
        const image = new Image();
        image.src = source;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = 640;
        canvas.height = 760;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas 2D rendering unavailable");
        const ctx: CanvasRenderingContext2D = context;
        const stream = canvas.captureStream(24);
        const recorder = new MediaRecorder(stream, {
          mimeType: "video/webm;codecs=vp9",
          videoBitsPerSecond: 850000,
        });
        const chunks: any[] = [];
        recorder.ondataavailable = (e: any) => chunks.push(e.data);
        const complete = new Promise<number[]>((resolve: any) => {
          recorder.onstop = async () =>
            resolve(
              Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer())),
            );
        });
        function draw(t: any) {
          const scale =
            Math.max(640 / image.width, 760 / image.height) * (1 + t * 0.065);
          const w = image.width * scale,
            h = image.height * scale;
          ctx.drawImage(image, (640 - w) / 2, (760 - h) / 2, w, h);
          const shade = ctx.createLinearGradient(0, 250, 0, 760);
          shade.addColorStop(0, "transparent");
          shade.addColorStop(1, "#172d20ef");
          ctx.fillStyle = shade;
          ctx.fillRect(0, 0, 640, 760);
          ctx.fillStyle = "#dced91";
          ctx.font = "bold 15px sans-serif";
          ctx.fillText(cause, 40, 520);
          ctx.fillStyle = "white";
          ctx.font = "bold 43px sans-serif";
          const words = headline.split(" ");
          let line = "",
            y = 580;
          for (const word of words) {
            const next = `${line}${word} `;
            if (ctx.measureText(next).width > 550) {
              ctx.fillText(line, 40, y);
              y += 52;
              line = `${word} `;
            } else line = next;
          }
          ctx.fillText(line, 40, y);
          ctx.font = "18px sans-serif";
          ctx.fillText("A little creativity. A lot of good.", 40, 700);
          ctx.fillStyle = "#dced91";
          ctx.fillRect(40, 731, 560 * t, 3);
        }
        draw(0);
        recorder.start();
        const start = performance.now();
        await new Promise((resolve: any) => {
          function frame(now: any) {
            const t = Math.min(1, (now - start) / 4000);
            draw(t);
            if (t < 1) requestAnimationFrame(frame);
            else resolve();
          }
          requestAnimationFrame(frame);
        });
        recorder.stop();
        stream.getTracks().forEach((track: any) => track.stop());
        return complete;
      },
      {
        source: `data:image/jpeg;base64,${bytes.toString("base64")}`,
        headline,
        cause,
      },
    );
    await writeFile(`public/videos/${id}.webm`, Buffer.from(video));
    console.log(`Created ${id}.webm`);
  }
} finally {
  await browser.close();
}
