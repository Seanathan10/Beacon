
import { db, query } from '../database/db';

try {
    const tableSql = `CREATE TABLE IF NOT EXISTS test (id INTEGER PRIMARY KEY, name TEXT)`;
    query(tableSql);

    const insertSql = `INSERT INTO test (name) VALUES (?) RETURNING id, name`;
    const result = query(insertSql, ['foo']);

    console.log('Insert Result:', result);
    console.log('Is Array:', Array.isArray(result));
    
    if (Array.isArray(result) && result.length > 0) {
        console.log('First Row:', result[0]);
    }

} catch (e) {
    console.error(e);
}
