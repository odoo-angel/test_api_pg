const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const { pool, authenticateJwt, requireRole, generateUUID } = require("./utils");

/**
 * @swagger
 * tags:
 *   - name: Users
 *     description: User management
 */

/**
 * @swagger
 * /api/users:
 *   get:
 *     summary: Get all users
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: A list of users
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 users:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: string }
 *                       email: { type: string }
 *                       firstName: { type: string }
 *                       lastName: { type: string }
 *                       userImage: { type: string }
 *                       role: { type: string }
 *                       isActive: { type: boolean }
 *                       createdAt: { type: string, format: date-time }
 *       403:
 *         description: Forbidden user
 *       500:
 *         description: Server error 
 */
router.get("/", authenticateJwt, requireRole("admin"), async (req, res) => {
  try {
    const [users] = await pool.execute(
      `SELECT id, email, firstName, lastName, userImage, role, isActive, createdAt
         FROM app_users
        ORDER BY createdAt DESC`
    );
    res.json({ users });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/users/{id}:
 *   get:
 *     summary: Get user by ID
 *     description: Retrieve a specific user by their ID
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: User found
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
 *                     createdAt: { type: string, format: date-time }
 *       404:
 *         description: User not found
 */
router.get("/:id", authenticateJwt, async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute(
      `SELECT id, email, firstName, lastName, userImage, role, isActive, createdAt
         FROM app_users
        WHERE id = ?`,
      [id]
    );
    if (rows.length === 0)
      return res.status(404).json({ error: "User not found" });
    res.json({ user: rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/users:
 *   post:
 *     summary: Create a new user (admin)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, firstName, lastName, role]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string, format: password }
 *               firstName: { type: string }
 *               lastName: { type: string }
 *               role: { type: string, enum: [surveyor, reviewer, admin], default: surveyor }
 *               isActive: { type: boolean, default: true }
 *               userImage: { type: string, example: "https://cdn.example.com/u/jane.jpg" }
 *     responses:
 *       201:
 *         description: Created successfully
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
 *                     createdAt: { type: string, format: date-time }
 *       400:
 *         description: Missing required fields or invalid role
 *       409:
 *         description: Email already exists
 *       500:
 *         description: Server error  
 */
router.post("/", authenticateJwt, requireRole("admin"), async (req, res) => {
  // Added password field to request body
  try {
    const {
      email,
      password,
      firstName,
      lastName,
      role = "surveyor",
      isActive = true,
      userImage = null,
    } = req.body;
    if (!firstName || !lastName || !email || !password || !role) {
      return res
        .status(400)
        .json({ error: "firstName, lastName, email, password, and role are required" });
    }
    if (!["surveyor", "reviewer", "admin"].includes(role)) {
      return res
        .status(400)
        .json({ error: "Invalid role. Must be surveyor, reviewer, or admin" });
    }
    
    const pwdHash = await bcrypt.hash(password, 12);
  
    const id = generateUUID();
    const active = !!isActive;
    await pool.execute(
      `INSERT INTO app_users (id, email, firstName, lastName, userImage, passwordHash, role, isActive)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, email, firstName, lastName, userImage, pwdHash, role, active]
    );

    const [rows] = await pool.execute(
      `SELECT id, email, firstName, lastName, userImage, passwordHash, role, isActive, createdAt
         FROM app_users
        WHERE id = ?`,
      [id]
    );
    res.status(201).json({ user: rows[0] });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ error: "Email already exists" });
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/users/{id}:
 *   put:
 *     summary: Update user (self or admin)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email: { type: string, format: email }
 *               firstName: { type: string }
 *               lastName: { type: string }
 *               userImage: { type: string }
 *               role: { type: string, enum: [surveyor, reviewer, admin] }
 *               isActive: { type: boolean }
 *               password: { type: string, format: password, description: "New password (admin only)" }
 *     responses:
 *       200:
 *         description: Updated
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 */
router.put("/:id", authenticateJwt, async (req, res) => {
  try {
    const { id } = req.params;
    const { email, firstName, lastName, role, isActive, userImage, password } =
      req.body;

    const isAdmin = req.jwtUser.role === "admin";
    const isSelf = req.jwtUser.id === id;
    if (!isAdmin && !isSelf) {
      return res
        .status(403)
        .json({ error: "You can only update your own profile" });
    }

    const [exists] = await pool.execute("SELECT id FROM app_users WHERE id = ?", [
      id,
    ]);
    if (exists.length === 0)
      return res.status(404).json({ error: "User not found" });

    const updates = [];
    const values = [];

    if (email) {
      updates.push("email = ?");
      values.push(email);
    }
    if (firstName) {
      updates.push("firstName = ?");
      values.push(firstName);
    }
    if (lastName) {
      updates.push("lastName = ?");
      values.push(lastName);
    }
    if (typeof userImage === "string") {
      updates.push("userImage = ?");
      values.push(userImage);
    }

    if (isAdmin) {
      if (role) {
        if (!["surveyor", "reviewer", "admin"].includes(role)) {
          return res.status(400).json({ error: "Invalid role" });
        }
        updates.push("role = ?");
        values.push(role);
      }
      if (typeof isActive === "boolean") {
        updates.push("isActive = ?");
        values.push(!!isActive);
      }
      // Only admins can change passwords
      if (password) {
        if (typeof password !== "string" || password.length < 6) {
          return res.status(400).json({ error: "Password must be at least 6 characters long" });
        }
        const passwordHash = await bcrypt.hash(password, 12);
        updates.push("passwordHash = ?");
        values.push(passwordHash);
      }
    }

    if (updates.length === 0)
      return res.status(400).json({ error: "No fields to update" });

    values.push(id);
    await pool.execute(
      `UPDATE app_users SET ${updates.join(", ")} WHERE id = ?`,
      values
    );

    const [rows] = await pool.execute(
      `SELECT id, email, firstName, lastName, userImage, role, isActive, createdAt
         FROM app_users
        WHERE id = ?`,
      [id]
    );
    res.json({ user: rows[0] });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ error: "Email already exists" });
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/users/{id}:
 *   delete:
 *     summary: Delete user (admin)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Deleted }
 *       403: { description: Forbidden }
 *       404: { description: Not found }
 */
router.delete(
  "/:id",
  authenticateJwt,
  requireRole("admin"),
  async (req, res) => {
    try {
      const { id } = req.params;
      if (req.jwtUser.id === id)
        return res
          .status(400)
          .json({ error: "Cannot delete your own account" });
      const result = await pool.query("DELETE FROM app_users WHERE id = $1", 
        [id]
      );
      if (result.rowCount === 0)
        return res.status(404).json({ error: "User not found" });
      res.json({ message: "User deleted successfully" });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

module.exports = router;
