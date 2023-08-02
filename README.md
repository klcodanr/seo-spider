# SEO Spider

A CLI spider for crawling websites and exporting the results as JSON or CSV files. Included functionality:

 - Extract Headers
 - Extract Meta Tags
 - Exclude internal URLs
 - Allow crawling multiple domains
 - Capture in and out links
 - Rate limiting and retries

## Installation

Install globally with:

    npm i seo-spider -g

or use with npx:

    npx seo-spider https://mysite.com

## Use


```
Usage: seo-spider [options] <startUrl>

Crawl websites and extract relevant information including metadata and in/out links

Arguments:
  startUrl                                         The start URL for the crawl

Options:
  -V, --version                                    output the version number
  -a, --allowed-hosts <allowedHosts>               The list of hosts which will be crawled. The hostname of the start URL will be added to this list
  -d, --debug                                      Enable debug logging
  -e, --extract-headers <extractHeaders>           Header names to extract from the response
  -m, --extract-meta-tags <extractMetaTags>        Meta tags to extract from the response HEAD
  -c, --max-connections <maxConnections>           The maximum number of connections, 10 by default
  --referer <referer>                              Set the referrer header on the requests
  --retry-timeout <retryTimeout>                   Set the retry timeout for the requests
  -i, --ignore-hosts <ignoreHosts>                 A comma separated list of hostnames to ignore and neither crawl nor check
  -x, --ignore-external                            Ignore all external hosts, external hosts will neither be crawled nor checked
  -p, --ignore-pattern <ignorePattern>             Ignore urls matching the specified pattern. These urls will neither be crawled nor checked
  -t, --timeout <timeout>                          timeout
  -u, --user-agent <userAgent>                     Set the user-agent header
  --link-selector <linkSelector>                   Override the link selector
  --resource-link-selector <resourceLinkSelector>  Override the resource link selector
  --media-link-selector <mediaLinkSelector>        Override the media link selector
  --output-csv <directory>                         Write the output as CSV files to the specified directory
  --output-json [type]                             Write the output a JSON file
  --config <config>                                Use a configuration JSON file
  -h, --help                                       display help for command
```

## Configuration JSON

To support reusing parameters, specify a JSON file with the `--config` option, for example: 

    npx seo-spider --config config.json http://mysite.com

The configuration JSON file must match the schema of the [SeoSpiderOptions](docs/API.md#SeoSpiderOptions)
