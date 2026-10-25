import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {openDatabase} from './shared-database.js';
import pg from 'pg';
import {writeSnapshot} from './snapshot-write.js';

const {Pool} = pg;
const DB_PATH = process.env.DB_PATH || 'aesd.db';
const DATABASE_URL = String(process.env.DATABASE_URL || '').trim();
const SNAPSHOT_ID = 'aesd-primary';
const PERSISTENCE_REQUIRED = String(process.env.PERSISTENCE_REQUIRED || '').trim() === '1';

let pool = null;
let snapshotExists = false;
let lastRestoredAt = null;
let lastPersistedAt = null;
let lastError = null;
let persistQueue = Promise.resolve();
let expectedChecksum = null;

export function getPool() {
  if (!DATABASE_URL) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: DATABASE_URL,
      max: 2,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
  }
  return pool;
}

async function ensureSnapshotTable() {
  const client = getPool();
  if (!client) return false;
  await client.query(`
    CREATE TABLE IF NOT EXISTS aesd_sqlite_snapshots (
      id TEXT PRIMARY KEY,
      sqlite_data BYTEA NOT NULL,
      sha256 TEXT NOT NULL,
      byte_size BIGINT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  return true;
}

function statusObject() {
  return {
    configured: Boolean(DATABASE_URL),
    required: PERSISTENCE_REQUIRED,
    mode: DATABASE_URL ? 'external-postgres-snapshot' : 'ephemeral-sqlite',
    snapshotExists,
    lastRestoredAt,
    lastPersistedAt,
    healthy: DATABASE_URL ? !lastError : !PERSISTENCE_REQUIRED,
    error: lastError ? 'PERSISTENCE_UNAVAILABLE' : null,
  };
}

export function getPersistenceStatus() {
  return statusObject();
}

export async function restorePersistentSnapshot() {
  if (!DATABASE_URL) {
    if (PERSISTENCE_REQUIRED) throw new Error('PERSISTENCE_REQUIRED=1 ancak DATABASE_URL ayarlı değil.');
    console.warn('UYARI: Harici kalıcı veritabanı ayarlı değil; SQLite dosyası geçicidir.');
    return statusObject();
  }

  try {
    await ensureSnapshotTable();
    const result = await pool.query(
      'SELECT sqlite_data, sha256, byte_size, updated_at FROM aesd_sqlite_snapshots WHERE id=$1',
      [SNAPSHOT_ID],
    );
    if (!result.rowCount) {
      snapshotExists = false;
      lastError = null;
      console.log('Kalıcı veritabanı bağlı; ilk SQLite snapshot henüz oluşturulmamış.');
      return statusObject();
    }

    const row = result.rows[0];
    const data = Buffer.from(row.sqlite_data);
    const checksum = crypto.createHash('sha256').update(data).digest('hex');
    if (checksum !== row.sha256 || Number(row.byte_size) !== data.length) {
      throw new Error('Kalıcı SQLite snapshot bütünlük kontrolü başarısız.');
    }

    const dir = path.dirname(path.resolve(DB_PATH));
    await fs.mkdir(dir, {recursive: true});
    await Promise.all([
      fs.rm(`${DB_PATH}-wal`, {force: true}).catch(() => undefined),
      fs.rm(`${DB_PATH}-shm`, {force: true}).catch(() => undefined),
    ]);
    await fs.writeFile(DB_PATH, data, {mode: 0o600});
    snapshotExists = true;
    expectedChecksum = checksum;
    lastRestoredAt = new Date().toISOString();
    lastError = null;
    console.log(`Kalıcı SQLite snapshot geri yüklendi (${data.length} byte).`);
    return statusObject();
  } catch (error) {
    lastError = error;
    console.error('Kalıcı snapshot geri yüklenemedi:', error.message);
    throw error;
  }
}

async function persistNow() {
  if (!DATABASE_URL) {
    if (PERSISTENCE_REQUIRED) throw new Error('Kalıcı veritabanı gerekli ancak DATABASE_URL yok.');
    return statusObject();
  }

  if (lastError) throw lastError;
  await ensureSnapshotTable();
  const data = openDatabase(DB_PATH).serialize();
  const checksum = crypto.createHash('sha256').update(data).digest('hex');
  await writeSnapshot(pool, {id:SNAPSHOT_ID,data,checksum,expectedChecksum});
  expectedChecksum = checksum;
  snapshotExists = true;
  lastPersistedAt = new Date().toISOString();
  lastError = null;
  return statusObject();
}

export function persistDatabaseSnapshot() {
  const task = persistQueue.then(() => persistNow());
  persistQueue = task.catch((error) => {
    lastError = error;
    console.error('Kalıcı snapshot yazılamadı:', error.message);
  });
  return task;
}

export async function initializePersistentSnapshot() {
  if (!DATABASE_URL) {
    if (PERSISTENCE_REQUIRED) throw new Error('Kalıcı veritabanı gerekli ancak DATABASE_URL yok.');
    return statusObject();
  }
  if (!snapshotExists) await persistDatabaseSnapshot();
  return statusObject();
}

export async function probePersistence() {
  if (!DATABASE_URL || lastError) return statusObject();
  try {
    const {rows:[row]} = await getPool().query({text:'SELECT sha256 FROM aesd_sqlite_snapshots WHERE id=$1',values:[SNAPSHOT_ID],query_timeout:3000});
    if (!row || row.sha256 !== expectedChecksum) throw new Error('The durable snapshot is missing or changed.');
    return statusObject();
  } catch (error) {
    lastError = error;
    return statusObject();
  }
}

function shouldPersistRequest(req) {
  // The platform persists each write before it sends a response.
  if (req.path.startsWith('/aesd/v1/')) return false;
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return true;
  if (req.method !== 'GET') return false;
  return req.path === '/oauth/google/start' || req.path === '/oauth/google/callback';
}

export function installPersistenceMiddleware(app) {
  app.use((req, res, next) => {
    if (!DATABASE_URL || !shouldPersistRequest(req)) return next();

    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);
    let finalized = false;

    const failClosed = (error, send) => {
      console.error('İşlem kalıcı depoya yazılamadı; süreç güvenli geri dönüş için kapatılacak:', error.message);
      if (!res.headersSent) {
        res.status(503);
        res.set('Content-Type', 'application/json; charset=utf-8');
        send(JSON.stringify({error: 'Kalıcı veri katmanına yazılamadı. İşlem geri alınacak; lütfen tekrar deneyin.'}));
      }
      setTimeout(() => process.exit(1), 150);
    };

    res.json = (body) => {
      if (finalized || res.statusCode >= 400) return originalJson(body);
      finalized = true;
      persistDatabaseSnapshot()
        .then(() => originalJson(body))
        .catch((error) => failClosed(error, originalSend));
      return res;
    };

    // Google OAuth callback writes the linked account / encrypted refresh token and answers with HTML.
    if (req.method === 'GET' && req.path === '/oauth/google/callback') {
      res.send = (body) => {
        if (finalized || res.statusCode >= 400) return originalSend(body);
        finalized = true;
        persistDatabaseSnapshot()
          .then(() => originalSend(body))
          .catch((error) => failClosed(error, originalSend));
        return res;
      };
    }

    next();
  });
}

export async function closePersistence() {
  if (pool) await pool.end();
  pool = null;
}

