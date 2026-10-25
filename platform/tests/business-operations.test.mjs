import test from 'node:test';
import assert from 'node:assert/strict';
import {command,emptyState,validateState,summary} from '../web/pos.js';
import {expectedCash} from '../web/payment-rules.js';
import {warehouseBalance} from '../web/inventory-rules.js';
import {financialTotals,receivablesAging,customerStatement,supplierBalance,csvDocument} from '../web/finance-rules.js';

const now = '2026-10-18T12:00:00.000Z';
const run = (state, action, date = now) => command(state, action, date);
function market() {
  let s = run(emptyState('business-one', 'market'), {type: 'product', product: {name: 'Ürün', priceCents: 1000}});
  s = run(s, {type: 'purchase', kind: 'products', itemId: s.products[0].id, qty: 100, costCents: 400});
  return run(s, {type: 'customer', name: 'Müşteri'});
}
function cafe() {
  let s = run(emptyState('business-one', 'cafe'), {type: 'material', name: 'Kahve', unit: 'gram'});
  s = run(s, {type: 'purchase', kind: 'materials', itemId: s.materials[0].id, qty: 1000, costCents: 5});
  return run(s, {type: 'product', product: {name: 'Kahve', priceCents: 1000, recipe: [{materialId: s.materials[0].id, qty: 10}]}});
}
const sale = (s, body = {}) => run(s, {type: 'sale', id: crypto.randomUUID(), payment: 'cash', lines: [{productId: s.products[0].id, qty: 2}], ...body});

test('225 TL can close as 100 TL cash + 125 TL card with one sale and stock movement', () => {
  let s = market(); s = run(s, {type: 'product-update', id: s.products[0].id, product: {...s.products[0], priceCents: 22500}});
  s = sale(s, {lines: [{productId: s.products[0].id, qty: 1}], payments: [{method: 'cash', amountCents: 10000}, {method: 'card', amountCents: 12500}]});
  assert.equal(s.sales.length, 1); assert.equal(s.products[0].stock, 99); assert.equal(s.sales[0].payment, 'split');
  const d = summary(s).days[0]; assert.equal(d.cashCents, 10000); assert.equal(d.cardCents, 12500);
  const before = JSON.stringify(s);
  assert.throws(() => sale(s, {payments: [{method: 'cash', amountCents: 1}]}), /eşleşmiyor/); assert.equal(JSON.stringify(s), before);
});

test('Mixed credit, risk limits, collection and cancellation keep the exact customer balance', () => {
  let s = market(), customerId = s.customers[0].id;
  s = run(s, {type: 'customer-terms', id: customerId, creditLimitCents: 1000, termDays: 15});
  s = sale(s, {customerId, payments: [{method: 'cash', amountCents: 1000}, {method: 'credit', amountCents: 1000}]});
  assert.equal(s.customers[0].balanceCents, 1000); assert.equal(s.sales[0].dueDate, '2026-11-02');
  assert.throws(() => sale(s, {payment: 'credit', customerId}), /risk limiti/);
  s = run(s, {type: 'collect', customerId, amountCents: 500});
  s = run(s, {type: 'cancel', id: s.sales[0].id});
  assert.equal(s.customers[0].balanceCents, -500);
  assert.equal(customerStatement(s, customerId).at(-1).balanceCents, -500);
});

test('Partial item return restores only returned stock and prevents duplicate or excessive returns', () => {
  let s = sale(market()); const saleId = s.sales[0].id, productId = s.products[0].id;
  const original = structuredClone(s.sales[0]);
  s = run(s, {type: 'sale-return', id: 'return-one', saleId, lines: [{productId, qty: 1}], restock: true, reason: 'Ambalaj açılmadı', payments: [{method: 'cash', amountCents: 1000}]});
  assert.equal(s.products[0].stock, 99); assert.deepEqual(s.sales[0], original);
  assert.equal(financialTotals(s).revenueCents, 1000); assert.equal(financialTotals(s).costCents, 400);
  assert.throws(() => run(s, {type: 'cancel', id: saleId}), /Kısmi iade/);
  assert.throws(() => run(s, {type: 'sale-return', id: 'return-two', saleId, lines: [{productId, qty: 2}], restock: true, reason: 'İade denemesi', payments: [{method: 'cash', amountCents: 2000}]}), /aşamaz/);
  const corrupt = structuredClone(s); corrupt.saleReturns[0].totalCents = 1;
  assert.throws(() => validateState(corrupt, s.businessId, s.module), /eşleşmiyor/);
});

test('A prepared food refund without restocking leaves cost and ingredient consumption intact', () => {
  let s = sale(cafe());
  s = run(s, {type: 'sale-return', id: 'food-return', saleId: s.sales[0].id, lines: [{productId: s.products[0].id, qty: 1}], restock: false, reason: 'Hazırlanmış ürün', payments: [{method: 'cash', amountCents: 1000}]});
  assert.equal(s.materials[0].stock, 980); assert.equal(financialTotals(s).costCents, 100);
});

test('Cash closing reconciles sales, supplier payments, expenses and explained differences', () => {
  let s = market();
  s = run(s, {type: 'register-open', name: 'Gündüz', openingCents: 5000});
  s = sale(s); s = run(s, {type: 'expense', category: 'Kira', amountCents: 500, payment: 'cash', reason: 'Günlük gider kaydı'});
  s = run(s, {type: 'register-move', direction: 'in', amountCents: 1000, reason: 'Bozuk para eklendi'});
  const id = s.shifts[0].id; assert.equal(expectedCash(s, id), 7500);
  assert.throws(() => run(s, {type: 'register-close', shiftId: id, countedCents: 7400}), /açıklama/i);
  s = run(s, {type: 'register-close', shiftId: id, countedCents: 7400, reason: 'Sayım farkı araştırılacak'});
  assert.equal(s.shifts[0].differenceCents, -100); assert.throws(() => sale(s), /kasayı aç/);
  assert.throws(() => run(s, {type: 'cancel', id: s.sales[0].id}), /Kapalı kasa/);
});

test('Changing a recipe preserves historical costs, recipe use and stock returns', () => {
  let s = sale(cafe()), product = s.products[0];
  const historical = structuredClone(s.sales[0]);
  s = run(s, {type: 'product-update', id: product.id, product: {...product, priceCents: 1500, recipe: [{materialId: s.materials[0].id, qty: 20}]}});
  assert.deepEqual(s.sales[0], historical); assert.equal(s.products[0].recipeVersion, 2);
  s = run(s, {type: 'cancel', id: historical.id}); assert.equal(s.materials[0].stock, 1000);
  s = sale(s); assert.equal(s.sales[1].costCents, 200); assert.equal(s.materials[0].stock, 960);
});

test('Allowed alternative ingredients change consumption; arbitrary substitutions fail', () => {
  let s = cafe(); s = run(s, {type: 'material', name: 'Alternatif kahve', unit: 'gram'});
  s = run(s, {type: 'purchase', kind: 'materials', itemId: s.materials[1].id, qty: 100, costCents: 9});
  s = run(s, {type: 'product-update', id: s.products[0].id, product: {...s.products[0], recipe: [{materialId: s.materials[0].id, qty: 10, alternatives: [{materialId: s.materials[1].id, qty: 12}]}]}});
  s = sale(s, {lines: [{productId: s.products[0].id, qty: 1, substitutions: {[s.materials[0].id]: s.materials[1].id}}]});
  assert.equal(s.materials[0].stock, 1000); assert.equal(s.materials[1].stock, 88); assert.equal(s.sales[0].costCents, 108);
  assert.throws(() => sale(s, {lines: [{productId: s.products[0].id, qty: 1, substitutions: {[s.materials[0].id]: 'missing'}}]}), /alternatif/);
});

test('Kg/gram receiving keeps sub-cent unit cost and old sale costs', () => {
  let s = cafe(), material = s.materials[0];
  s = run(s, {type: 'receive', kind: 'materials', itemId: material.id, qty: 1, unit: 'kg', unitPriceCents: 7990, lotNumber: 'PARTI-1', expiryDate: '2026-12-31'});
  assert.equal(s.materials[0].stock, 2000); assert.equal(s.purchases.at(-1).rawCostCents, 7.99);
  assert.equal(s.materials[0].rawCostCents, 6.495); s = sale(s);
  assert.equal(s.sales[0].costCents, 130);
});

test('Count conflicts are rejected and waste cannot consume more than the available warehouse', () => {
  let s = market();
  s = run(s, {type: 'stock-count', kind: 'products', itemId: s.products[0].id, expectedStock: 100, countedQty: 98, reason: 'Raf sayımı'});
  assert.equal(s.products[0].stock, 98);
  assert.throws(() => run(s, {type: 'stock-count', kind: 'products', itemId: s.products[0].id, expectedStock: 100, countedQty: 99, reason: 'Eski sayım'}), /Stok değişti/);
  assert.throws(() => run(s, {type: 'stock-waste', kind: 'products', itemId: s.products[0].id, expectedStock: 98, qty: 99, reason: 'Hasarlı'}), /fazla olamaz/);
});

test('Warehouse transfer tracks in-transit stock and receives once without creating stock', () => {
  let s = market(); s = run(s, {type: 'warehouse', name: 'Şube deposu'});
  const warehouseId = s.warehouses[0].id, productId = s.products[0].id;
  s = run(s, {type: 'transfer-send', fromWarehouseId: 'main', toWarehouseId: warehouseId, lines: [{kind: 'products', itemId: productId, qty: 30}], reason: 'Şube sevki'});
  assert.equal(s.products[0].stock, 100); assert.equal(warehouseBalance(s, 'products', productId), 70); assert.equal(warehouseBalance(s, 'products', productId, warehouseId), 0);
  assert.throws(() => sale(s, {warehouseId}), /yetersiz/);
  s = run(s, {type: 'transfer-receive', id: s.transfers[0].id});
  assert.equal(warehouseBalance(s, 'products', productId, warehouseId), 30);
  assert.throws(() => run(s, {type: 'transfer-receive', id: s.transfers[0].id}), /daha önce/);
  s = sale(s, {warehouseId}); assert.equal(s.products[0].stock, 98);
});

test('Table splitting/merging conserves quantities; KDS tickets are emitted once per station', () => {
  let s = cafe(); s = run(s, {type: 'table', name: 'Masa 1', area: 'Salon', seats: 4});
  s = run(s, {type: 'order', label: 'Masa 1', tableId: s.tables[0].id, lines: [{productId: s.products[0].id, qty: 3}]});
  const sourceId = s.orders[0].id;
  s = run(s, {type: 'order-split', id: sourceId, label: 'Ayrı hesap', lines: [{productId: s.products[0].id, qty: 1}]});
  assert.equal(s.orders.reduce((n, x) => n + x.lines[0].qty, 0), 3);
  s = run(s, {type: 'order-merge', id: sourceId, sourceId: s.orders[1].id});
  s = run(s, {type: 'order-send', id: sourceId}); assert.equal(s.kitchenTickets.length, 1); assert.equal(s.materials[0].stock, 1000);
  assert.throws(() => run(s, {type: 'order-send', id: sourceId}), /daha önce/);
  s = run(s, {type: 'kitchen-status', id: s.kitchenTickets[0].id, status: 'preparing'});
  assert.throws(() => run(s, {type: 'kitchen-status', id: s.kitchenTickets[0].id, status: 'served'}), /geçiş/);
  s = sale(s, {orderId: sourceId, lines: s.orders[0].lines}); assert.equal(s.orders.length, 0); assert.equal(s.closedOrders.at(-1).outcome, 'paid');
  assert.equal(s.materials[0].stock, 970);
});

test('Repeated external order IDs remain blocked after payment', () => {
  let s = cafe(); const body = {type: 'external-order', source: 'qr', externalKey: 'qr:one', label: 'QR sipariş', lines: [{productId: s.products[0].id, qty: 1}]};
  s = run(s, body); s = sale(s, {orderId: s.orders[0].id, lines: s.orders[0].lines});
  assert.throws(() => run(s, body), /daha önce/);
});

test('Aging and statements reconcile partial collections and credit returns', () => {
  let s = market(), customerId = s.customers[0].id;
  s = sale(s, {payment: 'credit', customerId, dueDate: '2026-09-01'});
  s = run(s, {type: 'collect', customerId, amountCents: 500});
  const aged = receivablesAging(s, now)[0]; assert.equal(aged.days31to60Cents, 1500);
  assert.equal(customerStatement(s, customerId).at(-1).balanceCents, s.customers[0].balanceCents);
});

test('Receiving, supplier payment and expenses avoid counting purchases twice as expense', () => {
  let s = market(); s = run(s, {type: 'supplier', name: 'Tedarikçi'}); const supplierId = s.suppliers[0].id;
  s = run(s, {type: 'receive', kind: 'products', itemId: s.products[0].id, qty: 5, unit: 'adet', unitPriceCents: 400, supplierId, invoiceNumber: 'FAT-1'});
  assert.equal(supplierBalance(s, supplierId), 2000);
  s = run(s, {type: 'supplier-pay', supplierId, amountCents: 500, payment: 'bank', reason: 'Kısmi ödeme'});
  assert.equal(supplierBalance(s, supplierId), 1500); assert.equal(financialTotals(s).expenseCents, 0);
  s = run(s, {type: 'expense', category: 'Kira', amountCents: 1000, payment: 'bank', reason: 'İşyeri kirası'});
  assert.equal(financialTotals(s).operatingResultCents, -1000);
});

test('Bank imports are idempotent and reconciliation never creates a second revenue entry', () => {
  let s = sale(market(), {payment: 'card'}); const revenue = financialTotals(s).revenueCents;
  const bank = {type: 'bank-import', account: 'Test Bankası', rows: [{externalId: 'bank-one', date: now, amountCents: 2000, description: 'Kart kapanışı'}]};
  s = run(s, bank); s = run(s, bank); assert.equal(s.bankTransactions.length, 1);
  s = run(s, {type: 'bank-match', bankId: s.bankTransactions[0].id, keys: ['sale-card:' + s.sales[0].id]});
  assert.equal(financialTotals(s).revenueCents, revenue);
  assert.throws(() => run(s, {type: 'bank-match', bankId: s.bankTransactions[0].id, keys: ['sale-card:' + s.sales[0].id]}), /Eşleştirilmemiş/);
  assert.throws(() => run(s, {type: 'cancel', id: s.sales[0].id}), /eşleştirme|Banka kaydı/);
});

test('CSV exports preserve Turkish text and neutralize spreadsheet formulas', () => {
  const text = csvDocument(['Ad', 'Tutar'], [['=HYPERLINK("bad")', -500], ['Çağrı', 150]]);
  assert.ok(text.startsWith('\uFEFF')); assert.ok(text.includes("'=HYPERLINK")); assert.ok(text.includes('Çağrı')); assert.ok(text.includes('"-500"'));
});

test('One supplier invoice groups multiple receipts without duplicating the debt', () => {
  let s = run(market(), {type:'supplier', name:'Tedarikçi'});
  const supplierId=s.suppliers[0].id, itemId=s.products[0].id;
  const receive={type:'receive',kind:'products',itemId,qty:2,unit:'adet',unitPriceCents:400,supplierId,invoiceNumber:'ORTAK-1'};
  s=run(s,receive);s=run(s,{...receive,qty:3});
  assert.equal(s.supplierBills.length,1);assert.equal(s.supplierBills[0].purchaseIds.length,2);
  assert.equal(supplierBalance(s,supplierId),2000);
});

test('Count and waste losses affect the operating result without another stock purchase expense', () => {
  let s=market(),itemId=s.products[0].id;
  s=run(s,{type:'stock-waste',kind:'products',itemId,expectedStock:100,qty:2,reason:'Bozulmuş ürün'});
  assert.equal(financialTotals(s).stockVarianceCents,800);
  assert.equal(financialTotals(s).operatingResultCents,-800);
  const corrupt=structuredClone(s);corrupt.stockAdjustments[0].rawUnitCostCents='bad';
  assert.throws(()=>validateState(corrupt,s.businessId,s.module),/Sayım veya fire/);
});

test('Imported recipes cannot name an absent alternative ingredient', () => {
  const s=cafe();s.products[0].recipe[0].alternatives=[{materialId:'missing',qty:1}];
  assert.throws(()=>validateState(s,s.businessId,s.module),/alternatif/);
});
