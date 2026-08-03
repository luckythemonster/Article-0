/**
 * Minimal PixelLab API client for the sprite pipeline.
 *
 * Covers the three things the generators need and nothing else: fire a request,
 * wait for the background job it spawns, and pull the resulting frames down.
 *
 * The API key is read from `PIXELLAB_API_KEY` and is never written to disk or
 * echoed in logs. Get one from https://www.pixellab.ai and export it before
 * running any script in this directory.
 *
 * Every character and animation endpoint is asynchronous: the POST returns a
 * `background_job_id` within a second or two, and the actual work shows up
 * later under `GET /background-jobs/{id}`. Generation typically takes 30-180s.
 */

const BASE_URL = "https://api.pixellab.ai/v2";

/** Polling cadence for background jobs. The API's own guidance is 2-5s. */
const POLL_INTERVAL_MS = 4000;
const POLL_TIMEOUT_MS = 15 * 60 * 1000;

export interface BackgroundJob {
  id: string;
  status: "processing" | "completed" | "failed" | string;
  last_response?: Record<string, unknown> | null;
  error?: string | null;
}

export interface Balance {
  credits: { type: string; usd?: number };
  subscription?: { generations?: number; total?: number; plan?: string };
}

export function apiKey(): string {
  const key = process.env.PIXELLAB_API_KEY;
  if (!key) {
    throw new Error(
      "PIXELLAB_API_KEY is not set. Export your PixelLab API key before running this script:\n" +
        "    export PIXELLAB_API_KEY=...",
    );
  }
  return key;
}

/**
 * Retries for transient failures.
 *
 * A full player run is around sixty jobs polled over the better part of an
 * hour, so a single DNS blip or gateway hiccup should not throw away the work
 * already paid for. Only network errors and 5xx are retried — a 4xx is a bad
 * request that will fail identically next time, and retrying it just burns
 * time.
 */
const RETRYABLE_ATTEMPTS = 5;

async function request(method: string, path: string, body?: unknown): Promise<unknown> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= RETRYABLE_ATTEMPTS; attempt++) {
    let status = 0;
    try {
      const response = await fetch(`${BASE_URL}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${apiKey()}`,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });

      status = response.status;
      const text = await response.text();
      if (response.ok) return text ? JSON.parse(text) : null;

      const error = new Error(`PixelLab ${method} ${path} failed (${status}): ${text.slice(0, 600)}`);
      if (status < 500) throw error;
      lastError = error;
    } catch (error) {
      // A thrown 4xx is final; anything else is a transport failure.
      if (status >= 400 && status < 500) throw error;
      lastError = error;
    }

    if (attempt < RETRYABLE_ATTEMPTS) {
      const backoff = 2000 * 2 ** (attempt - 1);
      console.log(`  retrying ${method} ${path} in ${backoff / 1000}s (${String(lastError).slice(0, 120)})`);
      await sleep(backoff);
    }
  }

  throw lastError;
}

export function get(path: string): Promise<unknown> {
  return request("GET", path);
}

export function post(path: string, body: unknown): Promise<unknown> {
  return request("POST", path, body);
}

/** Remaining generations on the subscription, for budget checks between steps. */
export async function balance(): Promise<Balance> {
  return (await get("/balance")) as Balance;
}

/**
 * Polls a background job to completion and returns its `last_response`.
 *
 * Throws on a failed job or if the job is still processing after the timeout —
 * a silent partial result would be far worse here than a loud stop, because the
 * frames it produced would land half-written in `public/assets`.
 */
export async function awaitJob(jobId: string, label: string): Promise<Record<string, unknown>> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let reported = "";

  while (Date.now() < deadline) {
    const job = (await get(`/background-jobs/${jobId}`)) as BackgroundJob;
    if (job.status !== reported) {
      console.log(`  [${label}] ${job.status}`);
      reported = job.status;
    }
    if (job.status === "completed") {
      if (!job.last_response) throw new Error(`${label}: job ${jobId} completed with no response body`);
      return job.last_response;
    }
    if (job.status === "failed") {
      throw new Error(`${label}: job ${jobId} failed — ${job.error ?? "no error detail"}`);
    }
    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(`${label}: job ${jobId} did not finish within ${POLL_TIMEOUT_MS / 1000}s`);
}

/** POSTs to an endpoint that returns a `background_job_id`, then waits it out. */
export async function postAndAwait(
  path: string,
  body: unknown,
  label: string,
): Promise<Record<string, unknown>> {
  const started = (await post(path, body)) as Record<string, unknown>;
  const jobId = (started.background_job_id ?? started.id) as string | undefined;
  if (!jobId) {
    throw new Error(`${label}: ${path} returned no background_job_id: ${JSON.stringify(started).slice(0, 300)}`);
  }
  console.log(`  [${label}] job ${jobId}`);
  return awaitJob(jobId, label);
}

/** Downloads a generated frame. Retries transient failures — these are large batches over a CDN. */
export async function download(url: string, attempts = 4): Promise<Uint8Array> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return new Uint8Array(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(1000 * 2 ** (attempt - 1));
    }
  }
  throw new Error(`download failed after ${attempts} attempts: ${url}\n  ${String(lastError)}`);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Wraps raw PNG bytes in the `{ type, base64 }` shape the API's image fields expect. */
export function toBase64Image(bytes: Uint8Array): { type: string; base64: string } {
  return { type: "base64", base64: Buffer.from(bytes).toString("base64") };
}
