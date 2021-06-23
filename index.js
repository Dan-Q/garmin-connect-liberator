require('dotenv').config() // dotEnv defines Garmin Connect USERNAME, PASSWORD
const Puppeteer = require('puppeteer');
const fs = require('fs');
const moment = require('moment');
const path = require('path');
const { exec } = require('child_process');

const DATA_DIR = path.join(process.cwd(), 'data');

getData = async ( dates ) => {
  if((dates || []).length == 0) return; // no requested dates? stop right now!

  const browser = await Puppeteer.launch({headless: false, args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080']});
  const page = await browser.newPage();

  // set viewport size
  await page.setViewport({ width: 1920, height: 1080});

  // login
  await page.goto('https://sso.garmin.com/sso/signin?service=https%3A%2F%2Fconnect.garmin.com%2Fmodern%2F&webhost=https%3A%2F%2Fconnect.garmin.com%2Fmodern%2F&source=https%3A%2F%2Fconnect.garmin.com%2Fsignin%2F&redirectAfterAccountLoginUrl=https%3A%2F%2Fconnect.garmin.com%2Fmodern%2F&redirectAfterAccountCreationUrl=https%3A%2F%2Fconnect.garmin.com%2Fmodern%2F&gauthHost=https%3A%2F%2Fsso.garmin.com%2Fsso&locale=en_GB&id=gauth-widget&cssUrl=https%3A%2F%2Fconnect.garmin.com%2Fgauth-custom-v1.2-min.css&privacyStatementUrl=https%3A%2F%2Fwww.garmin.com%2Fen-GB%2Fprivacy%2Fconnect%2F&clientId=GarminConnect&rememberMeShown=true&rememberMeChecked=false&createAccountShown=true&openCreateAccount=false&displayNameShown=false&consumeServiceTicket=false&initialFocus=true&embedWidget=false&generateExtraServiceTicket=true&generateTwoExtraServiceTickets=true&generateNoServiceTicket=false&globalOptInShown=true&globalOptInChecked=false&mobile=false&connectLegalTerms=true&showTermsOfUse=false&showPrivacyPolicy=false&showConnectLegalAge=false&locationPromptShown=true&showPassword=true&useCustomHeader=false&mfaRequired=false&performMFACheck=false&rememberMyBrowserShown=true&rememberMyBrowserChecked=false#');
  await page.waitForSelector('#username');
  await page.type('#username', process.env.GARMIN_CONNECT_USERNAME);
  await page.type('#password', process.env.GARMIN_CONNECT_PASSWORD);
  await page.click('#login-btn-signin');
  await page.waitForNavigation();

  // get rid of the cookie banner so it doesn't interfere with screenshots (wait up to 3s for it to appear, otherwise assume it won't)
  await page.waitForSelector('#truste-consent-required', { timeout: 3000 }).then(async ()=>{
    await page.$eval( '#truste-consent-required', btn => btn.click() );
  }).catch(()=>{}); // do nothing if it doesn't appear

  // process each requested date
  for(const date of dates) {
    console.log(date);
    await page.goto(`https://connect.garmin.com/modern/daily-summary/${date}`, {waitUntil: 'networkidle2'});
    await page.waitForSelector('[class^="DailySummaryTimeline_timelineContainer_"]');
    await page.waitForTimeout(3000); // loading delay plus throttle

    // data from activity/cards
    console.log(` * downloading cards`);
    let dayData = await page.evaluate(()=>{
      const timelineContainer = document.querySelector('[class^="DailySummaryTimeline_timelineContainer_"]');
      return [...timelineContainer.nextSibling.querySelectorAll('[class^="Card_card_"]')].map( card => {
        // Get standard data for card
        let cardData = {
          title: card.querySelector('[class^="DailySummaryPageCardTitle_"]')?.innerText,
          icon: card.querySelector('[class^="DailySummaryPageCardTitle_"] i')?.getAttribute('class'),
          mainValue: card.querySelector('[class^="DailySummaryCardMainValue_mainValue_"]')?.innerText,
          otherValues: [...card.querySelectorAll('[class*="DailySummaryCardDataBlock_blockSpacing_"]')].map( block => {
            return {
              label: block.querySelector('[class^="DailySummaryCardDataBlock_dataLabel_"]')?.innerText,
              value: block.querySelector('[class^="DailySummaryCardDataBlock_dataValue_"]')?.innerText,
            }
          } ),
        };
        // Is this card an ACTIVITY, if so, let's fetch extra data
        const activityLink = card.querySelector('a[href^="/modern/activity"]');
        if(activityLink){
          cardData.activityId = parseInt(activityLink.getAttribute('href').match(/\d+/)[0]);
        }
        // Return card data into main day-data hash
        return cardData;
      });
    });

    // heart rate/movement/sleep/activity graph
    console.log(` * downloading graph`);
    const timelineContainer = await page.$('[class^="DailySummaryTimeline_timelineContainer_"]');
    const timelineFilename = `${date}.png`;
    await timelineContainer.screenshot({ path: path.join(DATA_DIR, timelineFilename) });

    // download GPX files for activities
    dayData.filter(card=>card.activityId).map(card=>card.activityId).forEach( async ( activityId ) => {
      console.log(` * downloading activity ${activityId} GPX`);
      const gpxURL = `https://connect.garmin.com/proxy/download-service/export/gpx/activity/${activityId}`;
      const cookies = await page.cookies();
      const cookieString = cookies.map(cookie=>`${decodeURIComponent(cookie.name)}=${decodeURIComponent(cookie.value)}`).join(';');
      const outputFile = path.join(DATA_DIR, `${date}-activity-${activityId}.gpx`);
      const cmdString = `curl -k --cookie "${cookieString}" "${gpxURL}" > "${outputFile}"`;
      exec( cmdString );
    });

    // write output JSON
    console.log( ` * writing ${date}.json` )
    fs.writeFileSync( path.join(DATA_DIR, `${date}.json`), JSON.stringify( dayData, null, 2 ) );
  };

  //console.log( `(debugging break... hang on a moment...)` );
  //await page.waitForTimeout(600000); // freeze for a bit for human-feedback purposes
  await browser.close();
};

// pass dates as command line parameters; examples -
//
// e.g. node index.js 2021-06-21
// defaults to "day after most-recent [or day before yesterday if no records], through yesterday"
let dates = process.argv.slice(2);
if((dates || []).length == 0) {
  // default: let's make smart choices
  const yesterday = moment().subtract(1, 'days');
  const latestDateDownloaded = fs.readdirSync(DATA_DIR, (e,files)=>files).filter(f=>f.match(/^\d{4}-\d{2}-\d{2}.json$/)).map(f=>f.split('.')[0]).sort().reverse()[0];
  const momentLatestDateDownloaded = latestDateDownloaded ? moment( latestDateDownloaded ) : yesterday.clone().subtract(1, 'days');
  const firstDateToDownload = momentLatestDateDownloaded.add(1, 'days');
  // we have some dates to download
  let dateToDownload = firstDateToDownload;
  while(dateToDownload <= yesterday){
    dates.push( dateToDownload.format('YYYY-MM-DD') );
    dateToDownload.add(1, 'days');
  }
}
getData( dates );
