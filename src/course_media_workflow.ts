import { infrai } from "./infrai_storage.js";
import {
  assertUploadMayStart,
  educatorReport,
  mediaObjectKey,
  type CompleteUpload,
  type StartUpload,
} from "./course_media_policy.js";

const COURSE_MEDIA_BUCKET = process.env.COURSE_MEDIA_BUCKET ?? "course-media";

export async function startCourseMediaUpload(input: StartUpload, now = new Date()) {
  assertUploadMayStart(input, now);
  await infrai.storage.bucket.create(COURSE_MEDIA_BUCKET);

  const key = mediaObjectKey(input);
  const created = await infrai.storage.multipart.create(
    COURSE_MEDIA_BUCKET,
    key,
    input.contentType,
    `start:${input.uploadRequestId}`,
  );
  const parts = await Promise.all(
    Array.from({ length: input.partCount }, async (_, index) => {
      const partNumber = index + 1;
      const signed = await infrai.storage.multipart.presign_part(
        created.upload_id,
        partNumber,
        `part:${input.uploadRequestId}:${partNumber}`,
      );
      return { partNumber, method: "PUT" as const, uploadUrl: signed.url };
    }),
  );

  return {
    uploadId: created.upload_id,
    objectKey: key,
    minimumPartBytes: created.part_size_min,
    startedAt: now.toISOString(),
    parts,
  };
}

export async function completeCourseMediaUpload(input: CompleteUpload, now = new Date()) {
  const completed = await infrai.storage.multipart.complete(
    input.uploadId,
    input.parts,
    `complete:${input.uploadRequestId}`,
  );
  return educatorReport(input, completed.key, now);
}
