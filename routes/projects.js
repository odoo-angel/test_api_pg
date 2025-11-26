const express = require("express");
const router = express.Router();
const { pool, authenticateJwt, requireRole, generateUUID } = require("./utils");

/**
 * @swagger
 * /api/projects:
 *   get:
 *     summary: Get all projects
 *     description: Retrieve a list of all projects with optional filtering by status
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, completed, not_started]
 *         description: Filter by status
 *     responses:
 *       200:
 *         description: List of projects retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 projects:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       title:
 *                         type: string
 *                       housesCompleted:
 *                         type: integer
 *                       totalHouses:
 *                         type: integer
 *                       projectImage:
 *                         type: string
 *                       description:
 *                         type: string
 *                       startDate:
 *                         type: string
 *                         format: date
 *                       status:
 *                         type: string
 *                         enum: [active, completed, not_started]
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       lastUpdatedAt:
 *                         type: string
 *                         format: date-time
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get("/", authenticateJwt, async (req, res) => {
  try {
    const { status } = req.query;
    let query = "SELECT * FROM app_projects WHERE 1=1";
    const params = [];

    if (status) {
      query += " AND status = ?";
      params.push(status);
    }

    query += " ORDER BY createdAt DESC";

    const [projects] = await pool.execute(query, params);
    res.json({ projects });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/projects/{id}:
 *   get:
 *     summary: Get project by ID
 *     description: Retrieve a specific project by its ID
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Project ID
 *     responses:
 *       200:
 *         description: Project retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 project:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     title:
 *                       type: string
 *                     housesCompleted:
 *                       type: integer
 *                     totalHouses:
 *                       type: integer
 *                     projectImage:
 *                       type: string
 *                     description:
 *                       type: string
 *                     startDate:
 *                       type: string
 *                       format: date
 *                     status:
 *                       type: string
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     lastUpdatedAt:
 *                       type: string
 *                       format: date-time
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Project not found
 *       500:
 *         description: Server error
 */
router.get("/:id", authenticateJwt, async (req, res) => {
  try {
    const { id } = req.params;
    const [projects] = await pool.execute(
      "SELECT * FROM app_projects WHERE id = ?",
      [id]
    );
    if (projects.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }
    res.json({ project: projects[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/projects:
 *   post:
 *     summary: Create new project
 *     description: Create a new construction project (admin or reviewer only)
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - totalHouses
 *             properties:
 *               title:
 *                 type: string
 *                 example: Villa del Sol
 *               totalHouses:
 *                 type: integer
 *                 example: 150
 *               housesCompleted:
 *                 type: integer
 *                 default: 0
 *                 example: 0
 *               projectImage:
 *                 type: string
 *                 format: uri
 *                 example: https://example.com/images/villa-del-sol.jpg
 *               description:
 *                 type: string
 *                 example: Luxury residential development with modern amenities
 *               startDate:
 *                 type: string
 *                 format: date
 *                 example: 2024-01-15
 *               status:
 *                 type: string
 *                 enum: [active, completed, not_started]
 *                 default: not_started
 *                 example: active
 *     responses:
 *       201:
 *         description: Project created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 project:
 *                   type: object
 *       400:
 *         description: Invalid input or missing required fields
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin or Reviewer role required
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
        title,
        totalHouses,
        housesCompleted = 0,
        projectImage = null,
        description = null,
        startDate = null,
        status = "not_started",
      } = req.body;

      // Validate required fields
      if (!title || totalHouses === null) {
        return res.status(400).json({
          error: "title and totalHouses are required",
        });
      }

      // Validate status
      if (!["active", "completed", "not_started"].includes(status)) {
        return res.status(400).json({
          error: "Invalid status. Must be active, completed, or not_started",
        });
      }

      // Validate numbers
      if (typeof totalHouses !== "number" || totalHouses < 0) {
        return res
          .status(400)
          .json({ error: "totalHouses must be a non-negative number" });
      }

      if (typeof housesCompleted !== "number" || housesCompleted < 0) {
        return res
          .status(400)
          .json({ error: "housesCompleted must be a non-negative number" });
      }

      if (housesCompleted > totalHouses) {
        return res.status(400).json({
          error: "housesCompleted cannot be greater than totalHouses",
        });
      }

      // Create project
      const projectId = generateUUID();
      await pool.execute(
        `INSERT INTO app_projects (id, title, housesCompleted, totalHouses, projectImage, description, startDate, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          projectId,
          title,
          housesCompleted,
          totalHouses,
          projectImage,
          description,
          startDate,
          status,
        ]
      );

      // Fetch created project
      const [projects] = await pool.execute(
        "SELECT * FROM app_projects WHERE id = ?",
        [projectId]
      );
      res.status(201).json({ project: projects[0] });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * @swagger
 * /api/projects/{id}:
 *   put:
 *     summary: Update project
 *     description: Update project information (admin or reviewer only)
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Project ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               totalHouses:
 *                 type: integer
 *               housesCompleted:
 *                 type: integer
 *               projectImage:
 *                 type: string
 *                 format: uri
 *               description:
 *                 type: string
 *               startDate:
 *                 type: string
 *                 format: date
 *               status:
 *                 type: string
 *                 enum: [active, completed, not_started]
 *     responses:
 *       200:
 *         description: Project updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 project:
 *                   type: object
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin or Reviewer role required
 *       404:
 *         description: Project not found
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
        title,
        totalHouses,
        housesCompleted,
        projectImage,
        description,
        startDate,
        status,
      } = req.body;

      // Check if project exists
      const [existing] = await pool.execute(
        "SELECT * FROM app_projects WHERE id = ?",
        [id]
      );
      if (existing.length === 0) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Build update query
      const updates = [];
      const values = [];

      if (title !== undefined) {
        updates.push("title = ?");
        values.push(title);
      }
      if (totalHouses !== undefined) {
        if (typeof totalHouses !== "number" || totalHouses < 0) {
          return res
            .status(400)
            .json({ error: "totalHouses must be a non-negative number" });
        }
        updates.push("totalHouses = ?");
        values.push(totalHouses);
      }
      if (housesCompleted !== undefined) {
        if (typeof housesCompleted !== "number" || housesCompleted < 0) {
          return res
            .status(400)
            .json({ error: "housesCompleted must be a non-negative number" });
        }
        updates.push("housesCompleted = ?");
        values.push(housesCompleted);
      }
      if (projectImage !== undefined) {
        updates.push("projectImage = ?");
        values.push(projectImage);
      }
      if (description !== undefined) {
        updates.push("description = ?");
        values.push(description);
      }
      if (startDate !== undefined) {
        updates.push("startDate = ?");
        values.push(startDate);
      }
      if (status) {
        if (!["active", "completed", "not_started"].includes(status)) {
          return res.status(400).json({ error: "Invalid status" });
        }
        updates.push("status = ?");
        values.push(status);
      }

      // Validate that housesCompleted doesn't exceed totalHouses
      const currentTotal =
        totalHouses !== undefined ? totalHouses : existing[0].totalHouses;
      const currentCompleted =
        housesCompleted !== undefined
          ? housesCompleted
          : existing[0].housesCompleted;
      if (currentCompleted > currentTotal) {
        return res.status(400).json({
          error: "housesCompleted cannot be greater than totalHouses",
        });
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: "No fields to update" });
      }

      values.push(id);
      await pool.execute(
        `UPDATE app_projects SET ${updates.join(", ")} WHERE id = ?`,
        values
      );

      const [projects] = await pool.execute(
        "SELECT * FROM app_projects WHERE id = ?",
        [id]
      );
      res.json({ project: projects[0] });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * @swagger
 * /api/projects/{id}:
 *   delete:
 *     summary: Delete project
 *     description: Delete a project (admin only)
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Project ID
 *     responses:
 *       200:
 *         description: Project deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Project deleted successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin role required
 *       404:
 *         description: Project not found
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

      // Check if project exists
      const [existing] = await pool.execute(
        "SELECT * FROM app_projects WHERE id = ?",
        [id]
      );
      if (existing.length === 0) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Check if project has houses (optional: prevent deletion if houses exist)
      const [houses] = await pool.execute(
        "SELECT COUNT(*) AS count FROM app_houses WHERE projectId = ?",
        [id]
      );
      if (houses[0].count > 0) {
        return res.status(400).json({
          error:
            "Cannot delete project that has associated houses. Delete houses first or update project status instead.",
        });
      }

    const [deleted] = await pool.execute(
      "DELETE FROM app_projects WHERE id = ? RETURNING id",
      [id]
    );
    if (deleted.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }
    res.json({ message: "Project deleted successfully" });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

module.exports = router;
