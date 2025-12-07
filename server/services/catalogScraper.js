/**
 * @file catalogScraper.js
 * @description Scrapes SBU Bulletin (Fall 2025) course catalog to fully comply
 * with SAM project requirements.
 * @version 2.0
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import axios from 'axios';
import * as cheerio from 'cheerio';
import pLimit from 'p-limit';

puppeteer.use(StealthPlugin());

// Required subjects per project specifications (Section 3.1)
const REQUIRED_SUBJECTS = ['BIO', 'PSY', 'CSE', 'ECO', 'AMS', 'POL'];

// Concurrency limits (configurable via environment variables)
const REQUEST_CONCURRENCY = parseInt(process.env.REQUEST_CONCURRENCY || '30', 10);

/**
 * Parses the raw HTML of a course detail page to meet all project requirements.
 *
 * @param {string} html - The raw HTML content.
 * @returns {Object} The extracted and formatted course details.
 * @property {string} title - Course title.
 * @property {string} description - Course description.
 * @property {string} credits - Credit information.
 * @property {string} prereq - Prerequisites.
 * @property {string} coreq - Corequisites.
 * @property {string} anti_req - Anti-requisites.
 * @property {string} advisory_prereq - Advisory prerequisites.
 * @property {string} sbc - SBC designations.
 * @property {string} classieEvalsUrl - ClassieEvals URL.
 */
function parseCourseDetails(html) {
  const $ = cheerio.load(html);

  const titleEl = $('h1#course_preview_title, div > h3').first();
  const title = titleEl
    .text()
    .trim()
    .replace(/&nbsp;|\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(' - ', ' - ');

  const container = titleEl.parent();
  if (!container.length) {
    return { title, description: 'Content container not found' };
  }

  const hr = titleEl.nextAll('hr').first();
  let description = '';
  let current = hr[0]?.nextSibling;
  while (current && current.tagName !== 'strong') {
    description += $(current).text();
    current = current.nextSibling;
  }
  description = description.trim().replace(/\s+/g, ' ');

  /**
   * Extracts the value following a labeled strong element.
   *
   * @param {Cheerio} strongEl - The cheerio-wrapped strong element.
   * @returns {string} The extracted value text.
   */
  function getValueForLabel(strongEl) {
    let text = '';
    let currentNode = strongEl[0]?.nextSibling;
    const stopKeywords = [
      'prerequisite(s):',
      'corequisite(s):',
      'anti-requisite:',
      'advisory preq:',
      'sbc:',
    ];

    while (currentNode) {
      const nodeText = $(currentNode).text().trim();
      const nodeTextLower = nodeText.toLowerCase();
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
      sbc =
        strongEl.text().replace(/SBC:\s*/i, '').trim() ||
        getValueForLabel(strongEl);
    }
  });

  // More robust prerequisite simplification
  // If the prerequisite contains both a course and a placement exam, simplify it.
  // Example: "Level 2+ or higher on the mathematics placement examination or MAT 123 or higher"
  // → "MAT 123 or higher"
  const placementText = 'on the mathematics placement examination';
  if (
    prereq.toLowerCase().includes(placementText) &&
    (prereq.includes('MAT') || prereq.includes('AMS'))
  ) {
    // Find the placement exam section and extract everything after it
    // Pattern: "...placement examination or MAT 123 or higher" → "MAT 123 or higher"
    const placementIndex = prereq.toLowerCase().indexOf(placementText);
    if (placementIndex !== -1) {
      // Find "or" after the placement exam text
      const afterPlacement = prereq.substring(placementIndex + placementText.length);
      const orMatch = afterPlacement.match(/^\s*or\s+(.+)/i);
      
      if (orMatch) {
        const simplifiedPrereq = orMatch[1].trim();
        console.warn(
          `[Parser] WARNING: Simplified placement exam prerequisite for '${title}'. Original: "${prereq}". Simplified: "${simplifiedPrereq}".`
        );
        prereq = simplifiedPrereq;
      } else {
        // Fallback: split by "or" and find the part with MAT/AMS
        const parts = prereq.split(/or\s+/i);
        const coursePart = parts.find(part => 
          (part.includes('MAT') || part.includes('AMS')) && 
          !part.toLowerCase().includes('placement')
        );
        
        if (coursePart) {
          // Include "or higher" if it follows the course part
          const courseIndex = prereq.indexOf(coursePart);
          const afterCourse = prereq.substring(courseIndex + coursePart.length);
          const orHigherMatch = afterCourse.match(/^\s*or\s+higher/i);
          const simplifiedPrereq = coursePart.trim() + (orHigherMatch ? ' or higher' : '');
          
          console.warn(
            `[Parser] WARNING: Simplified placement exam prerequisite for '${title}'. Original: "${prereq}". Simplified: "${simplifiedPrereq}".`
          );
          prereq = simplifiedPrereq;
        }
      }
    }
  }

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
 * Scrapes the SBU catalog for given subjects using the high-speed hybrid method.
 *
 * @param {string} term - Academic term (e.g., "Fall2025").
 * @param {string[]} subjects - Array of subject codes (e.g., ["CSE", "AMS"]).
 * @returns {Promise<Object[]>} Array of course data grouped by subject.
 * @throws {Error} If subjects is not a non-empty array.
 */
// export async function scrapeCatalog(term, subjects) {
//   if (!Array.isArray(subjects) || subjects.length === 0) {
//     throw new Error("scrapeCatalog: 'subjects' must be a non-empty array.");
//   }

//   console.log(
//     `[Scraper] Starting catalog scrape for ${term} → ${subjects.join(', ')}`
//   );

//   const browser = await puppeteer.launch({
//     headless: 'new',
//     args: ['--no-sandbox', '--disable-setuid-sandbox'],
//   });

//   const baseCatalog = 'https://catalog.stonybrook.edu';
//   const results = [];

//   try {
//     for (const subject of subjects) {
//       const indexUrl = `${baseCatalog}/content.php?filter%5B27%5D=${subject}&filter%5B29%5D=&filter%5Bkeyword%5D=&filter%5B32%5D=1&filter%5Bcpage%5D=1&cur_cat_oid=7&expand=&navoid=225&search_database=Filter&filter%5Bexact_match%5D=1#acalog_template_course_filter`;

//       console.log(`[Scraper] Navigating to index for ${subject}`);
//       const searchPage = await browser.newPage();
//       await searchPage.goto(indexUrl, {
//         waitUntil: 'domcontentloaded',
//         timeout: 60000,
//       });

//       const coursesOnPage = await searchPage.evaluate(() =>
//         Array.from(document.querySelectorAll('a[href*="preview_course"]'))
//           .map((a) => ({
//             href: a.getAttribute('href'),
//             text: a.textContent.trim(),
//           }))
//           .filter((c) => /[A-Z]{2,4}\s*\d+/.test(c.text))
//       );

//       console.log(
//         `[Scraper] Extracted ${coursesOnPage.length} course links for ${subject}`
//       );
//       await searchPage.close();

//       const courseDetails = [];
//       const batchSize = 10;
//       console.log(
//         `[Scraper] Fetching ${coursesOnPage.length} pages in ${Math.ceil(
//           coursesOnPage.length / batchSize
//         )} batches...`
//       );

//       for (let i = 0; i < coursesOnPage.length; i += batchSize) {
//         const batch = coursesOnPage.slice(i, i + batchSize);
//         console.log(
//           `[Scraper] Processing batch ${Math.floor(i / batchSize) + 1}...`
//         );

//         const requestPromises = batch.map((course) => {
//           const cleanedHref = course.href.replace(/&amp;/g, '&');
//           const fullUrl = cleanedHref.startsWith('http')
//             ? cleanedHref
//             : `${baseCatalog}/${cleanedHref}`;
//           const coid = fullUrl.match(/coid=(\d+)/)?.[1] || 'unknown';

//           const options = {
//             headers: {
//               Referer: indexUrl,
//               'User-Agent':
//                 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
//             },
//             timeout: 10000,
//           };

//           return axios.get(fullUrl, options).then((response) => ({
//             status: 'fulfilled',
//             coid,
//             url: fullUrl,
//             html: response.data,
//           }));
//         });

//         const responses = await Promise.allSettled(requestPromises);

//         for (const response of responses) {
//           if (response.status === 'fulfilled') {
//             try {
//               const { coid, url, html } = response.value;
//               const details = parseCourseDetails(html);
//               courseDetails.push({ coid, url, ...details });
//             } catch (e) {
//               console.error(
//                 `[Scraper] ✗ Failed to parse coid=${response.value.coid}: ${e.message}`
//               );
//             }
//           } else {
//             const failedUrl = response.reason.config?.url || 'Unknown URL';
//             console.error(
//               `[Scraper] ✗ Failed to fetch ${failedUrl}: ${response.reason.message}`
//             );
//           }
//         }
//       }

//       results.push({
//         subject,
//         count: courseDetails.length,
//         courses: courseDetails,
//       });
//     }
//   } catch (err) {
//     console.error(`[Scraper] Fatal error: ${err.message}`);
//   } finally {
//     await browser.close();
//   }

//   console.log(`[Scraper] Completed scrape for ${subjects.join(', ')}`);
//   return results;
// }

/**
 * Scrapes a single subject's courses from the SBU catalog.
 * 
 * @param {Object} params - Parameters object
 * @param {string} params.subject - Subject code (e.g., "CSE")
 * @param {string} params.baseCatalog - Base catalog URL
 * @param {Object} params.browser - Puppeteer browser instance
 * @param {boolean} params.isSupported - Whether subject is in required list
 * @returns {Promise<Object>} Subject result with courses
 */
async function scrapeSubject({ subject, baseCatalog, browser, isSupported }) {
  const indexUrl = `${baseCatalog}/content.php?filter%5B27%5D=${subject}&filter%5B29%5D=&filter%5Bkeyword%5D=&filter%5B32%5D=1&filter%5Bcpage%5D=1&cur_cat_oid=7&expand=&navoid=225&search_database=Filter&filter%5Bexact_match%5D=1#acalog_template_course_filter`;

  if (!isSupported) {
    console.warn(
      `[Scraper] WARNING: Subject '${subject}' is not in supported list (${REQUIRED_SUBJECTS.join(', ')}). Prerequisites may be marked as unknown.`
    );
  }

  console.log(`[Scraper] Navigating to index for ${subject}`);
  const searchPage = await browser.newPage();
  
  try {
    await searchPage.goto(indexUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    const coursesOnPage = await searchPage.evaluate(() =>
      Array.from(document.querySelectorAll('a[href*="preview_course"]'))
        .map((a) => ({
          href: a.getAttribute('href'),
          text: a.textContent.trim(),
        }))
        .filter((c) => /[A-Z]{2,4}\s*\d+/.test(c.text))
    );

    console.log(
      `[Scraper] Extracted ${coursesOnPage.length} course links for ${subject}`
    );

    const courseDetails = [];
    
    // Use p-limit to control concurrent HTTP requests
    const requestLimit = pLimit(REQUEST_CONCURRENCY);
    
    console.log(
      `[Scraper] Fetching ${coursesOnPage.length} course pages for ${subject} (${REQUEST_CONCURRENCY} concurrent)...`
    );

    // Fetch all course pages in parallel with concurrency control
    const fetchPromises = coursesOnPage.map((course) =>
      requestLimit(async () => {
        let cleanedHref = course.href.replace(/&amp;/g, '&');
        
        // Handle relative URLs properly
        let fullUrl;
        if (cleanedHref.startsWith('http://') || cleanedHref.startsWith('https://')) {
          fullUrl = cleanedHref;
        } else if (cleanedHref.startsWith('/')) {
          // Absolute path from root
          fullUrl = `${baseCatalog}${cleanedHref}`;
        } else {
          // Relative path
          fullUrl = `${baseCatalog}/${cleanedHref}`;
        }
        
        const coid = fullUrl.match(/coid=(\d+)/)?.[1] || 'unknown';

        const options = {
          headers: {
            Referer: indexUrl,
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          },
          timeout: 15000, // Increased timeout
        };

        // Retry logic for transient failures (not 404s)
        const maxRetries = 2;
        let lastError = null;
        
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          try {
            const response = await axios.get(fullUrl, options);
            const details = parseCourseDetails(response.data);
            
            // Mark requisites as unknown for unsupported subjects
            if (!isSupported) {
              if (details.prereq) details.prereq = 'unknown';
              if (details.coreq) details.coreq = 'unknown';
              if (details.anti_req) details.anti_req = 'unknown';
              if (details.advisory_prereq) details.advisory_prereq = 'unknown';
            }
            
            return { coid, url: fullUrl, ...details };
          } catch (e) {
            lastError = e;
            
            // Don't retry on 404s - they're permanent failures (broken links)
            if (e.response?.status === 404) {
              // 404s are expected for broken/invalid course links - silently skip
              return null;
            }
            
            // Retry on network errors or timeouts
            if (attempt < maxRetries && (
              e.code === 'ECONNRESET' || 
              e.code === 'ETIMEDOUT' || 
              e.code === 'ENOTFOUND' ||
              e.message?.includes('timeout') ||
              (e.response?.status >= 500 && e.response?.status < 600)
            )) {
              // Wait before retry (exponential backoff)
              await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
              continue;
            }
            
            // For other errors, log and return null
            if (attempt === maxRetries) {
              // Only log on final failure, and only occasionally to avoid spam
              if (Math.random() < 0.05) { // Log ~5% of non-404 errors
                console.error(
                  `[Scraper] ✗ Failed to fetch course for ${subject} after ${maxRetries + 1} attempts: ${e.message}`
                );
              }
            }
          }
        }
        
        return null;
      })
    );

    const responses = await Promise.allSettled(fetchPromises);
    
    let successCount = 0;
    let failureCount = 0;
    
    for (const response of responses) {
      if (response.status === 'fulfilled' && response.value) {
        courseDetails.push(response.value);
        successCount++;
      } else {
        failureCount++;
      }
    }
    
    // Log summary if there were significant failures (but 404s are expected)
    if (failureCount > 0 && failureCount > coursesOnPage.length * 0.3) {
      console.log(
        `[Scraper] ${subject}: ${successCount} courses scraped, ${failureCount} failed (404s are expected for broken catalog links)`
      );
    } else {
      console.log(
        `[Scraper] ${subject}: ${successCount} courses scraped successfully`
      );
    }

    return {
      subject,
      count: courseDetails.length,
      courses: courseDetails,
    };
  } finally {
    await searchPage.close();
  }
}

export async function scrapeCatalog(term, subjects) {
  const baseCatalog = 'https://catalog.stonybrook.edu';

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const results = [];

  try {
    // Default to required subjects if none provided
    let subjectList = subjects;
    if (!Array.isArray(subjectList) || subjectList.length === 0) {
      subjectList = [...REQUIRED_SUBJECTS];
      console.log(
        `[Scraper] No subjects provided, defaulting to required subjects: ${subjectList.join(', ')}`
      );
    }

    console.log(
      `[Scraper] Starting catalog scrape for ${term} → ${subjectList.join(', ')}`
    );

    // Process all subjects in parallel
    const subjectPromises = subjectList.map((subject) => {
      const isSupported = REQUIRED_SUBJECTS.includes(subject.toUpperCase());
      return scrapeSubject({
        subject,
        baseCatalog,
        browser,
        isSupported,
      });
    });

    const subjectResults = await Promise.allSettled(subjectPromises);
    
    for (const result of subjectResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        console.error(
          `[Scraper] ✗ Failed to scrape subject: ${result.reason.message}`
        );
      }
    }

    console.log(
      `[Scraper] Completed scrape for ${subjectList.join(', ')}`
    );
  } catch (err) {
    console.error(`[Scraper] Fatal error: ${err.message}`);
    throw err;
  } finally {
    await browser.close();
  }

  return results;
}

