import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { body, route } from "@/lib/server/api";

// Issues short-lived tokens so the browser uploads straight to Blob storage
// (bypasses the 4.5 MB function body limit). Only signed-in requests get one.
export const POST = route(async (req) => {
  const b = await body<HandleUploadBody>(req);
  return handleUpload({
    body: b,
    request: req,
    onBeforeGenerateToken: async (pathname) => {
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
