/**
 * @file catalogScraper.js
 * @description This service is responsible for scraping the SBU Bulletin's online course catalog.
 * It uses Puppeteer for browser automation and Cheerio for HTML parsing to extract detailed
 * course information, adhering to specific project requirements like prerequisite simplification.
 * @requires puppeteer-extra - A wrapper around Puppeteer that allows for plugins.
 * @requires puppeteer-extra-plugin-stealth - A plugin for puppeteer-extra to avoid detection.
 * @requires axios - Promise based HTTP client for the browser and node.js.
 * @requires cheerio - Fast, flexible, and lean implementation of core jQuery specifically designed for the server.
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import axios from 'axios';
import * as cheerio from 'cheerio';

// Apply the stealth plugin to Puppeteer to reduce the chances of being detected as a bot.
puppeteer.use(StealthPlugin());

/**
 * Parses the raw HTML content of a single course detail page from the SBU Bulletin.
 * It extracts various course attributes such as title, description, credits, prerequisites,
 * corequisites, anti-requisites, advisory prerequisites, SBC designations, and generates
 * a ClassieEvals URL. It also includes specific logic for simplifying placement exam prerequisites.
 *
 * @param {string} html - The raw HTML content of the course detail page.
 * @returns {object} An object containing the extracted and formatted course details.
 * @property {string} title - The full title of the course (e.g., "CSE 101 - Introduction to Computers").
 * @property {string} description - A concise description of the course.
 * @property {string} credits - The credit information for the course.
 * @property {string} prereq - Prerequisites for the course, with placement exams simplified.
 * @property {string} coreq - Corequisites for the course.
 * @property {string} anti_req - Anti-requisites for the course.
 * @property {string} advisory_prereq - Advisory prerequisites for the course.
 * @property {string} sbc - SBC (Stony Brook Curriculum) designations satisfied by the course.
 * @property {string} classieEvalsUrl - A URL linking to ClassieEvals for the course.
 */
function parseCourseDetails(html) {
  const $ = cheerio.load(html);

  // Extract course title from h1 or h3 elements
  const titleEl = $('h1#course_preview_title, div > h3').first();
  const title = titleEl
    .text()
    .trim()
    .replace(/&nbsp;|\u00A0/g, ' ') // Replace non-breaking spaces
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .replace(' - ', ' - '); // Standardize dash

  const container = titleEl.parent();
  if (!container.length) {
    console.warn(`[Parser] Content container not found for title: ${title}`);
    return { title, description: 'Content container not found' };
  }

  // Extract description, which typically follows an <hr> tag
  const hr = titleEl.nextAll('hr').first();
  let description = '';
  let current = hr[0]?.nextSibling;
  while (current && current.tagName !== 'strong') { // Description ends before the next strong tag (labels)
    description += $(current).text();
    current = current.nextSibling;
  }
  description = description.trim().replace(/\s+/g, ' ');

  /**
   * Helper function to extract text value following a specific strong-tag label.
   * It stops collecting text when another strong tag or a known keyword is encountered.
   *
   * @param {Cheerio} strongEl - The cheerio-wrapped strong element (e.g., "Prerequisite(s):").
   * @returns {string} The extracted text value associated with the label.
   */
  function getValueForLabel(strongEl) {
    let text = '';
    let currentNode = strongEl[0]?.nextSibling;
    const stopKeywords = [
      'prerequisite(s):', 'corequisite(s):', 'anti-requisite:',
      'advisory preq:', 'sbc:', 'credit', // Added 'credit' to stop at credit info
    ];

    while (currentNode) {
      const nodeText = $(currentNode).text().trim();
      const nodeTextLower = nodeText.toLowerCase();
      // Stop if another strong tag (new label) or a known keyword is found
      if (
        currentNode.tagName === 'strong' ||
        stopKeywords.some((key) => nodeTextLower.startsWith(key))
      ) {
        break;
      }
      text += ` ${nodeText}`;
      currentNode = currentNode.nextSibling;
    }
    return text.replace(':', '').trim().replace(/\s+/g, ' ');
  }

  let credits = '';
  let prereq = '';
  let coreq = '';
  let antiReq = '';
  let advisoryPrereq = '';
  let sbc = '';

  // Iterate through all strong tags to find labeled information
  container.find('strong').each((i, el) => {
    const strongEl = $(el);
    const label = strongEl.text().toLowerCase();

    if (label.includes('credit')) {
      credits = strongEl.text().trim();
    } else if (label.includes('prerequisite(s)')) {
      prereq = getValueForLabel(strongEl);
    } else if (label.includes('corequisite(s)')) {
      coreq = getValueForLabel(strongEl);
    } else if (label.includes('anti-requisite')) {
      antiReq = getValueForLabel(strongEl);
    } else if (label.includes('advisory preq')) {
      advisoryPrereq = getValueForLabel(strongEl);
    } else if (label.includes('sbc:')) {
      // SBC can sometimes be directly in the strong tag or follow it
      sbc =
        strongEl.text().replace(/SBC:\s*/i, '').trim() ||
        getValueForLabel(strongEl);
    }
  });

  // Requirement 3.1: Simplify prerequisites involving placement exams.
  const placementText = 'on the mathematics placement examination';
  if (
    prereq.toLowerCase().includes(placementText) &&
    (prereq.includes('MAT') || prereq.includes('AMS'))
  ) {
    // Split the string at the placement exam part and take everything before it.
    // This regex attempts to find "or Level X+" and remove it and subsequent text.
    const simplifiedPrereq = prereq.split(/or level \d\+? /i)[0].trim();
    console.warn(
      `[Parser] WARNING: Simplified placement exam prerequisite for '${title}'. Original: "${prereq}". Simplified: "${simplifiedPrereq}".`
    );
    prereq = simplifiedPrereq;
  }

  // Generate ClassieEvals URL
  const courseCodeMatch = title.match(/^([A-Z]{2,4})\s*(\d{3})/);
  let classieEvalsUrl = '';
  if (courseCodeMatch) {
    const subject = courseCodeMatch[1];
    const number = courseCodeMatch[2];
    classieEvalsUrl = `https://classie-evals.stonybrook.edu/?SearchKeyword=${subject}${number}&SearchTerm=ALL`;
  }

  return {
    title,
    description,
    credits,
    prereq,
    coreq,
    anti_req: antiReq,
    advisory_prereq: advisoryPrereq,
    sbc,
    classieEvalsUrl,
  };
}

/**
 * Scrapes the SBU course catalog for specified subjects and term.
 * It navigates to the subject's index page, extracts all course links, and then
 * fetches and parses each course detail page in batches to improve efficiency.
 * Uses Puppeteer for initial navigation and Axios/Cheerio for detail page fetching/parsing.
 *
 * @param {string} term - The academic term for which to scrape the catalog (e.g., "Fall2025").
 * @param {string[]} subjects - An array of subject codes (e.g., ["CSE", "AMS"]) to scrape.
 * @returns {Promise<Array<object>>} A promise that resolves to an array of objects,
 *   each representing a subject and containing its scraped courses.
 * @throws {Error} If the `subjects` parameter is not a non-empty array.
 */
export async function scrapeCatalog(term, subjects) {
  if (!Array.isArray(subjects) || subjects.length === 0) {
    throw new Error("scrapeCatalog: 'subjects' must be a non-empty array.");
  }

  console.log(
    `[Scraper] Starting catalog scrape for term '${term}' and subjects: ${subjects.join(', ')}`
  );

  // Launch a headless browser instance using Puppeteer
  const browser = await puppeteer.launch({
    headless: 'new', // Use the new headless mode
    args: ['--no-sandbox', '--disable-setuid-sandbox'], // Recommended for CI/CD environments
  });

  const baseCatalog = 'https://catalog.stonybrook.edu';
  const results = [];

  try {
    for (const subject of subjects) {
      // Construct the URL for the subject's course listing page
      const indexUrl = `${baseCatalog}/content.php?filter%5B27%5D=${subject}&filter%5B29%5D=&filter%5Bkeyword%5D=&filter%5B32%5D=1&filter%5Bcpage%5D=1&cur_cat_oid=7&expand=&navoid=225&search_database=Filter&filter%5Bexact_match%5D=1#acalog_template_course_filter`;

      console.log(`[Scraper] Navigating to index page for subject: ${subject}`);
      const searchPage = await browser.newPage();
      await searchPage.goto(indexUrl, {
        waitUntil: 'domcontentloaded', // Wait until the initial HTML document has been completely loaded and parsed
        timeout: 60000, // 60 seconds timeout for navigation
      });

      // Extract all course detail links from the subject's listing page
      const coursesOnPage = await searchPage.evaluate(() =>
        Array.from(document.querySelectorAll('a[href*="preview_course"]'))
          .map((a) => ({
            href: a.getAttribute('href'),
            text: a.textContent.trim(),
          }))
          .filter((c) => /[A-Z]{2,4}\s*\d+/.test(c.text)) // Filter for valid course codes
      );

      console.log(
        `[Scraper] Extracted ${coursesOnPage.length} course links for subject: ${subject}`
      );
      await searchPage.close(); // Close the search page to save resources

      const courseDetails = [];
      const batchSize = 10; // Process course detail pages in batches to manage concurrency and avoid overwhelming the server
      console.log(
        `[Scraper] Fetching ${coursesOnPage.length} course detail pages in ${Math.ceil(
          coursesOnPage.length / batchSize
        )} batches for subject: ${subject}...`
      );

      // Process course links in batches
      for (let i = 0; i < coursesOnPage.length; i += batchSize) {
        const batch = coursesOnPage.slice(i, i + batchSize);
        console.log(
          `[Scraper] Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(coursesOnPage.length / batchSize)}...`
        );

        // Create an array of promises for fetching each course detail page in the current batch
        const requestPromises = batch.map((course) => {
          const cleanedHref = course.href.replace(/&amp;/g, '&'); // Decode HTML entities in URL
          const fullUrl = cleanedHref.startsWith('http')
            ? cleanedHref
            : `${baseCatalog}/${cleanedHref}`; // Construct full URL if relative
          const coid = fullUrl.match(/coid=(\d+)/)?.[1] || 'unknown'; // Extract Course ID

          const options = {
            headers: {
              Referer: indexUrl, // Set Referer header to mimic a real browser navigation
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36', // Standard User-Agent
            },
            timeout: 10000, // 10 seconds timeout for each HTTP request
          };

          // Use axios to fetch the HTML content of the course detail page
          return axios.get(fullUrl, options).then((response) => ({
            status: 'fulfilled',
            coid,
            url: fullUrl,
            html: response.data,
          }));
        });

        // Wait for all requests in the current batch to settle (either fulfilled or rejected)
        const responses = await Promise.allSettled(requestPromises);

        // Process the results of the batch
        for (const response of responses) {
          if (response.status === 'fulfilled') {
            try {
              const { coid, url, html } = response.value;
              const details = parseCourseDetails(html); // Parse the HTML to extract course details
              courseDetails.push({ coid, url, ...details });
            } catch (e) {
              console.error(
                `[Scraper] ✗ Failed to parse course details for coid=${response.value.coid} (URL: ${response.value.url}): ${e.message}`
              );
            }
          } else {
            const failedUrl = response.reason.config?.url || 'Unknown URL';
            console.error(
              `[Scraper] ✗ Failed to fetch course details from ${failedUrl}: ${response.reason.message}`
            );
          }
        }
      }

      // Aggregate results for the current subject
      results.push({
        subject,
        count: courseDetails.length,
        courses: courseDetails,
      });
    }
  } catch (err) {
    console.error(`[Scraper] Fatal error during scraping process: ${err.message}`);
    throw err; // Re-throw to be caught by the route handler
  } finally {
    await browser.close(); // Ensure the browser instance is closed
  }

  console.log(`[Scraper] Completed scrape for subjects: ${subjects.join(', ')}`);
  return results;
}
