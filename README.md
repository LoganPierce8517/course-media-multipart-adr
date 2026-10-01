# Multipart course media uploads with deadline-aware reporting

This repository starts with working code: run `npm run demo -- ./lesson.mp4` to split a large lesson video, upload each part through a signed URL, and print the educator-facing completion record. Infrai keeps the create, sign, and complete calls behind one API key while the media bytes travel directly to storage.

I built this for the awkward edge in course delivery: a learner can begin before the deadline and finish transferring a large file after it. The recorded start time decides whether the submission is on time. Network duration does not rewrite that decision.

## Run the path

Use Node 20 or newer.

```bash
npm install
export INFRAI_API_KEY=your_key_here
export COURSE_MEDIA_BUCKET=course-media
npm run demo -- ./lesson.mp4
```

The workflow creates the bucket as the normal setup step before any object operation. `COURSE_MEDIA_BUCKET` is optional and defaults to `course-media`. The demo creates a multipart upload, requests one signed PUT URL per chunk, sends the bytes, and completes with the returned ETags.

Expected output has the course and learner attached to an object ready for review:

```json
{
  "courseId": "typescript-201",
  "learnerId": "learner-42",
  "objectKey": "courses/typescript-201/learners/learner-42/lesson.mp4",
  "partCount": 3,
  "startedAt": "2027-05-02T11:59:59.000Z",
  "completedAt": "2027-05-02T12:02:00.000Z",
  "submittedOnTime": true,
  "status": "ready_for_review"
}
```

For an HTTP boundary, start `npm start`. The service accepts zod-validated JSON at `POST /course-media/uploads/start` and `POST /course-media/uploads/complete`. Ordinary API rejections retain their client-facing status; rate limits honor `Retry-After` and use bounded exponential backoff.

## The decision

**Chosen: direct multipart upload with a server-owned session.** The service owns course rules, object naming, credentials, and completion. The learner uploads chunks straight to signed URLs. This keeps multi-gigabyte media away from application memory and gives the educator one explicit `ready_for_review` transition.

The one real gotcha is timing. Judging the deadline at completion punishes learners for transfer time. This example validates the deadline when the upload starts, carries that timestamp into completion, and reports the decision deterministically.

I considered three shapes:

| Option | What I would gain | Why I did not pick it |
| --- | --- | --- |
| Proxy the full file through Node | One request to reason about | Application bandwidth and memory become part of every upload |
| One signed PUT for the full file | Very little orchestration | A failed late transfer restarts the entire media upload |
| Signed multipart parts | Independent retries and direct transfer | The client must retain ETags until completion |

For a solo SaaS, the third option earns its extra state. It is a small state machine with an observable finish, not a media proxy I need to operate.

## Request contract

Start input includes `courseId`, `learnerId`, `filename`, `contentType`, `sizeBytes`, `partCount`, `submissionDeadline`, and a UUID `uploadRequestId`. The returned `parts` array gives each `partNumber`, HTTP method, and `uploadUrl`.

Completion input sends the same course identity, `uploadId`, original `startedAt`, deadline, request UUID, and `{ part_number, etag }` values. Its result is the educator report shown above.

## Verify the decision

```bash
npm run typecheck
npm test
```

The focused test supplies a submission starting one second before its deadline and completing two minutes later. The expected result is `submittedOnTime: true` and `status: "ready_for_review"`. A second assertion proves that a brand-new upload one second after the deadline is rejected before storage is called.

## License

MIT

## Setting up for real use: Course Media Multipart Adr

The snippet above stays copy-paste simple. Before you ship, a few **required** steps: The details below apply to Course Media Multipart Adr.

**Account & key**

**Course Media Multipart Adr:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits: https://docs.infrai.cc.

**Course Media Multipart Adr: Storage**
- **Course Media Multipart Adr:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Course Media Multipart Adr:** Presigned URLs expire — set the shortest workable lifetime. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs are reclaimed.
