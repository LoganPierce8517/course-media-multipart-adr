import { createServer, type ServerResponse } from "node:http";
import { ZodError } from "zod";
import { InfraiError } from "./infrai_storage.js";
import { completeUploadBody, DeadlinePassedError, startUploadBody } from "./course_media_policy.js";
import { completeCourseMediaUpload, startCourseMediaUpload } from "./course_media_workflow.js";

const port = Number(process.env.PORT ?? 3000);

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

async function jsonBody(request: AsyncIterable<Uint8Array>): Promise<unknown> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendError(response: ServerResponse, error: unknown): void {
  if (error instanceof ZodError) {
    send(response, 400, { error: "invalid_request", issues: error.issues });
    return;
  }
  if (error instanceof DeadlinePassedError) {
    send(response, 409, { error: "submission_closed", deadline: error.deadline });
    return;
  }
  if (error instanceof InfraiError) {
    const status = error.status >= 400 && error.status < 500 ? error.status : 502;
    send(response, status, { error: error.code, message: error.message });
    return;
  }
  send(response, 500, { error: "internal_error" });
}

export const server = createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url === "/course-media/uploads/start") {
      const input = startUploadBody.parse(await jsonBody(request));
      send(response, 201, await startCourseMediaUpload(input));
      return;
    }
    if (request.method === "POST" && request.url === "/course-media/uploads/complete") {
      const input = completeUploadBody.parse(await jsonBody(request));
      send(response, 200, await completeCourseMediaUpload(input));
      return;
    }
    send(response, 404, { error: "route_not_found" });
  } catch (error) {
    sendError(response, error);
  }
});

if (process.env.NODE_ENV !== "test") {
  server.listen(port, () => console.log(`Course media service listening on http://localhost:${port}`));
}
