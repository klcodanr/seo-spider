import Crawler from 'crawler';

/**
 * @typedef SeoSpiderOptions
 * @property {string[]} [allowedHosts]
 * @property {boolean} [debug]
 * @property {string[]} [extractHeaders]
 * @property {string[]} [extractMetaTags]
 * @property {boolean} [ignoreExternal]
 * @property {string[]} [ignoreHosts]
 * @property {string} [ignorePattern]
 * @property {string} [linkSelector]
 * @property {number} [maxConnections]
 * @property {string} [mediaLinkSelector]
 * @property {number} [rateLimit]
 * @property {string} [referer]
 * @property {string} [resourceLinkSelector]
 * @property {number} [retries]
 * @property {number} [retryTimeout]
 * @property {number} [timeout]
 * @property {string} [userAgent]
 */

/**
 * @typedef Link
 * @property {string} url
 * @property {string} type
 * @property {string} [rel]
 * @property {string} [text]
 * @property {string} [title]
 */

/**
 * @typedef UrlInfo
 * @property {string} url
 * @property {number} size
 * @property {number} statusCode
 * @property {Record<string,string>} headers
 * @property {Record<string,string>} meta
 * @property {Link[]} inLinks
 * @property {Link[]} [outLinks]
 */

export const DEFAULTS = Object.seal({
  // eslint-disable-next-line no-script-url
  DISALLOWED_PREFIXES: ['#', 'data:', 'javascript:', 'mailto'],
  LINK_SELECTOR: 'a[href]',
  MEDIA_LINK_SELECTOR: 'audio[src],embed[src],img[src],source[src],video[src]',
  RESOURCE_LINK_SELECTOR: 'head link[href],script[src]',
  EXTRACT_HEADERS: [
    'cache-control',
    'content-length',
    'content-type',
    'date',
    'etag',
    'expires',
    'last-modified',
    'pragma',
  ],
  EXTRACT_META_TAGS: [
    'description',
    'robots',
    'title',
    'viewport',
    'og:type',
    'og:title',
    'og:description',
    'og:image',
    'og:url',
    'og:site_name',
    'twitter:title',
    'twitter:description',
    'twitter:image',
    'twitter:site',
    'twitter:creator',
  ],
});

export class SeoSpider {
  #encountered = new Set();

  #hosts = [];

  #baseUrl;

  /**
   * @type {RegExp|undefined}
   */
  #ignorePattern;

  /**
   * @type {SeoSpiderOptions}
   */
  #options;

  /**
   * @type {import('./progress.js').Progress}
   */
  #progress;

  #startUrl;

  /**
   * @type {Record<string,UrlInfo>}
   */
  urls = {};

  /**
   * Construct a new SeoSpider
   * @param {string} startUrl the URL to start
   * @param {SeoSpiderOptions} options
   * @param {import('./progress.js').Progress} progress
   */
  constructor(startUrl, options, progress) {
    this.#options = options;
    this.#progress = progress;
    this.#startUrl = startUrl;
    const parsedStart = new URL(startUrl);
    this.#hosts.push(parsedStart.host);
    if (options.allowedHosts) {
      options.allowedHosts.forEach((host) => this.#hosts.push(host));
    }
    this.#baseUrl = `${parsedStart.protocol}//${parsedStart.host}`;
    if (options.ignorePattern) {
      this.#ignorePattern = new RegExp(options.ignorePattern);
    }
  }

  crawl() {
    this.#progress.start(`Starting crawl of ${this.#startUrl}`);
    const crawler = new Crawler({
      ...this.#options,
      callback: (error, res, done) => {
        if (error) {
          const info = this.getUrlInfo(res.options.uri);
          info.statusCode = 'ERROR';
          info.error = error;
          this.#progress.log(
            'ERROR',
            `Failed to handle response for: ${res.options.uri}: ${error}`,
          );
        } else {
          this.handleResponse(res, crawler);
        }
        done();
      },
      logger: this.#progress,
    });
    crawler.queue([this.#startUrl]);

    crawler.on('request', () => this.#progress.increment());
    crawler.on('schedule', (op) => {
      this.#encountered.add(op.uri);
      this.#progress.incrementTotal();
    });

    return new Promise((resolve) => {
      crawler.on('drain', () => {
        this.#progress.stop('Crawl complete!');
        resolve();
      });
    });
  }

  getUrlInfo(url) {
    if (!this.urls[url]) {
      this.urls[url] = { url, inLinks: [] };
    }
    return this.urls[url];
  }

  /**
   * Handles a link element, extracting the relevant information and queueing it up
   * for crawling if required
   *
   * @param {{el:cheerio.Element,crawler:Crawler,
   *   $:cheerio.CheerioAPI,url:string,attributes:string[],type:string,innerText:boolean}} op
   *
   * @returns {Link|undefined}
   */
  handleLink(op) {
    try {
      const { el, $ } = op;
      const additional = {};
      op.attributes.forEach((attr) => {
        if (el.attribs[attr]) {
          additional[attr] = el.attribs[attr]?.trim();
        }
      });
      if (op.innerText) {
        additional.text = $(el).text()?.trim();
      }
      const { href, src } = el.attribs;
      let link = href || src;
      if (
        !link
        || DEFAULTS.DISALLOWED_PREFIXES.find((pfx) => link.startsWith(pfx))
      ) {
        return undefined;
      }
      link = this.resolveUrl(link);
      if (this.isIgnored(link)) {
        return undefined;
      }
      const linkInfo = this.getUrlInfo(link);
      linkInfo.inLinks.push({
        ...additional,
        source: op.url,
        type: op.type,
      });
      if (!this.#encountered.has(link)) {
        op.crawler.queue(link);
      }
      return {
        ...additional,
        target: link,
        type: op.type,
      };
    } catch (err) {
      this.#progress.log(
        'WARN',
        `Failed extract link from element ${op.el} on ${op.url} err: ${err}`,
      );
      return undefined;
    }
  }

  /**
   * Handles any redirects found in the response
   * @param {Crawler.CrawlerRequestResponse} res
   */
  handleRedirects(res) {
    let source = res.options.uri;
    // eslint-disable-next-line no-underscore-dangle
    if (res.request._redirect?.redirectsFollowed > 0) {
      // eslint-disable-next-line no-underscore-dangle
      for (const redirect of res.request._redirect?.redirects || []) {
        const sourceInfo = this.getUrlInfo(source);
        const { redirectUri, statusCode } = redirect;
        sourceInfo.statusCode = statusCode;
        sourceInfo.headers = { Location: redirectUri };
        sourceInfo.outLinks = [
          {
            url: redirectUri,
            type: 'redirect',
          },
        ];
        const targetInfo = this.getUrlInfo(redirectUri);
        targetInfo.inLinks.push({
          source,
          type: 'redirect',
        });
        source = redirectUri;
      }
    }
  }

  /**
   * Handles the response from the crawler
   * @param {Crawler.CrawlerRequestResponse} res
   * @param {Crawler} crawler
   */
  handleResponse(res, crawler) {
    const { statusCode, $ } = res;
    const url = res.request.uri.href;
    this.#progress.log('info', `Handling response for: ${url}`);

    this.handleRedirects(res);

    const urlInfo = this.getUrlInfo(url);
    urlInfo.statusCode = statusCode;
    urlInfo.size = parseInt(
      res.request.response.headers['content-length'] || res.body.length || 0,
      10,
    );

    if (this.shouldParseUrl(url)) {
      urlInfo.headers = this.extractHeaders(res);

      if ($) {
        urlInfo.meta = this.extractMetaTags($);
        urlInfo.outLinks = this.extractLinks($, crawler, url);

        this.extractResourceLinks($, crawler, url).forEach((rl) => urlInfo.outLinks.push(rl));
        this.extractMedia($, crawler, url).forEach((rl) => urlInfo.outLinks.push(rl));
      }
    }
  }

  /**
   * Extract all of the resource links on the page
   * @param {cheerio.CheerioAPI} $
   * @param {Crawler} crawler
   * @param {string} url
   * @returns {Link[]}
   */
  extractMedia($, crawler, url) {
    const links = [];
    $(this.#options.mediaLinkSelector || DEFAULTS.MEDIA_LINK_SELECTOR).each(
      (_idx, el) => {
        const link = this.handleLink({
          el,
          crawler,
          $,
          url,
          attributes: ['alt'],
          type: 'media',
          innerText: false,
        });
        if (link) {
          links.push(link);
        }
      },
    );
    return links;
  }

  /**
   * Extracts the headers from the response
   * @param {Crawler.CrawlerRequestResponse} res
   * @returns {Record<string,string>}
   */
  extractHeaders(res) {
    // eslint-disable-next-line no-param-reassign
    return Object.fromEntries(
      (this.#options.extractHeaders || DEFAULTS.EXTRACT_HEADERS).map(
        (header) => {
          const headerValue = res.request.response.headers[header];
          return [header, headerValue];
        },
      ),
    );
  }

  /**
   * Extract all of the links on the page
   * @param {cheerio.CheerioAPI} $
   * @param {Crawler} crawler
   * @param {string} url
   * @returns {Link[]}
   */
  extractLinks($, crawler, url) {
    const links = [];
    $(this.#options.linkSelector || DEFAULTS.LINK_SELECTOR).each((_idx, el) => {
      const link = this.handleLink({
        el,
        crawler,
        $,
        url,
        attributes: ['title'],
        type: 'resource',
        innerText: true,
      });
      if (link) {
        links.push(link);
      }
    });
    return links;
  }

  /**
   * Extracts the meta tags from the head of the page
   * @param {cheerio.CheerioAPI} $
   * @returns {Record<string,string>}
   */
  extractMetaTags($) {
    return Object.fromEntries(
      (this.#options.extractMetaTags || DEFAULTS.EXTRACT_META_TAGS).map(
        (meta) => {
          let value = $(`head meta[name="${meta}"]`)?.attr('content');
          if (!meta.includes(':') && !value) {
            value = $($(`head ${meta}`))?.text();
          }
          return [meta, value];
        },
      ),
    );
  }

  /**
   * Extract all of the resource links on the page
   * @param {cheerio.CheerioAPI} $
   * @param {Crawler} crawler
   * @param {string} url
   * @returns {Link[]}
   */
  extractResourceLinks($, crawler, url) {
    const links = [];
    $(
      this.#options.resourceLinkSelector || DEFAULTS.RESOURCE_LINK_SELECTOR,
    ).each((_idx, el) => {
      const link = this.handleLink({
        el,
        crawler,
        $,
        url,
        attributes: [],
        type: 'resource',
        innerText: false,
      });
      if (link) {
        links.push(link);
      }
    });
    return links;
  }

  /**
   * Returns true if the link should be ignore
   * @param {string} href
   * @returns {boolean}
   */
  isIgnored(href) {
    const { host } = new URL(href);
    if (this.#options.ignoreExternal && !this.#hosts.includes(host)) {
      return true;
    }
    if (this.#options.ignoreHosts) {
      return this.#options.ignoreHosts.includes(host);
    }

    if (this.#ignorePattern) {
      return this.#ignorePattern.test(href);
    }
    return false;
  }

  resolveUrl(uri) {
    if (uri.startsWith('//')) {
      return new URL(`${new URL(this.#baseUrl).protocol}${uri}`).href;
    } else if (!uri.startsWith('http')) {
      return new URL(uri, this.#baseUrl).href;
    }
    return new URL(uri).href;
  }

  /**
   * Returns true if the URL has an allowed host
   * @param {string} url
   * @returns {boolean}
   */
  shouldParseUrl(url) {
    const { host } = new URL(url);
    return this.#hosts.includes(host);
  }
}
