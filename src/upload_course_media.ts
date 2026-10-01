import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { randomUUID } from "node:crypto";
import { startUploadBody } from "./course_media_policy.js";
import { completeCourseMediaUpload, startCourseMediaUpload } from "./course_media_workflow.js";

const filePath = process.argv[2];
if (!filePath) throw new Error("Run: npm run demo -- path/to/lesson.mp4");

const bytes = await readFile(filePath);
const requestId = randomUUID();
const partBytes = 8 * 1024 * 1024;
const input = startUploadBody.parse({
  courseId: "typescript-201",
  learnerId: "learner-42",
  filename: basename(filePath),
  contentType: "video/mp4",
  sizeBytes: bytes.byteLength,
  partCount: Math.ceil(bytes.byteLength / partBytes),
  submissionDeadline: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  uploadRequestId: requestId,
});

const upload = await startCourseMediaUpload(input);
const completedParts = [];
for (const part of upload.parts) {
  const start = (part.partNumber - 1) * partBytes;
  const response = await fetch(part.uploadUrl, {
    method: "PUT",
    body: bytes.subarray(start, Math.min(start + partBytes, bytes.byteLength)),
  });
  if (!response.ok) throw new Error(`Part ${part.partNumber} upload returned HTTP ${response.status}`);
  const etag = response.headers.get("etag");
  if (!etag) throw new Error(`Part ${part.partNumber} did not return an ETag`);
  completedParts.push({ part_number: part.partNumber, etag });
}

const report = await completeCourseMediaUpload({
  courseId: input.courseId,
  learnerId: input.learnerId,
  uploadId: upload.uploadId,
  uploadRequestId: input.uploadRequestId,
  startedAt: upload.startedAt,
  submissionDeadline: input.submissionDeadline,
  parts: completedParts,
});
console.log(JSON.stringify(report, null, 2));
