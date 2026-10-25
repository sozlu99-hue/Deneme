import {isMoney} from './payment-rules.js';
import {bankLedgerTargets,supplierBalance} from './finance-rules.js';
export const financeCollections = ['suppliers', 'supplierBills', 'supplierPayments', 'expenses', 'bankTransactions', 'bankMatches'];
export function validateFinance(s) {
  const date = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
  const text = (value, max) => typeof value === 'string' && value.trim() && value.length <= max;
  const suppliers = new Set((s.suppliers || []).map(x => x.id));
  for (const c of s.customers) if (c.creditLimitCents != null && !isMoney(c.creditLimitCents) || c.termDays !== undefined && (!Number.isInteger(c.termDays) || c.termDays < 0 || c.termDays > 3650)) throw Error('Cari risk veya vade kaydı geçersiz.');
  for (const row of s.suppliers || []) if (!text(row.name, 100) || !date(row.createdAt)) throw Error('Tedarikçi kaydı geçersiz.');
  const invoices = new Set(), purchases = new Set();
  for (const row of s.supplierBills || []) {
    const key = row.supplierId + ':' + row.invoiceNumber;
    if (!suppliers.has(row.supplierId) || !isMoney(row.amountCents) || !date(row.date) || !date(row.dueDate) ||
      row.invoiceNumber && invoices.has(key)) throw Error('Tedarikçi borcu geçersiz veya yinelenmiş.');
    if (row.invoiceNumber) invoices.add(key);
    if (row.purchaseId||row.purchaseIds) {
      const ids=row.purchaseIds||[row.purchaseId];let total=0;
      if(!Array.isArray(ids)||!ids.length)throw Error('Tedarikçi mal kabul bağlantısı eksik.');
      for(const id of ids){const p=s.purchases.find(x=>x.id===id);if(!p||purchases.has(p.id)||p.supplierId!==row.supplierId)throw Error('Tedarikçi borcu mal kabulle eşleşmiyor.');purchases.add(p.id);total+=p.totalCents;}
      if(total!==row.amountCents)throw Error('Tedarikçi borcu mal kabulle eşleşmiyor.');
    }
  }
  for (const row of s.supplierPayments || []) if (!suppliers.has(row.supplierId) || !isMoney(row.amountCents) || !row.amountCents || !date(row.date) || !['cash', 'bank'].includes(row.payment) || !text(row.reason, 500)) throw Error('Tedarikçi ödemesi geçersiz.');
  for (const id of suppliers) if (supplierBalance(s, id) < 0) throw Error('Tedarikçi ödemesi borcu aşamaz.');
  for (const row of s.expenses || []) if (!isMoney(row.amountCents) || !row.amountCents || !date(row.date) || !['cash', 'bank'].includes(row.payment) || !text(row.category, 60) || !text(row.reason, 500)) throw Error('Gider kaydı geçersiz.');
  const bankKeys = new Set(), bankIds = new Set();
  for (const row of s.bankTransactions || []) {
    const key = row.account + ':' + row.externalId;
    if (!text(row.account, 80) || !text(row.externalId, 120) || bankKeys.has(key) || !date(row.date) || !Number.isSafeInteger(row.amountCents) || !row.amountCents || Math.abs(row.amountCents) > 1e12) throw Error('Banka hareketi geçersiz veya yinelenmiş.');
    bankKeys.add(key);
  }
  const used = new Set(), targets = new Map(bankLedgerTargets(s).map(x => [x.key, x]));
  for (const match of s.bankMatches || []) {
    const bank = s.bankTransactions?.find(x => x.id === match.bankId);
    if (!bank || !date(match.date) || !['matched', 'revoked'].includes(match.status) || !Array.isArray(match.keys) || !match.keys.length) throw Error('Banka eşleştirmesi geçersiz.');
    if (match.status === 'revoked') { if (!date(match.revokedAt) || !text(match.reason, 500)) throw Error('Banka eşleştirme iptali geçersiz.'); continue; }
    if (bankIds.has(bank.id)) throw Error('Banka hareketi birden fazla kez eşleştirilmiş.');
    bankIds.add(bank.id); let sum = 0;
    for (const key of match.keys) {
      if (used.has(key) || !targets.has(key)) throw Error('Banka kaydı birden fazla kez kullanılmış veya değişmiş. Önce eşleştirmeyi kontrol et.');
      used.add(key); sum += targets.get(key).amountCents;
    }
    if (sum !== bank.amountCents) throw Error('Banka eşleştirme toplamı geçersiz.');
  }
}
