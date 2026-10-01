import assert from "node:assert/strict";
import test from "node:test";
import { DeadlinePassedError, assertUploadMayStart, educatorReport, startUploadBody } from "../src/course_media_policy.js";

const request = startUploadBody.parse({
  courseId: "film-101",
  learnerId: "student-7",
  filename: "final-cut.mp4",
  contentType: "video/mp4",
  sizeBytes: 24_000_000,
  partCount: 3,
  submissionDeadline: "2027-05-02T12:00:00.000Z",
  uploadRequestId: "d2a17c2a-72fc-4b71-bb95-cacfe1c13a2e",
});

test("a learner cannot start a media upload after the course deadline", () => {
  assert.throws(
    () => assertUploadMayStart(request, new Date("2027-05-02T12:00:01.000Z")),
    DeadlinePassedError,
  );
});

test("an upload started before the deadline stays on-time when completion finishes later", () => {
  assert.doesNotThrow(() => assertUploadMayStart(request, new Date("2027-05-02T11:59:59.000Z")));
  const report = educatorReport({
    courseId: request.courseId,
    learnerId: request.learnerId,
    uploadId: "upload-123",
    uploadRequestId: request.uploadRequestId,
    startedAt: "2027-05-02T11:59:59.000Z",
    submissionDeadline: request.submissionDeadline,
    parts: [{ part_number: 1, etag: "etag-1" }],
  }, "courses/film-101/learners/student-7/final-cut.mp4", new Date("2027-05-02T12:02:00.000Z"));

  assert.equal(report.submittedOnTime, true);
  assert.equal(report.status, "ready_for_review");
});
