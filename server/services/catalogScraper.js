/**
 * @file catalogScraper.js
 * @description Scrapes SBU Bulletin (Fall 2025) course catalog by using a hybrid
 * approach: Puppeteer for the search index, and batched parallel
 * axios/cheerio for the detail pages.
 * @version 11.0 (Prefix Trimming Fix)
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import axios from 'axios';
import * as cheerio from 'cheerio'; // Use namespace import

puppeteer.use(StealthPlugin());

/**
 * Parses the raw HTML of a course detail page.
 * @param {string} html - The raw HTML content.
 * @returns {Object} The extracted course details.
 */
function parseCourseDetails(html) {
  const $ = cheerio.load(html);

  const titleEl = $('h1#course_preview_title');
  const title = titleEl.text().trim().replace(/&nbsp;|\u00A0/g, ' ').replace(/\s+/g, ' ').replace(' - ', ' - ');

  const contentBlock = $('td.block_content');
  if (!contentBlock.length) {
    return { title, description: 'Content block not found', credits: '', prereq: '', sbc: '' };
  }

  contentBlock.find('br').replaceWith('||BR||');
  const allText = contentBlock.text();
  const lines = allText.split('||BR||').map((line) => line.trim().replace(/\s+/g, ' ')).filter(Boolean);

  const credits = lines.find((line) => line.match(/^\d+\s+credits?/)) || '';

  // --- MODIFIED LINES ---
  // Find the line, then replace the prefix and trim whitespace.
  const prereq = (lines.find((line) => line.toLowerCase().startsWith('prerequisite')) || '')
                       .replace(/Prerequisite\(s\):\s*/i, '')
                       .trim();

  const sbc = (lines.find((line) => line.toLowerCase().includes('sbc:')) || '')
                   .replace(/SBC:\s*/i, '')
                   .trim();
  // --- END OF FIX ---

  const description = lines.find((line) => (
    line.length > 20
    && !line.match(/^\d+\s+credits?/)
    && !line.toLowerCase().startsWith('prerequisite')
    && !line.toLowerCase().includes('sbc:')
    && !line.toLowerCase().startsWith('anti-requisite:')
    && !line.toLowerCase().startsWith('dec:')
    && !line.startsWith(title)
  )) || '';

  return {
    title,
    description,
    credits,
    prereq,
    sbc,
  };
}


/**
 * Scrapes the SBU catalog for given subjects using the high-speed hybrid method.
 * @param {string} term - Academic term (e.g., "Fall2025").
 * @param {string[]} subjects - Array of subject codes (e.g., ["CSE", "AMS"]).
 * @returns {Promise<Object[]>} Array of course data grouped by subject.
 */
export async function scrapeCatalog(term, subjects) {
  if (!Array.isArray(subjects) || subjects.length === 0) {
    throw new Error("scrapeCatalog: 'subjects' must be a non-empty array.");
  }

  console.log(`[Scraper] Starting catalog scrape for ${term} → ${subjects.join(', ')}`);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const baseCatalog = 'https://catalog.stonybrook.edu';
  const results = [];

  try {
    for (const subject of subjects) {
      const searchUrl = `${baseCatalog}/search_advanced.php?cur_cat_oid=7&search_database=Search&search_db=Search&cpage=1&ecpage=1&ppage=1&spage=1&tpage=1&location=3&filter%5Bkeyword%5D=${subject}&filter%5Bexact_match%5D=1`;

      console.log(`[Scraper] Navigating to search results for ${subject}`);
      const searchPage = await browser.newPage();
      await searchPage.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

      const coursesOnPage = await searchPage.evaluate(() => Array.from(document.querySelectorAll('a[href*="preview_course"]'))
        .map((a) => ({
          href: a.getAttribute('href'),
          text: a.textContent.trim(),
        }))
        .filter((c) => /[A-Z]{2,4}\s*\d+/.test(c.text)));

      console.log(`[Scraper] Extracted ${coursesOnPage.length} course links for ${subject}`);
      await searchPage.close();

      const courseDetails = [];
      const batchSize = 10;
      console.log(`[Scraper] Fetching ${coursesOnPage.length} pages in ${Math.ceil(coursesOnPage.length / batchSize)} batches...`);

      for (let i = 0; i < coursesOnPage.length; i += batchSize) {
        const batch = coursesOnPage.slice(i, i + batchSize);
        console.log(`[Scraper] Processing batch ${Math.floor(i / batchSize) + 1}...`);

        const requestPromises = batch.map((course) => {
          const cleanedHref = course.href.replace(/&amp;/g, '&');
          const fullUrl = cleanedHref.startsWith('http') ? cleanedHref : `${baseCatalog}/${cleanedHref}`;
          const coid = fullUrl.match(/coid=(\d+)/)?.[1] || 'unknown';

          const options = {
            headers: {
              'Referer': searchUrl,
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            },
            timeout: 10000,
          };

          return axios.get(fullUrl, options).then((response) => ({
            status: 'fulfilled',
            coid,
            url: fullUrl,
            html: response.data,
          }));
        });

        const responses = await Promise.allSettled(requestPromises);

        for (const response of responses) {
          if (response.status === 'fulfilled') {
            try {
              const { coid, url, html } = response.value;
              const details = parseCourseDetails(html);
              courseDetails.push({ coid, url, ...details });
            } catch (e) {
              console.error(`[Scraper] ✗ Failed to parse coid=${response.value.coid}: ${e.message}`);
            }
          } else {
            const failedUrl = response.reason.config?.url || 'Unknown URL';
            console.error(`[Scraper] ✗ Failed to fetch ${failedUrl}: ${response.reason.message}`);
          }
        }
      }

      results.push({
        subject,
        count: courseDetails.length,
        courses: courseDetails,
      });
    }
  } catch (err) {
    console.error(`[Scraper] Fatal error: ${err.message}`);
  } finally {
    await browser.close();
  }

  console.log(`[Scraper] Completed scrape for ${subjects.join(', ')}`);
  return results;
}
