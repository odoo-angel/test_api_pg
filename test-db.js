require('dotenv').config();
const { Pool } = require('pg');

// Configuración para Unix Socket (Cloud SQL)
// Detectar si es conexión Unix Socket o TCP
const isUnixSocket = process.env.DB_HOST && process.env.DB_HOST.startsWith('/cloudsql/');

const poolConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
};

// Configurar conexión según el tipo
if (isUnixSocket) {
  // Unix Socket (Cloud SQL en Cloud Run/Cloud Shell)
  poolConfig.host = process.env.DB_HOST;
  console.log('🔌 Modo: Unix Socket');
} else {
  // TCP (desarrollo local o IP pública)
  poolConfig.host = process.env.DB_HOST;
  poolConfig.port = process.env.DB_PORT || 5432;
  
  // SSL solo para TCP
  if (process.env.DB_SSL === 'true') {
    const fs = require('fs');
    const path = require('path');
    poolConfig.ssl = {
      rejectUnauthorized: true,
      ca: fs.readFileSync(path.join(__dirname, 'config', 'ssl', 'server-ca.pem')),
      key: fs.readFileSync(path.join(__dirname, 'config', 'ssl', 'client-key.pem')),
      cert: fs.readFileSync(path.join(__dirname, 'config', 'ssl', 'client-cert.pem')),
    };
    console.log('🔐 SSL Habilitado');
  }
  console.log('🌐 Modo: TCP/IP');
}

console.log('🔍 Configuración del Pool:');
console.log('-----------------------------------');
console.log(`Host (Unix Socket): ${poolConfig.host}`);
console.log(`Database: ${poolConfig.database}`);
console.log(`User: ${poolConfig.user}`);
console.log(`Password: ${poolConfig.password ? '***' + poolConfig.password.slice(-3) : 'Not set'}`);
console.log('-----------------------------------\n');

const pool = new Pool(poolConfig);

async function testConnection() {
  let client;
  
  try {
    console.log('🔌 Intentando conectar via Unix Socket...\n');
    
    // Obtener cliente del pool
    client = await pool.connect();
    console.log('✅ Conexión establecida exitosamente!\n');
    
    // Test 1: Versión de PostgreSQL
    console.log('📊 Test 1: Versión de PostgreSQL');
    const versionResult = await client.query('SELECT version()');
    console.log(`Versión: ${versionResult.rows[0].version}\n`);
    
    // Test 2: Fecha y hora actual del servidor
    console.log('📊 Test 2: Fecha y hora del servidor');
    const timeResult = await client.query('SELECT NOW() as current_time');
    console.log(`Hora actual: ${timeResult.rows[0].current_time}\n`);
    
    // Test 3: Listar tablas existentes
    console.log('📊 Test 3: Tablas en la base de datos');
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    if (tablesResult.rows.length > 0) {
      console.log(`Tablas encontradas (${tablesResult.rows.length}):`);
      tablesResult.rows.forEach(row => {
        console.log(`  - ${row.table_name}`);
      });
    } else {
      console.log('⚠️  No se encontraron tablas en el esquema public');
    }
    console.log('');
    
    // Test 4: Conteo de registros en tablas principales (si existen)
    console.log('📊 Test 4: Conteo de registros');
    const mainTables = ['app_users', 'app_projects', 'app_houses', 'app_activities'];
    
    for (const table of mainTables) {
      try {
        const countResult = await client.query(`SELECT COUNT(*) as count FROM ${table}`);
        console.log(`  ${table}: ${countResult.rows[0].count} registros`);
      } catch (err) {
        console.log(`  ${table}: Tabla no existe o error (${err.message})`);
      }
    }
    console.log('');
    
    // Test 5: Test de escritura (crear y eliminar tabla temporal)
    console.log('📊 Test 5: Test de escritura');
    try {
      await client.query('CREATE TEMP TABLE test_write (id SERIAL, message TEXT)');
      await client.query("INSERT INTO test_write (message) VALUES ('Test Unix Socket')");
      const writeResult = await client.query('SELECT * FROM test_write');
      console.log(`✅ Escritura exitosa: ${writeResult.rows[0].message}`);
      await client.query('DROP TABLE test_write');
    } catch (err) {
      console.log(`❌ Error en escritura: ${err.message}`);
    }
    console.log('');
    
    // Test 6: Información de conexión
    console.log('📊 Test 6: Información de conexión');
    const connInfoResult = await client.query(`
      SELECT 
        inet_server_addr() as server_ip,
        inet_server_port() as server_port,
        pg_backend_pid() as backend_pid,
        current_database() as database,
        current_user as user
    `);
    console.log('Información de conexión:');
    console.log(`  Database: ${connInfoResult.rows[0].database}`);
    console.log(`  User: ${connInfoResult.rows[0].user}`);
    console.log(`  Backend PID: ${connInfoResult.rows[0].backend_pid}`);
    console.log(`  Server IP: ${connInfoResult.rows[0].server_ip || 'Unix Socket (no IP)'}`);
    console.log(`  Server Port: ${connInfoResult.rows[0].server_port || 'Unix Socket (no port)'}`);
    console.log('');
    
    console.log('✅ Todos los tests completados exitosamente!');
    
  } catch (error) {
    console.error('❌ Error en la prueba de conexión:\n');
    console.error('Tipo de error:', error.name);
    console.error('Mensaje:', error.message);
    console.error('Código:', error.code);
    console.error('\nStack trace completo:');
    console.error(error.stack);
    
    console.log('\n💡 Troubleshooting:');
    console.log('1. Verifica que el Cloud SQL Proxy esté corriendo');
    console.log('2. Verifica que la ruta del socket sea correcta');
    console.log('3. Verifica que el servicio tenga permisos para acceder al socket');
    console.log('4. Verifica las credenciales en el archivo .env');
    console.log('5. Para Cloud Run, asegúrate que la instancia esté conectada en el deployment');
    
  } finally {
    // Liberar el cliente de vuelta al pool
    if (client) {
      client.release();
      console.log('\n🔓 Cliente liberado del pool');
    }
    
    // Cerrar el pool
    await pool.end();
    console.log('🔌 Pool de conexiones cerrado');
  }
}

// Manejo de señales para cerrar el pool correctamente
process.on('SIGINT', async () => {
  console.log('\n⚠️  Señal SIGINT recibida, cerrando pool...');
  await pool.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n⚠️  Señal SIGTERM recibida, cerrando pool...');
  await pool.end();
  process.exit(0);
});

// Ejecutar el test
console.log('🚀 Iniciando prueba de conexión PostgreSQL via Unix Socket\n');
testConnection();