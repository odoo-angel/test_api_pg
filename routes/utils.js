require('dotenv').config();
const { Pool } = require('pg'); 
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const humps = require('humps');

// SSL config
let sslConfig = false;

if (process.env.DB_SSL === "true") {
  try {
    const sslDir = path.join(__dirname, "..", "config", "ssl");
    sslConfig = {
      rejectUnauthorized: true,
      ca: fs.readFileSync(path.join(sslDir, "server-ca.pem"), "utf8"),
      key: fs.readFileSync(path.join(sslDir, "client-key.pem"), "utf8"),
      cert: fs.readFileSync(path.join(sslDir, "client-cert.pem"), "utf8"),
    };
    console.log("SSL ENABLED");
  } catch (err) {
    console.error("SSL ERROR:", err.message);
    sslConfig = false;
  }
}

// PostgreSQL pool
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: sslConfig,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// camelCase → snake_case
function camelToSnake(str) {
  return str.replace(/[A-Z]/g, (l) => `_${l.toLowerCase()}`);
}

const SQL_KEYWORDS = new Set([
  "select","insert","update","delete","where","from","into","values","set",
  "on","and","or","not","null","is","in","as","returning","order","by",
  "group","limit","offset","inner","left","right","join","true","false",
]);

function camelToSnakeCaseInQuery(sql) {
  return sql.replace(/\b([a-z][a-zA-Z0-9]*)\b/g, (m) => {
    const lower = m.toLowerCase();
    if (SQL_KEYWORDS.has(lower)) return m;
    if (m.includes("_")) return m;
    if (lower === m) return m;
    return camelToSnake(m);
  });
}

// execute wrapper
pool.execute = async function (text, params) {
  let i = 1;
  const replaced = text.replace(/\?/g, () => `$${i++}`);
  const quoted = replaced.replace(/`/g, '"');
  const finalSql = camelToSnakeCaseInQuery(quoted);

  console.log("SQL:", finalSql);

  try {
    const res = await pool.query(finalSql, params || []);
    return [humps.camelizeKeys(res.rows), res.fields];
  } catch (err) {
    console.error("SQL ERROR:", err.message);
    throw err;
  }
};

// JWT
const JWT_SECRET = process.env.JWT_SECRET;

function generateJwtToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

// JWT auth
async function authenticateJwt(req, res, next) {
  try {
    const auth = req.headers["authorization"] || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;

    if (!token) {
      return res.status(401).json({ error: "Missing token" });
    }

    const payload = jwt.verify(token, JWT_SECRET);

    const [users] = await pool.execute(
      "SELECT * FROM app_users WHERE id = ?",
      [payload.id]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: "Invalid token user" });
    }

    req.jwtUser = users[0];
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// role check
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.jwtUser) {
      return res.status(401).json({ error: "Auth required" });
    }
    if (!roles.includes(req.jwtUser.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}

function generateUUID() {
  return uuidv4();
}

module.exports = {
  pool,
  generateJwtToken,
  authenticateJwt,
  requireRole,
  generateUUID,
};
