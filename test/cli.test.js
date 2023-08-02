/* eslint-env mocha */

import assert from 'assert';
import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, rmSync } from 'fs';
import { Server } from './server.js';

const execp = promisify(exec);

const server = new Server();

describe('cli Tests', () => {
  before(async () => {
    server.start();
  });
  beforeEach(() => {
    try {
      rmSync('dist', { recursive: true });
    } catch (err) {
      // just ignore
    }
  });
  after(() => server.stop());

  it('can crawl', async () => {
    const res = await execp('node . -s http://localhost:8000/index.html');
    const report = JSON.parse(res.stdout);
    assert.strictEqual(
      JSON.stringify(Object.keys(report).sort()),
      JSON.stringify(
        [
          'http://localhost:8000/index.html',
          'http://localhost:8000/page2.html',
          'https://www.github.com/',
          'http://localhost:8000/',
          'https://github.com/',
          'https://picsum.photos/200/300',
        ].sort(),
      ),
    );
    assert.ok(res.stderr.includes('SEO Spider'));
  });

  it('can ignore external', async () => {
    const res = await execp('node . -s http://localhost:8000/index.html -x');
    const report = JSON.parse(res.stdout);
    assert.strictEqual(
      JSON.stringify(Object.keys(report).sort()),
      JSON.stringify(
        [
          'http://localhost:8000/index.html',
          'http://localhost:8000/page2.html',
          'http://localhost:8000/',
        ].sort(),
      ),
    );
    assert.ok(res.stderr.includes('SEO Spider'));
  });

  it('can limit connections', async () => {
    const res = await execp('node . -s http://localhost:8000/index.html -c 1');
    const report = JSON.parse(res.stdout);
    assert.ok(report);
  });

  it('can set allowed hosts', async () => {
    const res = await execp(
      'node . -s http://localhost:8000/index.html -a host1,127.0.0.1',
    );
    const report = JSON.parse(res.stdout);
    assert.ok(report);
  });

  it('can ignore url patterns', async () => {
    const res = await execp(
      'node . -s http://localhost:8000/index.html -p page2.html',
    );
    const report = JSON.parse(res.stdout);
    assert.ok(
      !Object.keys(report).includes('http://localhost:8000/page2.html'),
    );
  });

  it('can write JSON', async () => {
    const res = await execp(
      'node . -s http://localhost:8000/index.html --output-json dist/test-report.json',
    );
    assert.strictEqual(res.stdout, '');
    assert.ok(existsSync('dist/test-report.json'));
  });

  it('can extract meta tags', async () => {
    const res = await execp(
      'node . -s http://localhost:8000/index.html -m keywords',
    );
    const { meta } = JSON.parse(res.stdout)['http://localhost:8000/'];
    assert.strictEqual(Object.keys(meta).length, 1);
    assert.strictEqual(
      JSON.parse(res.stdout)['http://localhost:8000/'].meta.keywords,
      "Like it's 1999",
    );
  });

  it('can write csv', async () => {
    const res = await execp(
      'node . -s http://localhost:8000/index.html --output-csv dist/csv',
    );
    assert.strictEqual(res.stdout, '');
    assert.ok(existsSync('dist/csv/inlinks.csv'));
    assert.ok(existsSync('dist/csv/outlinks.csv'));
    assert.ok(existsSync('dist/csv/urls.csv'));
  });
});
