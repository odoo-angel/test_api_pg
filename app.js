require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const passport = require('passport');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');
const { pool, generateUUID } = require('./routes/utils');
const bcrypt = require('bcryptjs');

// Import route modules
const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const projectsRoutes = require('./routes/projects');
const housesRoutes = require('./routes/houses');
const activitiesRoutes = require('./routes/activities');
const houseActivitiesRoutes = require('./routes/house-activities');
const imagesRoutes = require('./routes/images');

const app = express();
const PORT = process.env.PORT || 3000;

// Swagger configuration
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'CreekSide Express API',
      version: '1.0.0',
      description: 'API documentation for CreekSide Express Server',
      contact: {
        name: 'API Support',
        email: 'support@creekside.com'
      }
    },
    servers: [
      {
        url: `http://localhost:${PORT}`,
        description: 'Development server'
      },
      {
        url: 'https://your-production-url.com',
        description: 'Production server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter JWT token obtained from /auth/login or /auth/register'
        }
      }
    },
    security: [
      {
        bearerAuth: []
      }
    ]
  },
  apis: ['./app.js', './routes/*.js'] // Path to the API files
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-this',
  resave: false,
  saveUninitialized: false
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Passport serialization (needed for session-based auth)
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const [users] = await pool.execute('SELECT * FROM app_users WHERE id = $1', [id]);
    done(null, users.rows[0]);
  } catch (error) {
    done(error, null);
  }
});

// Swagger UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'CreekSide API Documentation'
}));

// Verify database connection and create default admin user
async function initializeDatabase() {
  try {
    // Test database connection
    await pool.query('SELECT 1');
    console.log('✅ Connected to PostgreSQL database');

    // Create default admin user if it doesn't exist
    const defaultAdminEmail = process.env.DEFAULT_ADMIN_EMAIL || 'admin@creekside.com';
    const defaultAdminPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';
    const defaultAdminFirstName = process.env.DEFAULT_ADMIN_FIRST_NAME || 'Admin';
    const defaultAdminLastName = process.env.DEFAULT_ADMIN_LAST_NAME || 'User';

    // Check if admin user exists
    const [existingUsers] = await pool.query(
      'SELECT * FROM app_users WHERE email = $1',
      [defaultAdminEmail]
    );

    if (existingUsers.rows.length === 0) {
      // Create default admin user
      const adminId = generateUUID();
      const passwordHash = await bcrypt.hash(defaultAdminPassword, 12);

      await pool.query(
        `INSERT INTO app_users 
         (id, email, first_name, last_name, password_hash, role, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [adminId, defaultAdminEmail, defaultAdminFirstName, defaultAdminLastName, passwordHash, 'admin', 1]
      );

      console.log('✅ Default admin user created');
      console.log(`   Email: ${defaultAdminEmail}`);
      console.log(`   Password: ${defaultAdminPassword}`);
      console.log('   ⚠️  Please change the default password after first login!');
    } else {
      console.log('✅ Default admin user already exists');
    }
  } catch (err) {
    console.error('❌ Database initialization error:', err.message);
    // Don't exit the process, but log the error
  }
}

// Routes
/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check endpoint
 *     description: Check if the server and database are running properly
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Server is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: healthy
 *                 database:
 *                   type: string
 *                   example: connected
 *                 data:
 *                   type: object
 *       500:
 *         description: Server is unhealthy
 */
app.get('/health', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT 1 as healthy');
    res.json({ status: 'healthy', database: 'connected', data: rows[0] });
  } catch (error) {
    res.status(500).json({ status: 'unhealthy', error: error.message });
  }
});

// Routes
app.use('/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api/houses', housesRoutes);
app.use('/api/activities', activitiesRoutes);
app.use('/api/house-activities', houseActivitiesRoutes);
app.use('/api/images', imagesRoutes);

// Root route
app.get('/', (req, res) => {
  res.json({
    message: 'CreekSide Express API Server',
    documentation: '/api-docs',
    endpoints: {
      health: '/health',
      auth: {
        register: 'POST /auth/register',
        login: 'POST /auth/login',
        me: 'GET /auth/me',
        google_oauth: 'GET /auth/google',
        profile: 'GET /auth/profile',
        logout: 'GET /auth/logout'
      },
      api: {
        users: '/api/users',
        projects: '/api/projects',
        houses: '/api/houses',
        activities: '/api/activities',
        house_activities: '/api/house-activities',
        images: '/api/images'
      }
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server after database initialization
async function startServer() {
  try {
    // Initialize database (create admin user if needed)
    await initializeDatabase();
    
    // Start the server
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📍 Visit http://localhost:${PORT} to see the API`);
      console.log(`📚 Swagger UI available at http://localhost:${PORT}/api-docs`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
}

// Start the server
startServer();

module.exports = app;
