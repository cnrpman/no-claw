import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAttachmentFilename,
  getAttachmentExtension,
  isImageAttachment
} from "./attachments.js";

test("isImageAttachment recognizes contentType images", () => {
  assert.equal(isImageAttachment({ contentType: "image/png" }), true);
  assert.equal(isImageAttachment({ contentType: "application/pdf" }), false);
});

test("isImageAttachment falls back to image dimensions", () => {
  assert.equal(isImageAttachment({ contentType: null, height: 100 }), true);
  assert.equal(isImageAttachment({ contentType: null, height: null }), false);
});

test("getAttachmentExtension prefers file name extension", () => {
  assert.equal(getAttachmentExtension({ name: "photo.PNG", contentType: "image/jpeg" }), ".png");
});

test("getAttachmentExtension falls back to content type", () => {
  assert.equal(getAttachmentExtension({ name: null, contentType: "image/webp" }), ".webp");
  assert.equal(getAttachmentExtension({ name: null, contentType: null }), ".img");
});

test("buildAttachmentFilename sanitizes the base name", () => {
  assert.equal(
    buildAttachmentFilename({ name: "my cat(1).png", contentType: "image/png" }, 0),
    "my_cat_1_.png"
  );
});
