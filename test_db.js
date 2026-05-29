const mariadb = require('mariadb');
require('dotenv').config();

console.log("DATABASE_URL:", process.env.DATABASE_URL);

const parseConnectionString = (url) => {
  const regex = /^(?:mysql|mariadb):\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)$/;
  const match = url.match(regex);
  if (match) {
    return {
      user: match[1],
      password: match[2],
      host: match[3],
      port: parseInt(match[4], 10),
      database: match[5]
    };
  }
  return null;
};

const config = parseConnectionString(process.env.DATABASE_URL);
if (config) {
  config.allowPublicKeyRetrieval = true;
}
console.log("Parsed Config:", config);

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
