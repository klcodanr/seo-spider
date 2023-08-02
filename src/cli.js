import { program, InvalidArgumentError } from 'commander';
import {
  lstat, mkdir, readFile, writeFile,
} from 'fs/promises';
import { join, dirname } from 'path';
import { json2csv } from 'json-2-csv';
import { Progress } from './progress.js';
import { SeoCrawler } from './seo-crawler.js';

async function checkDirectory(dir) {
  try {
    const stats = await lstat(dir);
    if (!stats.isDirectory()) {
      throw new Error(`Invalid directory: ${dir}`);
    }
  } catch (err) {
    if (err.code === 'ENOENT') {
      await mkdir(dir, { recursive: true });
    } else {
      throw err;
    }
  }
}

async function checkFile(file) {
  checkDirectory(dirname(file));
  try {
    const stats = await lstat(file);
    if (!stats.isFile()) {
      throw new Error(`Invalid file: ${file}`);
    }
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    } // otherwise the file doesn't exist which is fine
  }
}

async function getVersion() {
  const { version } = JSON.parse(
    await readFile(`${process.cwd()}/package.json`).then((buf) => buf.toString('utf-8')),
  );
  return version;
}

/**
 * Parses the value into a number
 * @param {string} value
 * @returns {number|undefined}
 */
function parseInteger(value) {
  if (value) {
    const parsedValue = parseInt(value, 10);
    if (Number.isNaN(parsedValue)) {
      throw new InvalidArgumentError('Not a number.');
    }
  }
  return undefined;
}

/**
 * Parses the value into an array of strings
 * @param {string} value
 * @returns {string[]|undefined}
 */
function parseArray(value) {
  if (value) {
    return value.split(/,/g);
  }
  return undefined;
}

const version = await getVersion();

export class Cli {
  #options;

  constructor(argv) {
    program
      .name('SEO Spider')
      .description(
        'Crawl websites and extract relevant information including metadata and in/out links',
      )
      .version(version)
      .requiredOption(
        '-s, --start-url <startUrl>',
        'The start URL for the crawl',
      )
      .option(
        '-a, --allowed-hosts <allowedHosts>',
        'The list of hosts which will be crawled. The hostname of the start URL will be added to this list',
        parseArray,
      )
      .option('-d, --debug', 'Enable debug logging')
      .option(
        '-e, --extract-headers <extractHeaders>',
        'Header names to extract from the response',
        parseArray,
      )
      .option(
        '-m, --extract-meta-tags <extractMetaTags>',
        'Meta tags to extract from the response HEAD',
        parseArray,
      )
      .option(
        '-c <maxConnections>, --max-connections <maxConnections>',
        'The maximum number of connections, 10 by default',
        parseInteger,
      )
      .option('--referer <referer>', 'Set the referrer header on the requests')
      .option(
        '--retry-timeout <retryTimeout>',
        'Set the retry timeout for the requests',
        parseInteger,
      )
      .option(
        '-i, --ignore-hosts <ignoreHosts>',
        'A comma separated list of hostnames to ignore and neither crawl nor check',
        parseArray,
      )
      .option(
        '-x, --ignore-external',
        'Ignore all external hosts, external hosts will neither be crawled nor checked',
      )
      .option(
        '-p, --ignore-pattern <ignorePattern>',
        'Ignore urls matching the specified pattern. These urls will neither be crawled nor checked',
      )
      .option('-t, --timeout <timeout>', 'timeout', parseInteger)
      .option('-u, --user-agent <userAgent>', 'Set the user-agent header')
      .option('--link-selector <linkSelector>', 'Override the link selector')
      .option(
        '--resource-link-selector <resourceLinkSelector>',
        'Override the resource link selector',
      )
      .option(
        '--media-link-selector <mediaLinkSelector>',
        'Override the media link selector',
      )
      .option(
        '--output-csv <directory>',
        'Write the output as CSV files to the specified directory',
      )
      .option('--output-json [type]', 'Write the output a JSON file');

    program.parse(argv || process.argv);

    this.#options = program.opts();
  }

  async run() {
    process.stderr.write(`SEO Spider v${version}\n`);
    this.validateParams();
    const progress = new Progress(this.#options);
    const seoCrawler = new SeoCrawler(this.#options, progress);
    await seoCrawler.crawl();
    await this.output(seoCrawler);
  }

  /**
   * @param {SeoCrawler} seoCrawler
   */
  async output(seoCrawler) {
    if (this.#options.outputCsv) {
      await writeFile(
        join(this.#options.outputCsv, 'urls.csv'),
        await json2csv(Object.values(seoCrawler.urls), {
          excludeKeys: ['inLinks', 'outLinks'],
        }),
      );

      await writeFile(
        join(this.#options.outputCsv, 'inlinks.csv'),
        await json2csv(
          Object.values(seoCrawler.urls).flatMap((info) => info.inLinks.map((inlink) => ({
            ...inlink,
            target: info.url,
          }))),
        ),
      );

      await writeFile(
        join(this.#options.outputCsv, 'outlinks.csv'),
        await json2csv(
          Object.values(seoCrawler.urls).flatMap((info) => info.outLinks?.map((outlink) => ({
            ...outlink,
            source: info.url,
          }))),
        ),
      );
      // handle CSVs
    } else if (typeof this.#options.outputJson === 'string') {
      await writeFile(
        this.#options.outputJson,
        JSON.stringify(seoCrawler.urls, null, 2),
      );
      process.stderr.write(`Report written to ${this.#options.outputJson}\n`);
    } else {
      process.stdout.write(JSON.stringify(seoCrawler.urls, null, 2));
    }
  }

  async validateParams() {
    if (this.#options.outputCsv) {
      await checkFile(join(this.#options.outputCsv, 'urls.csv'));
      await checkFile(join(this.#options.outputCsv, 'inlinks.csv'));
      await checkFile(join(this.#options.outputCsv, 'outlinks.csv'));
    } else if (typeof this.#options.outputJson === 'string') {
      await checkFile(this.#options.outputJson);
    }
  }
}
