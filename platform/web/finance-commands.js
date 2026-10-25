import {isMoney} from './payment-rules.js';
import {supplierBalance,bankLedgerTargets} from './finance-rules.js';
const uid = () => crypto.randomUUID();
const text = (v, max = 120) => { if (typeof v !== 'string' || !v.trim() || v.length > max) throw Error('Ad veya açıklama gerekli.'); return v.trim(); };
const money = value => { if (!isMoney(value) || !value) throw Error('Pozitif tutar gerekli.'); return value; };
const calendarDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

export function applyFinanceCommand(s, action, now) {
  const shiftId = () => {
    const shift = s.shifts?.find(x => x.status === 'open');
    if (s.shifts?.length && !shift) throw Error('Nakit işlem için önce kasayı aç.');
    return shift?.id || null;
  };
  if (action.type === 'customer-terms') {
    const customer = s.customers.find(x => x.id === action.id);
    if (!customer || action.creditLimitCents != null && !isMoney(action.creditLimitCents) || !Number.isInteger(action.termDays) || action.termDays < 0 || action.termDays > 3650) throw Error('Cari limit veya vade geçersiz.');
    customer.creditLimitCents = action.creditLimitCents; customer.termDays = action.termDays;
  } else if (action.type === 'supplier') {
    const name = text(action.name, 100);
    if (s.suppliers?.some(x => x.name.toLocaleLowerCase('tr') === name.toLocaleLowerCase('tr'))) throw Error('Bu tedarikçi mevcut.');
    (s.suppliers ??= []).push({id: uid(), name, phone: String(action.phone || '').slice(0, 40), createdAt: now});
  } else if (action.type === 'supplier-bill') {
    if (!s.suppliers?.some(x => x.id === action.supplierId) || !calendarDate(action.dueDate)) throw Error('Tedarikçi ve vade tarihi gerekli.');
    const invoiceNumber = text(action.invoiceNumber, 80);
    if (s.supplierBills?.some(x => x.supplierId === action.supplierId && x.invoiceNumber === invoiceNumber)) throw Error('Bu tedarikçi faturası daha önce kaydedilmiş.');
    (s.supplierBills ??= []).push({id: uid(), supplierId: action.supplierId, invoiceNumber, date: now, dueDate: action.dueDate, amountCents: money(action.amountCents), purchaseId: null});
  } else if (action.type === 'supplier-pay') {
    if (!s.suppliers?.some(x => x.id === action.supplierId) || !['cash', 'bank'].includes(action.payment) ||
      money(action.amountCents) > supplierBalance(s, action.supplierId)) throw Error('Ödeme açık tedarikçi borcunu aşamaz.');
    (s.supplierPayments ??= []).push({id: uid(), supplierId: action.supplierId, date: now, amountCents: action.amountCents,
      payment: action.payment, reason: text(action.reason, 500), shiftId: action.payment === 'cash' ? shiftId() : null});
  } else if (action.type === 'expense') {
    if (!['cash', 'bank'].includes(action.payment)) throw Error('Gider ödeme yöntemi gerekli.');
    (s.expenses ??= []).push({id: uid(), date: now, category: text(action.category, 60), reason: text(action.reason, 500),
      amountCents: money(action.amountCents), payment: action.payment, shiftId: action.payment === 'cash' ? shiftId() : null});
  } else if (action.type === 'bank-import') {
    const account = text(action.account, 80);
    if (!Array.isArray(action.rows) || !action.rows.length || action.rows.length > 5000) throw Error('Bir aktarımda 1 ile 5000 banka hareketi olmalı.');
    const rows = s.bankTransactions ??= [];
    for (const row of action.rows) {
      const externalId = text(row.externalId, 120);
      if (!Number.isSafeInteger(row.amountCents) || !row.amountCents || Math.abs(row.amountCents) > 1e12 || typeof row.date !== 'string' || !Number.isFinite(Date.parse(row.date))) throw Error('Banka tutarı veya tarihi geçersiz.');
      const description = String(row.description || '').slice(0, 200), date = new Date(row.date).toISOString();
      const old = rows.find(x => x.account === account && x.externalId === externalId);
      if (old) { if (old.amountCents !== row.amountCents || old.date !== date || old.description !== description) throw Error('Aynı banka kimliği farklı içerikle kullanılamaz.'); continue; }
      rows.push({id: uid(), account, externalId, date, description, amountCents: row.amountCents, importedAt: now});
    }
  } else if (action.type === 'bank-match') {
    const bank = s.bankTransactions?.find(x => x.id === action.bankId), matches = s.bankMatches ??= [];
    if (!bank || matches.some(x => x.bankId === bank.id && x.status === 'matched') || !Array.isArray(action.keys) || !action.keys.length) throw Error('Eşleştirilmemiş banka hareketi ve kayıtlar gerekli.');
    const used = new Set(matches.filter(x => x.status === 'matched').flatMap(x => x.keys)), seen = new Set();
    const targets = new Map(bankLedgerTargets(s).map(x => [x.key, x]));
    let sum = 0;
    for (const key of action.keys) {
      if (seen.has(key) || used.has(key) || !targets.has(key)) throw Error('Kayıt eşleşmiş, yinelenmiş veya bulunamadı.');
      seen.add(key); sum += targets.get(key).amountCents;
    }
    if (sum !== bank.amountCents) throw Error('Seçilen kayıt toplamı banka hareketiyle eşleşmiyor.');
    matches.push({id: uid(), bankId: bank.id, keys: [...seen], status: 'matched', date: now});
  } else if (action.type === 'bank-unmatch') {
    const match = s.bankMatches?.find(x => x.id === action.id && x.status === 'matched');
    if (!match) throw Error('Aktif banka eşleştirmesi bulunamadı.');
    match.status = 'revoked'; match.revokedAt = now; match.reason = text(action.reason, 500);
  } else return false;
  return true;
}
