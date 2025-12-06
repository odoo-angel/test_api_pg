const express = require("express");
const router = express.Router();
const { pool, authenticateJwt, requireRole, generateUUID } = require("./utils");

/**
 * @swagger
 * /api/activities:
 *   get:
 *     summary: Get all activities
 *     description: Retrieve the master list of all activities ordered by num. Optionally filter by isActive status.
 *     tags: [Activities]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *         description: Filter by active status (true for active, false for inactive)
 *     responses:
 *       200:
 *         description: List of activities retrieved successfully
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get("/", authenticateJwt, async (req, res) => {
  try {
    const { isActive } = req.query;
    let query = `
      SELECT
        id,
        num,
        phase,
        sub_phase AS "subPhase",
        activity,
        dependance,
        description,
        is_active AS "isActive"
      FROM app_activities
      WHERE 1=1`;
    const params = [];

    if (isActive !== undefined) {
      params.push(isActive === "true");
      query += ` AND is_active = $${params.length}`;
    }

    query += " ORDER BY num ASC";

    const { rows } = await pool.query(query, params);
    res.json({ activities: rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/activities/{id}:
 *   get:
 *     summary: Get activity by ID
 *     description: Retrieve a specific activity from the master list
 *     tags: [Activities]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Activity ID
 *     responses:
 *       200:
 *         description: Activity retrieved successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Activity not found
 *       500:
 *         description: Server error
 */
router.get("/:id", authenticateJwt, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `SELECT
         id,
         num,
         phase,
         sub_phase AS "subPhase",
         activity,
         dependance,
         description,
         is_active AS "isActive"
       FROM app_activities
       WHERE id = $1`,
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: "Activity not found" });
    }
    res.json({ activity: rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/activities:
 *   post:
 *     summary: Create new activity
 *     description: Create a new activity in the master list (admin or reviewer only)
 *     tags: [Activities]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - num
 *               - phase
 *               - subPhase
 *             properties:
 *               num:
 *                 type: integer
 *               phase:
 *                 type: string
 *               subPhase:
 *                 type: string
 *               activity:
 *                 type: string
 *               dependance:
 *                 type: array
 *                 items:
 *                   type: string
 *               description:
 *                 type: string
 *               isActive:
 *                 type: boolean
 *                 default: true
 *                 description: Whether the activity is active
 *     responses:
 *       201:
 *         description: Activity created successfully
 *       400:
 *         description: Invalid input or missing required fields
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin or Reviewer role required
 *       409:
 *         description: Activity with this num already exists
 *       500:
 *         description: Server error
 */
router.post(
  "/",
  authenticateJwt,
  requireRole("admin", "reviewer"),
  async (req, res) => {
    try {
      const {
        num,
        phase,
        subPhase,
        dependance,
        activity,
        description,
        isActive = true,
      } = req.body;

      if (!num || !phase || !subPhase || !activity) {
        return res.status(400).json({
          error: "num, phase, subPhase and activity are required",
        });
      }

      const id = generateUUID();
      const dependanceJson = dependance ? JSON.stringify(dependance) : null;
      const isActiveValue =
        typeof isActive === "boolean" ? isActive : true;

      await pool.query(
        `INSERT INTO app_activities (id, num, phase, sub_phase, activity, dependance, description, is_active) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          id,
          num,
          phase,
          subPhase,
          activity,
          dependanceJson,
          description,
          isActiveValue,
        ]
      );

      const { rows } = await pool.query(
        `SELECT
           id,
           num,
           phase,
           sub_phase AS "subPhase",
           activity,
           dependance,
           description,
           is_active AS "isActive"
         FROM app_activities
         WHERE id = $1`,
        [id]
      );
      res.status(201).json({ activity: rows[0] });
    } catch (error) {
      if (error.code === "23505") {
        return res
          .status(409)
          .json({ error: "Activity with this num already exists" });
      }
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * @swagger
 * /api/activities/{id}:
 *   put:
 *     summary: Update activity
 *     description: Update an activity in the master list (admin or reviewer only)
 *     tags: [Activities]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Activity ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               num:
 *                 type: string
 *               phase:
 *                 type: string
 *               subPhase:
 *                 type: string
 *               activity:
 *                 type: string
 *               dependance:
 *                 type: array
 *                 items:
 *                   type: string
 *               description:
 *                 type: string
 *               isActive:
 *                 type: boolean
 *                 description: Whether the activity is active
 *     responses:
 *       200:
 *         description: Activity updated successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin or Reviewer role required
 *       404:
 *         description: Activity not found
 *       409:
 *         description: Activity with this num already exists
 *       500:
 *         description: Server error
 */
router.put(
  "/:id",
  authenticateJwt,
  requireRole("admin", "reviewer"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const {
        num,
        phase,
        subPhase,
        activity,
        dependance,
        description,
        isActive,
      } = req.body;

      // Validate required fields
      if (!num || !phase || !subPhase || !activity) {
        return res.status(400).json({
          error: "num, phase, subPhase and activity are required",
        });
      }

      // Check if activity exists
      const { rows: existing } = await pool.query(
        "SELECT id FROM app_activities WHERE id = $1",
        [id]
      );
      if (existing.length === 0) {
        return res.status(404).json({ error: "Activity not found" });
      }

      // Build update query
      const updates = [];
      const values = [];

      if (num !== undefined) {
        values.push(num);
        updates.push(`num = $${values.length}`);
      }
      if (phase) {
        values.push(phase);
        updates.push(`phase = $${values.length}`);
      }
      if (subPhase) {
        values.push(subPhase);
        updates.push(`sub_phase = $${values.length}`);
      }

      if (activity !== undefined) {
        values.push(activity);
        updates.push(`activity = $${values.length}`);
      }

      if (dependance !== undefined) {
        values.push(dependance ? JSON.stringify(dependance) : null);
        updates.push(`dependance = $${values.length}`);
      }
      if (description !== undefined) {
        values.push(description);
        updates.push(`description = $${values.length}`);
      }
      if (typeof isActive === "boolean") {
        values.push(isActive);
        updates.push(`is_active = $${values.length}`);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: "No fields to update" });
      }

      values.push(id);
      await pool.query(
        `UPDATE app_activities SET ${updates.join(", ")} WHERE id = $${values.length}`,
        values
      );

      const { rows } = await pool.query(
        `SELECT
           id,
           num,
           phase,
           sub_phase AS "subPhase",
           activity,
           dependance,
           description,
           is_active AS "isActive"
         FROM app_activities
         WHERE id = $1`,
        [id]
      );
      res.json({ activity: rows[0] });
    } catch (error) {
      if (error.code === "23505") {
        return res
          .status(409)
          .json({ error: "Activity with this num already exists" });
      }
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * @swagger
 * /api/activities/{id}:
 *   delete:
 *     summary: Delete activity
 *     description: Delete an activity from the master list (admin only, cannot delete if referenced by house activities)
 *     tags: [Activities]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Activity ID
 *     responses:
 *       200:
 *         description: Activity deleted successfully
 *       400:
 *         description: Cannot delete activity referenced by house activities
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin role required
 *       404:
 *         description: Activity not found
 *       500:
 *         description: Server error
 */
router.delete(
  "/:id",
  authenticateJwt,
  requireRole("admin"),
  async (req, res) => {
    try {
      const { id } = req.params;

      // Check if any house_activities reference this activity
      const { rows: houseActivities } = await pool.query(
        "SELECT COUNT(*)::int AS count FROM app_house_activities WHERE activity_id = $1",
        [id]
      );

      if (houseActivities[0].count > 0) {
        return res.status(400).json({
          error:
            "Cannot delete activity that is referenced by house activities",
        });
      }

      const { rows: deleted } = await pool.query(
        "DELETE FROM app_activities WHERE id = $1 RETURNING id",
        [id]
      );
      if (deleted.length === 0) {
        return res.status(404).json({ error: "Activity not found" });
      }
      res.json({ message: "Activity deleted successfully" });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

module.exports = router;
