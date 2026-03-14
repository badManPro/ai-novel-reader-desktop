import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export interface OfflineModelDownloadPlan {
  assetId: string;
  assetName: string;
  checkId: string;
  label: string;
  url: string;
  destinationPath: string;
  checksumSha256?: string;
  expectedSizeBytes?: number;
  required: boolean;
}

export interface OfflineModelDownloadResult {
  assetId: string;
  checkId: string;
  destinationPath: string;
  status: 'downloaded' | 'skipped-existing' | 'checksum-passed' | 'checksum-failed';
  bytesWritten: number;
  totalBytes?: number;
  resumedFromBytes: number;
  checksumSha256?: string;
  actualChecksumSha256?: string;
}

export interface OfflineModelDownloadOptions {
  logger?: (line: string) => void;
  progressIntervalBytes?: number;
  requestTimeoutMs?: number;
}

interface RequestResponse {
  response: http.IncomingMessage;
  finalUrl: string;
}

const DEFAULT_PROGRESS_INTERVAL = 16 * 1024 * 1024;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const MAX_REDIRECTS = 5;

export async function runOfflineModelDownloads(plans: OfflineModelDownloadPlan[], options: OfflineModelDownloadOptions = {}) {
  const results: OfflineModelDownloadResult[] = [];
  for (const plan of plans) {
    results.push(await downloadWithResume(plan, options));
  }
  return results;
}

export async function downloadWithResume(plan: OfflineModelDownloadPlan, options: OfflineModelDownloadOptions = {}) {
  const log = options.logger ?? (() => undefined);
  const progressIntervalBytes = options.progressIntervalBytes ?? DEFAULT_PROGRESS_INTERVAL;
  const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const destinationDir = path.dirname(plan.destinationPath);
  const tempPath = `${plan.destinationPath}.part`;
  const statePath = `${plan.destinationPath}.download-state.json`;

  await mkdir(destinationDir, { recursive: true });

  if (await isChecksumSatisfied(plan.destinationPath, plan.checksumSha256)) {
    const fileStat = await stat(plan.destinationPath);
    log(`download skip :: ${plan.assetId} :: ${plan.checkId} :: reason=existing-checksum-ok :: path=${plan.destinationPath} :: bytes=${fileStat.size}`);
    return finalizeResult(plan, 'skipped-existing', fileStat.size, 0, plan.checksumSha256, plan.checksumSha256, fileStat.size);
  }

  let resumeFrom = 0;
  try {
    const existing = await stat(tempPath);
    resumeFrom = existing.size;
  } catch {
    resumeFrom = 0;
  }

  log(`download plan :: ${plan.assetId} :: ${plan.checkId} :: url=${plan.url} :: path=${plan.destinationPath} :: resumeFrom=${resumeFrom} :: expectedSha256=${plan.checksumSha256 ?? 'missing'} :: expectedBytes=${plan.expectedSizeBytes ?? 0}`);

  const responseInfo = await requestWithRedirects(plan.url, resumeFrom, requestTimeoutMs);
  const { response, finalUrl } = responseInfo;
  const supportsResume = response.statusCode === 206;
  const restartingFromZero = resumeFrom > 0 && !supportsResume;
  const totalBytes = getTotalBytes(response.headers, resumeFrom, supportsResume);

  if (restartingFromZero) {
    log(`download resume-reset :: ${plan.assetId} :: ${plan.checkId} :: reason=server-no-range :: previousPartial=${resumeFrom} :: finalUrl=${finalUrl}`);
    await rm(tempPath, { force: true });
    resumeFrom = 0;
  } else if (resumeFrom > 0) {
    log(`download resume :: ${plan.assetId} :: ${plan.checkId} :: offset=${resumeFrom} :: finalUrl=${finalUrl}`);
  }

  await writeFile(statePath, JSON.stringify({
    assetId: plan.assetId,
    checkId: plan.checkId,
    url: plan.url,
    finalUrl,
    destinationPath: plan.destinationPath,
    resumeFromBytes: resumeFrom,
    expectedSizeBytes: plan.expectedSizeBytes,
    checksumSha256: plan.checksumSha256,
    updatedAt: new Date().toISOString()
  }, null, 2));

  const writer = createWriteStream(tempPath, { flags: resumeFrom > 0 && supportsResume ? 'a' : 'w' });
  let writtenBytes = resumeFrom > 0 && supportsResume ? resumeFrom : 0;
  let nextProgressAt = writtenBytes + progressIntervalBytes;

  response.on('data', (chunk: Buffer) => {
    writtenBytes += chunk.length;
    if (writtenBytes >= nextProgressAt) {
      const percent = totalBytes && totalBytes > 0 ? ((writtenBytes / totalBytes) * 100).toFixed(2) : 'na';
      log(`download progress :: ${plan.assetId} :: ${plan.checkId} :: bytes=${writtenBytes} :: total=${totalBytes ?? 0} :: percent=${percent}`);
      nextProgressAt = writtenBytes + progressIntervalBytes;
    }
  });

  try {
    await pipeline(response, writer);
  } catch (error) {
    log(`download error :: ${plan.assetId} :: ${plan.checkId} :: message=${error instanceof Error ? error.message : 'unknown pipeline error'}`);
    throw error;
  }

  const finalSize = (await stat(tempPath)).size;
  if (plan.expectedSizeBytes && finalSize !== plan.expectedSizeBytes) {
    log(`download size-mismatch :: ${plan.assetId} :: ${plan.checkId} :: expected=${plan.expectedSizeBytes} :: actual=${finalSize}`);
  }

  await rename(tempPath, plan.destinationPath);
  await rm(statePath, { force: true });

  const actualChecksumSha256 = await computeSha256(plan.destinationPath);
  if (plan.checksumSha256) {
    const status = actualChecksumSha256 === plan.checksumSha256 ? 'checksum-passed' : 'checksum-failed';
    log(`download verify :: ${plan.assetId} :: ${plan.checkId} :: status=${status} :: expected=${plan.checksumSha256} :: actual=${actualChecksumSha256} :: path=${plan.destinationPath}`);
    if (status === 'checksum-failed') {
      throw new Error(`checksum mismatch for ${plan.destinationPath}`);
    }
    return finalizeResult(plan, status, finalSize, resumeFrom, plan.checksumSha256, actualChecksumSha256, totalBytes);
  }

  log(`download complete :: ${plan.assetId} :: ${plan.checkId} :: bytes=${finalSize} :: total=${totalBytes ?? 0} :: sha256=${actualChecksumSha256} :: path=${plan.destinationPath}`);
  return finalizeResult(plan, 'downloaded', finalSize, resumeFrom, undefined, actualChecksumSha256, totalBytes);
}

async function isChecksumSatisfied(filePath: string, expectedSha256?: string) {
  if (!expectedSha256) {
    return false;
  }
  try {
    const actual = await computeSha256(filePath);
    return actual === expectedSha256;
  } catch {
    return false;
  }
}

async function computeSha256(filePath: string) {
  const hash = createHash('sha256');
  const writer = new WritableHash(hash);
  await pipeline(createReadStream(filePath), writer);
  return hash.digest('hex');
}

class WritableHash extends Writable {
  private readonly hash: ReturnType<typeof createHash>;

  constructor(hash: ReturnType<typeof createHash>) {
    super();
    this.hash = hash;
  }

  _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    this.hash.update(chunk);
    callback();
  }
}

function finalizeResult(
  plan: OfflineModelDownloadPlan,
  status: OfflineModelDownloadResult['status'],
  bytesWritten: number,
  resumedFromBytes: number,
  checksumSha256?: string,
  actualChecksumSha256?: string,
  totalBytes?: number
): OfflineModelDownloadResult {
  return {
    assetId: plan.assetId,
    checkId: plan.checkId,
    destinationPath: plan.destinationPath,
    status,
    bytesWritten,
    totalBytes,
    resumedFromBytes,
    checksumSha256,
    actualChecksumSha256
  };
}

function getTotalBytes(headers: http.IncomingHttpHeaders, resumeFrom: number, supportsResume: boolean) {
  const contentRange = headers['content-range'];
  if (supportsResume && typeof contentRange === 'string') {
    const matched = contentRange.match(/\/([0-9]+)$/);
    if (matched) {
      return Number(matched[1]);
    }
  }
  const contentLength = Number(headers['content-length'] ?? 0);
  return Number.isFinite(contentLength) && contentLength > 0 ? contentLength + (supportsResume ? resumeFrom : 0) : undefined;
}

async function requestWithRedirects(url: string, resumeFrom: number, requestTimeoutMs: number, redirectCount = 0): Promise<RequestResponse> {
  const client = url.startsWith('https:') ? https : http;
  const headers: Record<string, string> = {
    'user-agent': 'ai-novel-reader-desktop/offline-model-downloader'
  };
  if (resumeFrom > 0) {
    headers.range = `bytes=${resumeFrom}-`;
  }

  return new Promise<RequestResponse>((resolve, reject) => {
    const request = client.get(url, { headers, timeout: requestTimeoutMs }, (response) => {
      const statusCode = response.statusCode ?? 0;
      const location = response.headers.location;
      if ([301, 302, 303, 307, 308].includes(statusCode) && location) {
        response.resume();
        if (redirectCount >= MAX_REDIRECTS) {
          reject(new Error(`too many redirects for ${url}`));
          return;
        }
        const nextUrl = new URL(location, url).toString();
        void requestWithRedirects(nextUrl, resumeFrom, requestTimeoutMs, redirectCount + 1).then(resolve, reject);
        return;
      }
      if (![200, 206].includes(statusCode)) {
        response.resume();
        reject(new Error(`unexpected status ${statusCode} for ${url}`));
        return;
      }
      resolve({ response, finalUrl: url });
    });

    request.once('timeout', () => {
      request.destroy(new Error(`request timeout after ${requestTimeoutMs}ms for ${url}`));
    });
    request.once('error', reject);
  });
}
