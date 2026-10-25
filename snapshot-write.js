// A stale process must not replace a newer durable database image.
export async function writeSnapshot(pool, {id, data, checksum, expectedChecksum}) {
  const result = expectedChecksum === null
    ? await pool.query(`INSERT INTO aesd_sqlite_snapshots(id,sqlite_data,sha256,byte_size,updated_at)
        VALUES($1,$2,$3,$4,NOW()) ON CONFLICT(id) DO NOTHING`, [id,data,checksum,data.length])
    : await pool.query(`UPDATE aesd_sqlite_snapshots SET sqlite_data=$2,sha256=$3,byte_size=$4,updated_at=NOW()
        WHERE id=$1 AND sha256=$5`, [id,data,checksum,data.length,expectedChecksum]);
  if (result.rowCount !== 1) {
    throw Object.assign(new Error('The durable snapshot changed. Restart from the current snapshot.'), {code:'SNAPSHOT_CONFLICT'});
  }
}
