import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { proxyAwareFetch } from "./system-proxy.js";

const CONTENT_TYPE_EXTENSIONS = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/bmp": ".bmp",
  "image/heic": ".heic",
  "image/heif": ".heif"
};

function sanitizeBaseName(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function isImageAttachment(attachment) {
  if (!attachment || typeof attachment !== "object") {
    return false;
  }

  if (typeof attachment.contentType === "string" && attachment.contentType.startsWith("image/")) {
    return true;
  }

  return typeof attachment.height === "number";
}

export function getAttachmentExtension(attachment) {
  const fromName = typeof attachment.name === "string" ? path.extname(attachment.name) : "";

  if (fromName) {
    return fromName.toLowerCase();
  }

  if (typeof attachment.contentType === "string" && CONTENT_TYPE_EXTENSIONS[attachment.contentType]) {
    return CONTENT_TYPE_EXTENSIONS[attachment.contentType];
  }

  return ".img";
}

export function buildAttachmentFilename(attachment, index) {
  const ext = getAttachmentExtension(attachment);
  const rawBaseName = typeof attachment.name === "string" ? path.basename(attachment.name, path.extname(attachment.name)) : "";
  const baseName = sanitizeBaseName(rawBaseName || `image-${index + 1}`);

  return `${baseName}${ext}`;
}

export async function downloadImageAttachments(message) {
  const imageAttachments = [...message.attachments.values()].filter(isImageAttachment);

  if (imageAttachments.length === 0) {
    return {
      count: 0,
      filePaths: [],
      cleanup: async () => {}
    };
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "discord-codex-images-"));

  try {
    const filePaths = await Promise.all(
      imageAttachments.map(async (attachment, index) => {
        const response = await proxyAwareFetch(attachment.url);

        if (!response.ok) {
          throw new Error(`Failed to download ${attachment.name || attachment.url}: ${response.status} ${response.statusText}`);
        }

        const bytes = Buffer.from(await response.arrayBuffer());
        const filePath = path.join(tempDir, buildAttachmentFilename(attachment, index));

        await fs.writeFile(filePath, bytes);

        return filePath;
      })
    );

    return {
      count: filePaths.length,
      filePaths,
      cleanup: async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    };
  } catch (error) {
    await fs.rm(tempDir, { recursive: true, force: true });
    throw error;
  }
}
