import {DatabaseSync} from 'node:sqlite';
export function sqlite(file=':memory:'){
 const db=new DatabaseSync(file);db.transaction=fn=>(...args)=>{db.exec('BEGIN IMMEDIATE');try{const value=fn(...args);db.exec('COMMIT');return value;}catch(e){db.exec('ROLLBACK');throw e;}};return db;
}
