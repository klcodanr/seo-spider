/* eslint-env mocha */

import assert from 'assert';
import { exec as execCb } from 'child_process';
import { promisify } from 'util';
import { existsSync, rmSync } from 'fs';
import { Server } from './server.js';

async function exec(command) {
  const res = await promisify(execCb)(command);
  console.log(`CMD: ${command}`);
  console.log(`OUT: ${res.stdout}`);
  console.log(`ERR: ${res.stderr}`);
  return res;
}

const server = new Server();

function assertArrayContentsEqual(array1, array2) {
  assert.strictEqual(
    JSON.stringify(array1.sort(), null, 2),
    JSON.stringify(array2.sort(), null, 2),
  );
}

describe('cli Tests', () => {
  before(async () => server.start());
  beforeEach(() => {
    try {
      rmSync('dist', { recursive: true });
    } catch (err) {
      // just ignore
    }
  });
  after(() => server.stop());

  it('can crawl', async () => {
    const res = await exec('node src/cli.js http://localhost:8000/index.html');
    const report = JSON.parse(res.stdout);

    assertArrayContentsEqual(Object.keys(report), [
      'http://localhost:8000/',
      'http://localhost:8000/config.json',
      'http://localhost:8000/index.html',
      'http://localhost:8000/invalidpage.html',
      'http://localhost:8000/page2.html',
      'https://github.com/',
      'http://localhost:8000/an-image.png',
      'https://www.github.com/',
    ]);
    assert.ok(res.stderr.includes('SEO Spider'));
  });

  it('can ignore external', async () => {
    const res = await exec(
      'node src/cli.js -x http://localhost:8000/index.html',
    );
    const report = JSON.parse(res.stdout);
    assertArrayContentsEqual(Object.keys(report), [
      'http://localhost:8000/',
      'http://localhost:8000/config.json',
      'http://localhost:8000/index.html',
      'http://localhost:8000/invalidpage.html',
      'http://localhost:8000/an-image.png',
      'http://localhost:8000/page2.html',
    ]);
    assert.ok(res.stderr.includes('SEO Spider'));
  });

  it('can limit connections', async () => {
    const res = await exec(
      'node src/cli.js -c 1 http://localhost:8000/index.html',
    );
    const report = JSON.parse(res.stdout);
    assert.ok(report);
  });

  it('can set allowed hosts', async () => {
    const res = await exec(
      'node src/cli.js -a host1,127.0.0.1 http://localhost:8000/index.html',
    );
    const report = JSON.parse(res.stdout);
    assert.ok(report);
  });

  it('can ignore url patterns', async () => {
    const res = await exec(
      'node src/cli.js -p page2.html http://localhost:8000/index.html',
    );
    const report = JSON.parse(res.stdout);
    assert.ok(
      !Object.keys(report).includes('http://localhost:8000/page2.html'),
    );
  });

  it('can specify config file', async () => {
    const res = await exec(
      'node src/cli.js --config test/res/config.json http://localhost:8000/index.html',
    );
    const report = JSON.parse(res.stdout);
    assert.ok(
      !Object.keys(report).includes('http://localhost:8000/page2.html'),
    );
  });

  it('can write JSON', async () => {
    const res = await exec(
      'node src/cli.js --output-json dist/test-report.json http://localhost:8000/index.html ',
    );
    assert.strictEqual(res.stdout, '');
    assert.ok(existsSync('dist/test-report.json'));
  });

  it('can extract meta tags', async () => {
    const res = await exec(
      'node src/cli.js -m keywords http://localhost:8000/index.html ',
    );
    const { meta } = JSON.parse(res.stdout)['http://localhost:8000/'];
    assert.strictEqual(Object.keys(meta).length, 1);
    assert.strictEqual(
      JSON.parse(res.stdout)['http://localhost:8000/'].meta.keywords,
      "Like it's 1999",
    );
  });

  it('can write csv', async () => {
    const res = await exec(
      'node src/cli.js --output-csv dist/csv http://localhost:8000/index.html',
    );
    assert.strictEqual(res.stdout, '');
    assert.ok(existsSync('dist/csv/inlinks.csv'));
    assert.ok(existsSync('dist/csv/outlinks.csv'));
    assert.ok(existsSync('dist/csv/urls.csv'));
  });

  it('fails with invalid directory', async () => {
    await assert.rejects(() =>
      exec(
        'node src/cli.js --output-csv package.json http://localhost:8000/index.html',
      ),
    );
  });

  it('can handle request failure', async () => {
    const res = await exec(
      'node src/cli.js -t 10 --retry-timeout 10 http://notreal.local/',
    );
    assert.deepStrictEqual(
      JSON.parse(res.stdout)['http://notreal.local/'].statusCode,
      'ERROR',
    );
  }).timeout(600000);
});
