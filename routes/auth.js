const express = require("express");
const router = express.Router();
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const bcrypt = require("bcryptjs");
const {
  pool,
  generateJwtToken,
  authenticateJwt,
  generateUUID,
} = require("./utils");

// Helper: DB row -> API user shape (now includes userImage)
function toUser(row) {
  return {
    id: row.id,
    email: row.email,
    firstName: row.firstName || "",
    lastName: row.lastName || "",
    userImage: row.userImage || "",
    role: row.role,
    isActive: !!row.isActive,
  };
}

// Helper: get user by ID
async function getUserById(id) {
  const [rows] = await pool.execute(
    `SELECT id, email, firstName, lastName, userImage, role, isActive
     FROM app_users WHERE id = ?`,
    [id]
  );
  return rows[0] || null;
}

// ──────────────────────────────────────────────────────────────
// Google OAuth (unchanged flow; now captures/stores photo as userImage)
// ──────────────────────────────────────────────────────────────
if (!passport._strategies.google) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: "/auth/google/callback",
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email =
            profile.emails?.[0]?.value;
          if (!email)
            return done(new Error("Google profile missing email"), null);

          const [existing] = await pool.execute(
            "SELECT * FROM app_users WHERE email = ?",
            [email]
          );
          if (existing.length > 0) return done(null, existing[0]);

          const first =
            profile.name?.givenName || "";
          const last =
            profile.name?.familyName || "";
          const photo =
            profile.photos?.[0]?.value || null;

          const id = generateUUID();
          await pool.execute(
            `INSERT INTO app_users (id, email, firstName, lastName, userImage, role, isActive)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [id, email, first, last, photo, "surveyor", 1]
          );

          const user = await getUserById(id);
          return done(null, user);
        } catch (err) {
          return done(err, null);
        }
      }
    )
  );
}

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register a new user
 *     description: Creates a new user (or upgrades an OAuth-only user) and returns a JWT.
 *     tags: [Authentication]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [firstName, lastName, email, password, role]
 *             properties:
 *               firstName: { type: string, example: "John" }
 *               lastName:  { type: string, example: "Doe" }
 *               email:      { type: string, format: email, example: "john@example.com" }
 *               password:   { type: string, format: password, example: "password123" }
 *               role:       { type: string, enum: [surveyor, reviewer, admin], example: "surveyor" }
 *               isActive:  { type: boolean, example: true }
 *               userImage: { type: string, example: "https://cdn.example.com/u/john.jpg" }
 *     responses:
 *       201:
 *         description: Registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token: { type: string }
 *                 user:
 *                   type: object
 *                   properties:
 *                     id: { type: string }
 *                     email: { type: string }
 *                     firstName: { type: string }
 *                     lastName: { type: string }
 *                     userImage: { type: string }
 *                     role: { type: string }
 *                     isActive: { type: boolean }
 *       400:
 *         description: Missing required fields or invalid role
 *       409:
 *         description: Email already registered
 *       500:
 *         description: Server error
 */
router.post("/register", async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      password,
      role,
      isActive = true,
      userImage = null,
    } = req.body || {};
    if (!firstName || !lastName || !email || !password || !role) {
      return res.status(400).json({
        error: "firstName, lastName, email, password, and role are required",
      });
    }
    // security problem: admin role assignment should be restricted
    if (!["surveyor", "reviewer", "admin"].includes(role)) {
      return res
        .status(400)
        .json({ error: "Invalid role. Must be surveyor, reviewer, or admin" });
    }

    const [byEmail] = await pool.execute(
      "SELECT * FROM app_users WHERE email = ?",
      [email]
    );
    const pwdHash = await bcrypt.hash(password, 12);
    let id;

    if (byEmail.length > 0 && byEmail[0].passwordHash) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const active = !!isActive;

    if (byEmail.length > 0) {
      // Upgrade existing OAuth-only row
      id = byEmail[0].id;
      await pool.execute(
        `UPDATE app_users
           SET firstName = ?, lastName = ?, userImage = ?, passwordHash = ?, role = ?, isActive = ?
         WHERE id = ?`,
        [ firstName, lastName, userImage, pwdHash, role, active, id ]
      );
    } else {
      id = generateUUID();
      await pool.execute(
        `INSERT INTO app_users 
        (id, email, firstName, lastName, userImage, passwordHash, role, isActive)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          email,
          firstName,
          lastName,
          userImage,
          pwdHash,
          role,
          active
        ]
      );
    }

    const user = await getUserById(id);
    const token = generateJwtToken(user);
    return res.status(201).json({ token, user: toUser(user) });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login with email and password
 *     tags: [Authentication]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string, format: password }
 *     responses:
 *       200:
 *         description: Logged in successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token: { type: string }
 *                 user:
 *                   type: object
 *                   properties:
 *                     id: { type: string }
 *                     email: { type: string }
 *                     firstName: { type: string }
 *                     lastName: { type: string }
 *                     userImage: { type: string }
 *                     role: { type: string }
 *                     isActive: { type: boolean }
 *
 *       400:
 *         description: Missing required fields or invalid role
 *      401:
 *         description: Invalid credentials
 *      403:
 *         description: Account is inactive
 *       500:
 *         description: Server error
 */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password)
      return res.status(400).json({ error: "Email and password are required" });

    const [rows] = await pool.execute("SELECT * FROM app_users WHERE email = ?", [
      email
    ]);
    if (rows.length === 0 || !rows[0].passwordHash)
      return res.status(401).json({ error: "Invalid credentials" });

    // Optional: block inactive accounts
    if (!rows[0].isActive) 
      return res.status(403).json({ error: 'Account is inactive' });

    const ok = await bcrypt.compare(password, rows[0].passwordHash);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    const token = generateJwtToken(rows[0]);
    return res.json({ token, user: toUser(rows[0]) });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: Get current user information
 *     description: Returns the authenticated user's information based on the JWT
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user info
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   type: object
 *                   properties:
 *                     id: { type: string }
 *                     email: { type: string }
 *                     firstName: { type: string }
 *                     lastName: { type: string }
 *                     userImage: { type: string }
 *                     role: { type: string }
 *                     isActive: { type: boolean }
 *       401:
 *         description: Unauthorized - invalid or missing token
 */
router.get("/me", authenticateJwt, async (req, res) => {
  try {
    const user = await getUserById(req.jwtUser.id);
    if (!user)
      return res.status(404).json({ error: "User not found" });
    return res.json({ user: toUser(user) });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

/**
 * @swagger
 * /auth/google:
 *   get:
 *     summary: Start Google OAuth
 *     tags: [Authentication]
 *     security: []
 *     responses:
 *       302:
 *         description: Redirect to Google
 */
router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

/**
 * @swagger
 * /auth/google/callback:
 *   get:
 *     summary: Google OAuth callback
 *     tags: [Authentication]
 *     security: []
 *     responses:
 *       200:
 *         description: Google OAuth login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                 user:
 *                   type: object
 *       401:
 *         description: Authentication failed
 */
router.get(
  "/google/callback",
  passport.authenticate("google", { session: false, failureRedirect: "/login" }),
  (req, res) => {
    const token = generateJwtToken(req.user);
    return res.json({ token, user: toUser(req.user) });
  }
);

/**
 * @swagger
 * /auth/profile:
 *   get:
 *     summary: Get current user via JWT
 *     description: Returns the current authenticated user using JWT authentication.
 *     tags: [Authentication]
 *     security: 
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user profile (session)
 *       401:
 *         description: Not authenticated
 */
router.get("/profile", authenticateJwt, async (req, res) => {
  const user = await getUserById(req.jwtUser.id);
  if (!user) 
    return res.status(404).json({ error: "User not found" });
  return res.json({ user: toUser(user) });
});

/**
 * @swagger
 * /auth/logout:
 *   get:
 *     summary: Logout (passport session)
 *     tags: [Authentication]
 *     security: []
 *     responses:
 *       200:
 *         description: Logged out
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *       500:
 *         description: Error logging out
 */
router.get("/logout", (req, res) => {
  req.logout((err) => {
    if (err) return res.status(500).json({ error: "Error logging out" });
    res.json({ message: "Logged out successfully" });
  });
});

module.exports = router;
