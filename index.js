console.log('-----------------------------------------------------')
console.log('#')
console.log('# Meta Scraper')
console.log('# https://www.protos.red/meta-scraper')
console.log('#')
console.log('# Crawls all pages on a website and extracts META Information')
console.log('# (title, description, robots)')
console.log('#')
console.log('# Author: Protos RED - https://www.protos.red/')
console.log('# Email: admin@protos.red')
console.log('#')
console.log('-----------------------------------------------------')
console.log(' ')

const fs = require('fs');
const Listr = require('listr');
const inquirer = require('inquirer');
const { Observable } = require('rxjs');
const csv = require('./lib/csv');
const isURL = require('is-url');
const supercrawler = require('supercrawler');
const cheerio = require('cheerio');

function runCrawl(startURL, domain) {
  const date = (new Date()).toISOString().split('T').shift();
  const outputFile = `meta-${domain}_${date}.csv`;
  const tasks = new Listr([
    {
      title: 'Crawl through all pages',
      task: (ctx) => {
        ctx.data = [];

        var crawler = new supercrawler.Crawler({
          // Time (ms) between requests
          interval: 1000,
          // Maximum number of requests at any one time.
          concurrentRequestsLimit: 10,
          // Time (ms) to cache the results of robots.txt queries.
          robotsCacheTime: 3600000,
          // Query string to use during the crawl.
          userAgent: "Mozilla/5.0 (compatible; MetaCrawler/1.0; +https://github.com/protosred/meta-crawler)"
        });

        return new Observable(function(observer) {
          let i = 1;

          crawler.addHandler("text/html", supercrawler.handlers.htmlLinkParser({
            // Restrict discovered links to the following hostnames.
            hostnames: [domain],
            urlFilter: function (url) {
              return url.length < 512; // ignore long urls (prevent infinite nested scrapes)
            }
          }));

          crawler.addHandler("text/html", function (context) {
            // console.log(crawler.urlList)
            var sizeKb = Buffer.byteLength(context.body) / 1024;
            observer.next(`[${i}/${crawler._urlList._list.length}]: ${context.url}`)
            i++;

            const pageData = {
              pageURL: context.url,
              metaTitle: '',
              metaDescription: '',
              metaRobots: '',
              canonical: ''
            }

            try {
              const $ = cheerio.load(context.body);
              pageData.metaTitle = $('head title').text() || '';
              pageData.metaDescription = $('head meta[name=description]').attr('content') || '';
              pageData.metaRobots = $('head meta[name=robots]').attr('content') || '';
              pageData.canonical = $('head link[rel=canonical]').attr('href') || '';
              ctx.data.push(pageData);
            } catch(e) {
              return ctx.data.push(pageData);
            }

          });

          crawler.on('urllistcomplete', () => {
            crawler.stop();
            observer.complete();
          })

          crawler.getUrlList()
            .insertIfNotExists(new supercrawler.Url(startURL))
            .then(function () {
              return crawler.start();
            })

        });
      }
    },
    {
      title: 'Write report to file: ' + outputFile,
      task: (ctx) => {
        return csv.write(process.cwd() + '/' + outputFile, ctx.data);
      }
    }
  ]);

  return tasks.run()
}


(async function run() {
  const { websiteURL } = await inquirer.prompt({
    type: 'input',
    name: 'websiteURL',
    message: 'Enter website URL (https://www.example.com/):'
  });

  if(!isURL(websiteURL)) {
    console.log('You provided an invalid URL, please try again. URL should look like: https://www.example.com/')
    run();
    return;
  }

  const domain = websiteURL.split('/')[2].toLowerCase();

  const { continueRun } = await inquirer.prompt({
    type: 'confirm',
    default: true,
    name: 'continueRun',
    message: `Bot will now crawl all pages on ${domain} and produce a CSV report with META data for each page. Do you want to continue?`
  });

  if(!continueRun) {
    return;
  }

  await runCrawl(websiteURL, domain);

})();