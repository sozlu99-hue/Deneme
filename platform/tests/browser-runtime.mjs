// Use an installed browser when its path is set. Otherwise use Playwright's browser.
export const browserOptions={
 headless:true,
 args:['--no-sandbox','--disable-dev-shm-usage'],
 ...(process.env.AESD_CHROMIUM_PATH?{executablePath:process.env.AESD_CHROMIUM_PATH}:{})
};
