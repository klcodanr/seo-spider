#!/usr/bin/env node
import { program, InvalidArgumentError } from 'commander';
import {
  lstat, mkdir, readFile, writeFile,
} from 'fs/promises';
import { join, dirname } from 'path';
import { json2csv } from 'json-2-csv';
import { Progress } from './progress.js';
import { SeoSpider } from './index.js';

async function getVersion() {
  const { version } = JSON.parse(
    await readFile(`${process.cwd()}/package.json`).then((buf) => buf.toString('utf-8')),
  );
  return version;
}

const version = await getVersion();

class Cli {
  static async #checkDirectory(dir) {
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

  static async #checkFile(file) {
    Cli.#checkDirectory(dirname(file));
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

  /**
   * Parses the value into a number
   * @param {string} value
   * @returns {number|undefined}
   */
  static #parseInteger(value) {
    let parsedValue;
    if (value) {
      parsedValue = parseInt(value, 10);
      if (Number.isNaN(parsedValue)) {
        throw new InvalidArgumentError('Not a number.');
      }
    }
    return parsedValue;
  }

  /**
   * Parses the value into an array of strings
   * @param {string} value
   * @returns {string[]|undefined}
   */
  static #parseArray(value) {
    if (value) {
      return value.split(/,/g);
    }
    return undefined;
  }

  #options;

  #start;

  constructor(argv) {
    program
      .name('seo-spider')
      .showHelpAfterError()
      .description(
        'Crawl websites and extract relevant information including metadata and in/out links',
      )
      .version(version)
      .argument('<startUrl>', 'The start URL for the crawl')
      .option(
        '-a, --allowed-hosts <allowedHosts>',
        'The list of hosts which will be crawled. The hostname of the start URL will be added to this list',
        Cli.#parseArray,
      )
      .option('-d, --debug', 'Enable debug logging')
      .option(
        '-e, --extract-headers <extractHeaders>',
        'Header names to extract from the response',
        Cli.#parseArray,
      )
      .option(
        '-m, --extract-meta-tags <extractMetaTags>',
        'Meta tags to extract from the response HEAD',
        Cli.#parseArray,
      )
      .option(
        '-c <maxConnections>, --max-connections <maxConnections>',
        'The maximum number of connections, 10 by default',
        Cli.#parseInteger,
      )
      .option('--referer <referer>', 'Set the referrer header on the requests')
      .option(
        '--retry-timeout <retryTimeout>',
        'Set the retry timeout for the requests',
        Cli.#parseInteger,
      )
      .option(
        '-i, --ignore-hosts <ignoreHosts>',
        'A comma separated list of hostnames to ignore and neither crawl nor check',
        Cli.#parseArray,
      )
      .option(
        '-x, --ignore-external',
        'Ignore all external hosts, external hosts will neither be crawled nor checked',
      )
      .option(
        '-p, --ignore-pattern <ignorePattern>',
        'Ignore urls matching the specified pattern. These urls will neither be crawled nor checked',
      )
      .option(
        '-l, --rate-limit <rateLimit>',
        'the rate limit in milliseconds',
        Cli.#parseInteger,
      )
      .option(
        '-t, --timeout <timeout>',
        'the maximum duration before a request will be aborted in milliseconds',
        Cli.#parseInteger,
      )
      .option(
        '-u, --user-agent <userAgent>',
        'Set the user-agent header',
        `SEO-Spider/${version}`,
      )
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
      .option('--output-json [type]', 'Write the output a JSON file')
      .option('--config <config>', 'Use a configuration JSON file');

    program.parse(argv || process.argv);

    // eslint-disable-next-line prefer-destructuring
    this.#start = program.args[0];
    this.#options = program.opts();
  }

  async run() {
    process.stderr.write(`SEO Spider v${version}\n`);
    this.validateParams();
    if (this.#options.config) {
      const config = JSON.parse(await readFile(this.#options.config));
      this.#options = { ...config, ...this.#options };
    }
    const progress = new Progress(this.#options);
    const spider = new SeoSpider(this.#start, this.#options, progress);

    process.on('SIGINT', () => {
      process.stderr.write('Caught interrupt, writing output');
      this.output(spider).then(() => process.exit());
    });
    await spider.crawl();
    await this.output(spider);
  }

  /**
   * @param {SeoSpider} spider
   */
  async output(spider) {
    if (this.#options.outputCsv) {
      await writeFile(
        join(this.#options.outputCsv, 'urls.csv'),
        await json2csv(Object.values(spider.urls), {
          excludeKeys: ['inLinks', 'outLinks'],
        }),
      );

      await writeFile(
        join(this.#options.outputCsv, 'inlinks.csv'),
        await json2csv(
          Object.values(spider.urls).flatMap((info) => info.inLinks.map((inlink) => ({
            ...inlink,
            target: info.url,
          }))),
        ),
      );

      await writeFile(
        join(this.#options.outputCsv, 'outlinks.csv'),
        await json2csv(
          Object.values(spider.urls).flatMap((info) => info.outLinks?.map((outlink) => ({
            ...outlink,
            source: info.url,
          }))),
        ),
      );
      // handle CSVs
    } else if (typeof this.#options.outputJson === 'string') {
      await writeFile(
        this.#options.outputJson,
        JSON.stringify(spider.urls, null, 2),
      );
      process.stderr.write(`Report written to ${this.#options.outputJson}\n`);
    } else {
      process.stdout.write(JSON.stringify(spider.urls, null, 2));
    }
  }

  async validateParams() {
    if (this.#options.outputCsv) {
      await Cli.#checkFile(join(this.#options.outputCsv, 'urls.csv'));
      await Cli.#checkFile(join(this.#options.outputCsv, 'inlinks.csv'));
      await Cli.#checkFile(join(this.#options.outputCsv, 'outlinks.csv'));
    } else if (typeof this.#options.outputJson === 'string') {
      await Cli.#checkFile(this.#options.outputJson);
    }
  }
}

await new Cli().run();
