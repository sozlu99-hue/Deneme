import {dateKey} from './business-calendar.js';
import {paymentAmount} from './payment-rules.js';

export function financialTotals(s, from = '', to = '9999') {
  const between = date => dateKey(date) >= from && dateKey(date) <= to;
  const sales = s.sales.filter(x => x.status === 'completed' && between(x.date));
  const returns = (s.saleReturns || []).filter(x => between(x.date));
  const expenses = (s.expenses || []).filter(x => between(x.date));
  const revenueCents = sales.reduce((n, x) => n + x.totalCents, 0) - returns.reduce((n, x) => n + x.totalCents, 0);
  const costCents = sales.reduce((n, x) => n + x.costCents, 0) - returns.reduce((n, x) => n + x.costCents, 0);
  const expenseCents = expenses.reduce((n, x) => n + x.amountCents, 0);
  const stockVarianceCents=(s.stockAdjustments||[]).filter(x=>between(x.date)).reduce((n,x)=>n-Math.round(x.deltaQty*(x.rawUnitCostCents??x.unitCostCents)),0);
  return {revenueCents, costCents, grossProfitCents: revenueCents - costCents, expenseCents,
    stockVarianceCents,operatingResultCents: revenueCents - costCents - expenseCents - stockVarianceCents};
}
export function customerStatement(s, customerId) {
  const rows = [];
  for (const sale of s.sales) if (sale.customerId === customerId && paymentAmount(sale, 'credit')) {
    const amount = paymentAmount(sale, 'credit');
    rows.push({id: sale.id, date: sale.date, label: 'Vadeli satış', debitCents: amount, creditCents: 0});
    if (sale.status === 'cancelled') rows.push({id: 'cancel-' + sale.id, date: sale.cancelledAt, label: 'Satış iptali', debitCents: 0, creditCents: amount});
  }
  for (const c of s.collections) if (c.customerId === customerId) rows.push({id: c.id, date: c.date, label: 'Tahsilat', debitCents: 0, creditCents: c.amountCents});
  for (const r of s.refunds || []) if (r.customerId === customerId) rows.push({id: r.id, date: r.date, label: 'Müşteriye ödeme', debitCents: r.amountCents, creditCents: 0});
  for (const r of s.saleReturns || []) if (r.customerId === customerId && paymentAmount(r, 'credit')) rows.push({id: r.id, date: r.date, label: 'Ürün iadesi', debitCents: 0, creditCents: paymentAmount(r, 'credit')});
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  let balance = 0;
  return rows.map(row => ({...row, balanceCents: balance += row.debitCents - row.creditCents}));
}
export function receivablesAging(s, at = new Date()) {
  const today = dateKey(at), day = 86400000;
  const saleReturns = new Map();
  for (const r of s.saleReturns || []) saleReturns.set(r.saleId, (saleReturns.get(r.saleId) || 0) + paymentAmount(r, 'credit'));
  return s.customers.map(customer => {
    const invoices = s.sales.filter(x => x.customerId === customer.id && x.status === 'completed' && paymentAmount(x, 'credit'))
      .map(x => ({saleId: x.id, date: x.date, dueDate: x.dueDate || dateKey(x.date), remainingCents: paymentAmount(x, 'credit') - (saleReturns.get(x.id) || 0)}))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.date.localeCompare(b.date));
    let paid = s.collections.filter(x => x.customerId === customer.id).reduce((n, x) => n + x.amountCents, 0) -
      (s.refunds || []).filter(x => x.customerId === customer.id).reduce((n, x) => n + x.amountCents, 0);
    for (const invoice of invoices) { const amount = Math.min(Math.max(0, paid), invoice.remainingCents); invoice.remainingCents -= amount; paid -= amount; }
    const buckets = {notDueCents: 0, days1to30Cents: 0, days31to60Cents: 0, days61to90Cents: 0, days91plusCents: 0};
    for (const invoice of invoices) {
      const days = Math.floor((Date.parse(today) - Date.parse(invoice.dueDate)) / day);
      const key = days <= 0 ? 'notDueCents' : days <= 30 ? 'days1to30Cents' : days <= 60 ? 'days31to60Cents' : days <= 90 ? 'days61to90Cents' : 'days91plusCents';
      buckets[key] += invoice.remainingCents;
    }
    return {customerId: customer.id, name: customer.name, balanceCents: customer.balanceCents,
      creditBalanceCents: Math.max(0, -customer.balanceCents), ...buckets, invoices: invoices.filter(x => x.remainingCents > 0)};
  });
}
export function supplierBalance(s, supplierId) {
  return (s.supplierBills || []).filter(x => x.supplierId === supplierId).reduce((n, x) => n + x.amountCents, 0) -
    (s.supplierPayments || []).filter(x => x.supplierId === supplierId).reduce((n, x) => n + x.amountCents, 0);
}
export function bankLedgerTargets(s) {
  const rows = [];
  const add = (kind, id, amountCents, date, label) => { if (amountCents) rows.push({key: kind + ':' + id, kind, id, amountCents, date, label}); };
  for (const sale of s.sales) if (sale.status === 'completed') add('sale-card', sale.id, paymentAmount(sale, 'card'), sale.date, 'Kart satışı');
  for (const c of s.collections) if (c.payment === 'card') add('collection', c.id, c.amountCents, c.date, 'Cari tahsilat');
  for (const r of s.refunds || []) if (r.payment === 'card') add('customer-refund', r.id, -r.amountCents, r.date, 'Müşteri iadesi');
  for (const r of s.saleReturns || []) add('sale-return', r.id, -paymentAmount(r, 'card'), r.date, 'Ürün iadesi');
  for (const p of s.supplierPayments || []) if (p.payment === 'bank') add('supplier-payment', p.id, -p.amountCents, p.date, 'Tedarikçi ödemesi');
  for (const e of s.expenses || []) if (e.payment === 'bank') add('expense', e.id, -e.amountCents, e.date, e.category);
  return rows;
}
export function csvDocument(headers, rows) {
  const cell = value => {
    let text = value == null ? '' : String(value);
    if (typeof value !== 'number' && /^[=+\-@\t\r\n]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  return '\uFEFF' + [headers, ...rows].map(row => row.map(cell).join(';')).join('\r\n');
}
