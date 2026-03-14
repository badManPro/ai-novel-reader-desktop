import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { downloadWithResume } from '../main/services/offline-model-downloader';

const tempRoots: string[] = [];
after(async () => {
  await Promise.all(tempRoots.map((dir) => rm(dir, { recursive: true, force: true })));
});

test('offline model downloader resumes partial downloads and verifies checksum', async () => {
  const source = Buffer.alloc(512 * 1024, 'a');
  const sha256 = createHash('sha256').update(source).digest('hex');
  const logs: string[] = [];
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'offline-model-downloader-'));
  tempRoots.push(tempDir);
  const destinationPath = path.join(tempDir, 'model.bin');
  await writeFile(`${destinationPath}.part`, source.subarray(0, 128 * 1024));

  const server = http.createServer((request, response) => {
    const range = request.headers.range;
    if (range) {
      const matched = String(range).match(/bytes=(\d+)-/);
      const start = matched ? Number(matched[1]) : 0;
      response.statusCode = 206;
      response.setHeader('Accept-Ranges', 'bytes');
      response.setHeader('Content-Range', `bytes ${start}-${source.length - 1}/${source.length}`);
      response.setHeader('Content-Length', source.length - start);
      response.end(source.subarray(start));
      return;
    }
    response.statusCode = 200;
    response.setHeader('Accept-Ranges', 'bytes');
    response.setHeader('Content-Length', source.length);
    response.end(source);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));

  try {
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('failed to bind test server');
    }
    const result = await downloadWithResume({
      assetId: 'asset-1',
      assetName: 'big model',
      checkId: 'check-1',
      label: 'big model',
      url: `http://127.0.0.1:${address.port}/model.bin`,
      destinationPath,
      checksumSha256: sha256,
      expectedSizeBytes: source.length,
      required: true
    }, {
      logger: (line) => logs.push(line),
      progressIntervalBytes: 64 * 1024
    });

    assert.equal(result.status, 'checksum-passed');
    assert.equal(result.resumedFromBytes, 128 * 1024);
    assert.equal((await stat(destinationPath)).size, source.length);
    assert.deepEqual(await readFile(destinationPath), source);
    assert.equal(logs.some((line) => line.includes('download resume :: asset-1 :: check-1')), true);
    assert.equal(logs.some((line) => line.includes('download verify :: asset-1 :: check-1 :: status=checksum-passed')), true);
  } finally {
    server.close();
  }
});

test('offline model downloader skips existing file when checksum already matches', async () => {
  const source = Buffer.from('already-present');
  const sha256 = createHash('sha256').update(source).digest('hex');
  const logs: string[] = [];
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'offline-model-downloader-'));
  tempRoots.push(tempDir);
  const destinationPath = path.join(tempDir, 'ready.bin');
  await writeFile(destinationPath, source);

  const result = await downloadWithResume({
    assetId: 'asset-2',
    assetName: 'ready model',
    checkId: 'check-2',
    label: 'ready model',
    url: 'http://127.0.0.1:9/not-used',
    destinationPath,
    checksumSha256: sha256,
    required: true
  }, {
    logger: (line) => logs.push(line)
  });

  assert.equal(result.status, 'skipped-existing');
  assert.equal(logs.some((line) => line.includes('reason=existing-checksum-ok')), true);
});
