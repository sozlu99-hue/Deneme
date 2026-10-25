// Follow the approved two-step payment UI; no financial assertion is bypassed.
export async function confirmCheckout(page){
 await page.locator('#dialog [data-action=checkout-confirm]').waitFor();
 const received=page.locator('#checkout-received');
 if(await received.count())await received.fill((Number(await received.getAttribute('data-cash-cents'))/100).toFixed(2));
 await page.locator('#dialog [data-action=checkout-confirm]').click();
}
