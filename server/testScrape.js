import puppeteer from "puppeteer";

const term = "Fall2025";
const subjects = ["CSE", "AMS"];

for (const subj of subjects) {
  const url = `https://catalog.stonybrook.edu/search_advanced.php?cur_cat_oid=7&search_database=Search&search_db=Search&cpage=1&ecpage=1&ppage=1&spage=1&tpage=1&location=33&filter%5Bkeyword%5D=${subj}&filter%5Bexact_match%5D=1`;
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded" });

  const courses = await page.$$eval("a", els =>
    els
      .map(el => el.textContent.trim())
      .filter(t => /^CSE\s*\d+/.test(t) || /^AMS\s*\d+/.test(t))
  );

  console.log(subj, courses.slice(0, 5)); // preview
  await browser.close();
}
