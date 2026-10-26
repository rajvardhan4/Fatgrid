import {test} from 'node:test';
import assert from 'node:assert/strict';
import {databaseError} from '../server/database-error';
test('database diagnostics classify failures without returning driver secrets',()=>{
 for(const [code,expected] of [['HANDSHAKE_SSL_ERROR','database_tls_failed'],['ER_ACCESS_DENIED_ERROR','database_auth_failed'],['ETIMEDOUT','database_network_failed'],['ER_BAD_DB_ERROR','database_name_failed']]){
  const result=databaseError({code,message:'mysql://user:secret@private-host/db',sql:'secret query'});assert.equal(result.code,expected);assert.ok(!JSON.stringify(result).includes('secret'));
 }
 assert.equal(databaseError({code:'secret',message:'password'}).diagnostic,'UNCLASSIFIED');
});
