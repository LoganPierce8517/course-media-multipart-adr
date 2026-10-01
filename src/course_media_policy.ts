import { z } from "zod";

export const startUploadBody = z.object({
  courseId: z.string().trim().min(1).max(80),
  learnerId: z.string().trim().min(1).max(80),
  filename: z.string().trim().min(1).max(180),
  contentType: z.string().trim().min(1).max(120),
  sizeBytes: z.number().int().positive(),
  partCount: z.number().int().min(1).max(10_000),
  submissionDeadline: z.string().datetime({ offset: true }),
  uploadRequestId: z.string().uuid(),
});

export const completeUploadBody = z.object({
  courseId: z.string().trim().min(1).max(80),
  learnerId: z.string().trim().min(1).max(80),
  uploadId: z.string().trim().min(1),
  uploadRequestId: z.string().uuid(),
  startedAt: z.string().datetime({ offset: true }),
  submissionDeadline: z.string().datetime({ offset: true }),
  parts: z.array(z.object({
    part_number: z.number().int().positive(),
    etag: z.string().trim().min(1),
  })).min(1),
});

export type StartUpload = z.infer<typeof startUploadBody>;
export type CompleteUpload = z.infer<typeof completeUploadBody>;

export class DeadlinePassedError extends Error {
  readonly deadline: string;

  constructor(deadline: string) {
    super("The learner submission window has closed");
    this.name = "DeadlinePassedError";
    this.deadline = deadline;
  }
}

export function assertUploadMayStart(input: StartUpload, now: Date): void {
  if (now.getTime() > Date.parse(input.submissionDeadline)) {
    throw new DeadlinePassedError(input.submissionDeadline);
  }
}

export function educatorReport(input: CompleteUpload, objectKey: string, completedAt: Date) {
  return {
    courseId: input.courseId,
    learnerId: input.learnerId,
    objectKey,
    partCount: input.parts.length,
    startedAt: input.startedAt,
    completedAt: completedAt.toISOString(),
    submittedOnTime: Date.parse(input.startedAt) <= Date.parse(input.submissionDeadline),
    status: "ready_for_review" as const,
  };
}

export function mediaObjectKey(input: Pick<StartUpload, "courseId" | "learnerId" | "filename">): string {
  const safeName = input.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `courses/${input.courseId}/learners/${input.learnerId}/${safeName}`;
}
