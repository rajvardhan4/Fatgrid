// Never return driver messages: they can include SQL, hosts or credentials.
export function databaseError(error:unknown){
 const code=typeof error==='object'&&error!==null&&'code' in error?String(error.code):'';
 const groups:[string[],string,string][]=[
  [['HANDSHAKE_SSL_ERROR','SELF_SIGNED_CERT_IN_CHAIN','DEPTH_ZERO_SELF_SIGNED_CERT','UNABLE_TO_VERIFY_LEAF_SIGNATURE','UNABLE_TO_GET_ISSUER_CERT_LOCALLY','CERT_HAS_EXPIRED','ERR_TLS_CERT_ALTNAME_INVALID'],'database_tls_failed','MySQL TLS certificate verification failed. Set MYSQL_SSL_CA to the complete CA certificate from this MySQL service, then redeploy.'],
  [['ER_ACCESS_DENIED_ERROR','ER_ACCESS_DENIED_NO_PASSWORD_ERROR'],'database_auth_failed','MySQL rejected the database credentials. Copy the complete MySQL Service URI with its actual username and password into MYSQL_URL, then redeploy.'],
  [['ENOTFOUND','EAI_AGAIN'],'database_host_failed','MySQL hostname could not be resolved. Check the host in MYSQL_URL against your MySQL service.'],
  [['ETIMEDOUT','ECONNREFUSED','EHOSTUNREACH','ENETUNREACH'],'database_network_failed','MySQL server could not be reached. Confirm the service is Running and check its host, port and network access settings.'],
  [['ER_BAD_DB_ERROR'],'database_name_failed','The MySQL database name does not exist. Use the database name from the service connection information.'],
  [['ER_DBACCESS_DENIED_ERROR','ER_TABLEACCESS_DENIED_ERROR','ER_SPECIFIC_ACCESS_DENIED_ERROR'],'database_permission_failed','MySQL user lacks required database permissions. Check access to the database and permissions to create tables and indexes.'],
  [['ER_TOO_MANY_USER_CONNECTIONS','ER_CON_COUNT_ERROR','ER_USER_LIMIT_REACHED'],'database_connection_limit','MySQL connection limit reached. Check active connections and the service plan limits.'],
 ];
 const group=groups.find(([codes])=>codes.includes(code));
 return group?{code:group[1],error:group[2],diagnostic:code}:{code:'database_connection_failed',error:'Database initialization failed. Check deployment logs for the diagnostic code.',diagnostic:['ER_PARSE_ERROR','ER_TABLE_WITHOUT_PK','ER_CANT_CREATE_TABLE','ER_FK_CANNOT_OPEN_PARENT','ER_TOO_LONG_KEY','ENOENT'].includes(code)?code:'UNCLASSIFIED'};
}
