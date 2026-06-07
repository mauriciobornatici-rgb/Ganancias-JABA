const mariadb = require('mariadb');
require('dotenv').config();

const maskDatabaseUrl = (databaseUrl) => {
  if (!databaseUrl) return '[DATABASE_URL no configurada]';
  try {
    const parsed = new URL(databaseUrl);
    if (parsed.password) parsed.password = '***';
    return parsed.toString();
  } catch {
    return '[DATABASE_URL invalida]';
  }
};

const parseConnectionString = (url) => {
  if (!url) {
    throw new Error('DATABASE_URL no configurada.');
  }

  const parsed = new URL(url);
  if (parsed.protocol !== 'mysql:' && parsed.protocol !== 'mariadb:') {
    throw new Error('DATABASE_URL debe usar mysql:// o mariadb://.');
  }

  return {
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 3306,
    database: decodeURIComponent(parsed.pathname.replace(/^\/+/, '')),
    allowPublicKeyRetrieval: true,
  };
};

console.log('DATABASE_URL:', maskDatabaseUrl(process.env.DATABASE_URL));
const config = parseConnectionString(process.env.DATABASE_URL);
console.log('Parsed Config:', {
  host: config.host,
  port: config.port,
  user: config.user,
  database: config.database,
  allowPublicKeyRetrieval: config.allowPublicKeyRetrieval,
});

const pool = mariadb.createPool(config);

pool.getConnection()
  .then(conn => {
    console.log("Success! Connected to database.");
    return conn.query("SELECT 1 as test");
  })
  .then(rows => {
    console.log("Query result:", rows);
    return pool.end();
  })
  .catch(err => {
    console.error("Connection failed! Error details:", err);
    process.exit(1);
  });
