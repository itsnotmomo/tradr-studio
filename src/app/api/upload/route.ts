import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { body, route } from "@/lib/server/api";
import { UserError } from "@/lib/server/store";
import { storedVideoBytes, VIDEO_BUDGET, VIDEO_MAX } from "@/lib/server/videos";

// Issues short-lived tokens so the browser uploads straight to Blob storage
// (bypasses the 4.5 MB function body limit). Only signed-in requests get one.
export const POST = route(async (req) => {
  const b = await body<HandleUploadBody>(req);
  return handleUpload({
    body: b,
    request: req,
    onBeforeGenerateToken: async (pathname, clientPayload) => {
      if (pathname.startsWith("videos/")) {
        // Keep the Hobby Blob store (1 GB) from filling up: it locks for 30 days if it does.
        const size = Number(JSON.parse(clientPayload || "{}").size) || 0;
        if (size > VIDEO_MAX) throw new UserError(`That video is ${(size / 1e6).toFixed(0)} MB. The limit is ${(VIDEO_MAX / 1e6).toFixed(0)} MB.`);
        const used = await storedVideoBytes();
        if (used + size > VIDEO_BUDGET) {
          throw new UserError(`Not enough room: reel videos already use ${(used / 1e6).toFixed(0)} MB of the ${(VIDEO_BUDGET / 1e6).toFixed(0)} MB set aside. Videos are deleted 48 hours after they're marked Posted.`);
        }
        return { allowedContentTypes: ["video/mp4", "video/quicktime"], maximumSizeInBytes: VIDEO_MAX, addRandomSuffix: true };
      }
      const isFont = pathname.startsWith("fonts/");
      return {
        allowedContentTypes: isFont
          ? ["font/ttf", "font/otf", "font/woff", "font/woff2", "application/octet-stream", "application/font-woff", "application/x-font-ttf", "application/x-font-otf"]
          : ["image/jpeg", "image/png", "image/webp"],
        maximumSizeInBytes: 20 * 1024 * 1024,
        addRandomSuffix: true,
      };
    },
  });
});
