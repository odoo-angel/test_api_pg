require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const sslConfig = {
    rejectUnauthorized: true, 
    ca: fs.readFileSync(path.join(__dirname, 'config', 'ssl', 'server-ca.pem')).toString(),
    key: fs.readFileSync(path.join(__dirname, 'config', 'ssl', 'client-key.pem')).toString(),
    cert: fs.readFileSync(path.join(__dirname, 'config', 'ssl', 'client-cert.pem')).toString(),
    checkServerIdentity: () => undefined
};

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user:  process.env.DB_USER,         
  password: process.env.DB_PASSWORD, 
  ssl: sslConfig,            
  connectionTimeoutMillis: 5000 
});

async function testConnection() {
  console.log('Intentando conectar a Google Cloud SQL (PostgreSQL)...');
  console.log(`Host: 34.60.76.101`);
  
  try {
    const client = await pool.connect();
    console.log('Conexion exitosa!');
    
    const res = await client.query('SELECT NOW() as now, version()');
    console.log('Hora del servidor:', res.rows[0].now);
    console.log('ℹVersión:', res.rows[0].version);
    
    client.release();
    await pool.end();
  } catch (err) {
    console.error('❌ Error de conexión:');
    if (err.code === 'ETIMEDOUT') {
        console.error('TIMEOUT: Tu IP no está autorizada en Google Cloud Console.');
        console.error('   Ve a SQL > Conexiones > Redes y agrega tu IP actual.');
    } else if (err.code === '28P01') {
        console.error('Error de Autenticación (Password incorrecto).');
    } else if (err.code === '28000') {
        console.error('Usuario "angel" no existe o SSL requerido.');
    } else if (err.code === 'ENOENT') {
        console.error('No encuentro los archivos de certificado SSL en la carpeta config/ssl/');
        console.error('   Detalle:', err.message);
    } else {
        console.error(err);
    }
  }
}

testConnection();