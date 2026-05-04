const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({headless: 'new'});
  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));
  await page.goto('http://localhost:5173');
  await new Promise(r => setTimeout(r, 2000));
  
  const mazot = await page.$x("//button[contains(., 'Mazot Fişleri')]");
  if (mazot.length > 0) {
      await mazot[0].click();
      await new Promise(r => setTimeout(r, 1000));
  }
  
  const btn = await page.$x("//button[contains(., 'Yeni Fiş')]");
  if (btn.length > 0) {
      await btn[0].click();
      console.log('Clicked Yeni Fiş');
      await new Promise(r => setTimeout(r, 1000));
  } else {
      console.log('Button not found');
  }
  
  await browser.close();
})();
