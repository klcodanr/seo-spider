import cliProgress from 'cli-progress';

export class Progress {
  #debug;

  #progressBar;

  #total = 0;

  /**
   *
   * @param {import("./seo-crawler").SeoCrawlerOptions} options
   */
  constructor(options) {
    this.#debug = options.debug;

    this.#progressBar = new cliProgress.SingleBar({
      format:
        'Crawling | {bar} | {percentage}% || {value}/{total} URLs || {message}',
    });
  }

  increment() {
    if (!this.#debug) {
      this.#progressBar.increment(1);
    }
  }

  incrementTotal() {
    this.#total += 1;
    if (!this.#debug) {
      this.#progressBar.setTotal(this.#total);
    }
  }

  /**
   *
   * @param {string} level
   * @param {any} args
   */
  log(level, args) {
    if (level === 'debug' && !this.#debug) {
      return;
    }
    let formatted = args;
    if (args.join) {
      formatted = args.join(' ');
    }
    if (!this.#debug) {
      this.#progressBar.update({
        message: `[${level}] ${formatted}`,
      });
    } else {
      process.stderr.write(`[${level}] ${formatted}\n`);
    }
  }

  /**
   * @param {string} initialMessage
   */
  start(initialMessage) {
    if (!this.#debug) {
      this.#progressBar.start(1, 0, { message: initialMessage });
    }
  }

  /**
   * @param {string} completionMessage
   */
  stop(completionMessage) {
    if (!this.#debug) {
      this.#progressBar.update({
        message: completionMessage,
      });
      this.#progressBar.stop();
    }
  }
}
