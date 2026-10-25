import path from 'node:path';
import Database from 'better-sqlite3';
import {requireActiveWrite} from './control-scope.js';

const connections=new Map();
export function openDatabase(file=process.env.DB_PATH||'aesd.db'){
 const key=path.resolve(file);let db=connections.get(key);
 if(db?.open)return db;
 db=new Database(file,{timeout:5000});
 db.pragma('journal_mode=WAL');db.pragma('synchronous=FULL');db.pragma('busy_timeout=5000');
 const prepare=db.prepare.bind(db),exec=db.exec.bind(db);
 db.prepare=(...args)=>{const statement=prepare(...args),run=statement.run.bind(statement);statement.run=(...values)=>{requireActiveWrite();return run(...values);};return statement;};
 db.exec=(...args)=>{requireActiveWrite();return exec(...args);};
 connections.set(key,db);return db;
}
