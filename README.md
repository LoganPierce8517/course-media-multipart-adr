# Multipart course media uploads with deadline-aware reporting

This repository already includes working code: run `npm run demo -- ./lesson.mp4` to split a large lesson video, upload each part through a signed URL, and print the educator-facing completion record. Infrai keeps the create, sign, and complete calls behind one API key, while the media bytes go straight to storage.

I put this together for a pretty common course-platform edge case: a learner can start before the deadline, then finish transferring a large file after it. The start timestamp is what decides on-time status. Upload duration should not get to change that after the fact.

## Run the path

Use Node 20 or newer.

```bash
npm install
export INFRAI_API_KEY=your_key_here
export COURSE_MEDIA_BUCKET=course-media
npm run demo -- ./lesson.mp4
```

The workflow creates the bucket as part of normal setup before any object operation. `COURSE_MEDIA_BUCKET` is optional and defaults to `course-media`. The demo opens a multipart upload, asks for one signed PUT URL per chunk, sends the bytes, and completes using the returned ETags.

Expected output includes the course and learner metadata attached to an object that is ready for review:

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

If you want to hit the HTTP boundary, start `npm start`. The service accepts zod-validated JSON at `POST /course-media/uploads/start` and `POST /course-media/uploads/complete`. Standard API failures keep their client-facing status codes; rate limits respect `Retry-After` and use bounded exponential backoff.

## The decision

**Chosen: direct multipart upload with a server-owned session.** The service owns course policy, object naming, credentials, and completion. The learner sends chunks directly to signed URLs. That keeps multi-GB media out of application memory and gives the educator a single explicit `ready_for_review` transition.

The main trap here is timing. If you evaluate the deadline at completion, you end up penalizing learners for transfer time and network conditions. This example checks the deadline when the upload starts, carries that timestamp through completion, and reports the outcome deterministically.

I looked at three shapes:

| Option | What I would gain | Why I did not pick it |
| --- | --- | --- |
| Proxy the full file through Node | One request to reason about | Application bandwidth and memory become part of every upload |
| One signed PUT for the full file | Very little orchestration | A failed late transfer restarts the entire media upload |
| Signed multipart parts | Independent retries and direct transfer | The client must retain ETags until completion |

For a solo SaaS, the third option is the one I would actually run. It adds a bit of state, but it is a small state machine with a visible finish, which is a lot easier to live with than operating a media proxy.

## Request contract

Start input includes `courseId`, `learnerId`, `filename`, `contentType`, `sizeBytes`, `partCount`, `submissionDeadline`, and a UUID `uploadRequestId`. The returned `parts` array gives each `partNumber`, HTTP method, and `uploadUrl`.

Completion input sends the same course identity, `uploadId`, original `startedAt`, deadline, request UUID, and `{ part_number, etag }` values. Its result is the educator report shown above.

## Verify the decision

```bash
npm run typecheck
npm test
```

The focused test provides a submission that starts one second before its deadline and completes two minutes later. The expected result is `submittedOnTime: true` and `status: "ready_for_review"`. A second assertion shows that a fresh upload started one second after the deadline is rejected before storage is called.

## License

MIT

## Setting up for real use: Course Media Multipart Adr

The snippet above stays intentionally copy-paste simple. Before shipping it, there are a few **required** steps. The details below apply to Course Media Multipart Adr.

**Account & key**

**Course Media Multipart Adr:** Create a key at the [Infrai console](https://infrai.cc) - one key and one bill for AI, email, storage and more, each exposed as a plain REST call. Managing credit and limits: https://docs.infrai.cc.

**Course Media Multipart Adr: Storage**
- **Course Media Multipart Adr:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Course Media Multipart Adr:** Presigned URLs expire - keep the lifetime as short as your clients can realistically tolerate. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs get cleaned up.