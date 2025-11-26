require("dotenv").config();
const { Pool } = require("pg");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");
const path = require("path");
const humps = require("humps");

const isUnixSocket = process.env.DB_HOST && process.env.DB_HOST.startsWith("/cloudsql/");

// SSL
let sslConfig = false;

if (process.env.DB_SSL === "true" && !isUnixSocket) {
  try {
    const sslDir = path.join(__dirname, "..", "config", "ssl");
    sslConfig = {
      rejectUnauthorized: true,
      ca: fs.readFileSync(path.join(sslDir, "server-ca.pem"), "utf8"),
      key: fs.readFileSync(path.join(sslDir, "client-key.pem"), "utf8"),
      cert: fs.readFileSync(path.join(sslDir, "client-cert.pem"), "utf8"),
    };
    console.log("[DB] SSL ENABLED");
  } catch (err) {
    console.error("[DB] SSL ERROR:", err.message);
    sslConfig = false;
  }
}

const poolConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
};

if (isUnixSocket) {
  poolConfig.host = process.env.DB_HOST; 
  console.log("[DB] Using Unix socket:", process.env.DB_HOST);
} else {
  poolConfig.host = process.env.DB_HOST;
  poolConfig.port = process.env.DB_PORT || 5432;
  poolConfig.ssl = sslConfig;
  console.log(
    "[DB] Using TCP host:",
    process.env.DB_HOST,
    "SSL enabled:",
    !!sslConfig
  );
}

const pool = new Pool(poolConfig);

// Manejar errores del pool
pool.on('error', (err, client) => {
  console.error('❌ Unexpected pool error:', err);
});

pool.on('connect', (client) => {
  console.log('✅ Nueva conexión a BD establecida');
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

  if (process.env.NODE_ENV !== "production") {
    console.log("SQL:", finalSql);
  }

  const res = await pool.query(finalSql, params || []);
  return [humps.camelizeKeys(res.rows), res.fields];
};

// JWT
const JWT_SECRET = process.env.JWT_SECRET;

function generateJwtToken(user) {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET no esta configurado');
  }

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

// Helper to test DB connection
async function testConnection() {
  try {
    const result = await pool.query('SELECT NOW() as now, version()');
    console.log('Conexin a BD exitosa');
    console.log('Server time:', result.rows[0].now);
    return true;
  } catch (error) {
    console.error('Error de conexion a BD:', error.message);
    return false;
  }
}

module.exports = {
  pool,
  generateJwtToken,
  authenticateJwt,
  requireRole,
  generateUUID,
};
