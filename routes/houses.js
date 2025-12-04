const express = require("express");
const router = express.Router();
const { pool, authenticateJwt, requireRole, generateUUID } = require("./utils");

/**
 * @swagger
 * /api/houses:
 *   get:
 *     summary: Get all houses
 *     description: Retrieve a list of all houses with optional filtering by projectId, coto, or status. Optionally include project details with join.
 *     tags: [Houses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: projectId
 *         schema:
 *           type: string
 *         description: Filter by project ID
 *       - in: query
 *         name: includeProject
 *         schema:
 *           type: boolean
 *         description: Include project details in response (join with projects table)
 *       - in: query
 *         name: coto
 *         schema:
 *           type: string
 *         description: Filter by coto name
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [in_progress, completed, delayed]
 *         description: Filter by status
 *     responses:
 *       200:
 *         description: List of houses retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 houses:
 *                   type: array
 *                   items:
 *                     type: object
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get("/", authenticateJwt, async (req, res) => {
  try {
    const { projectId, coto, status, includeProject } = req.query;
    const includeProjectData =
      includeProject === "true" || includeProject === true;

    const params = [];
    let query;

    if (includeProjectData) {
      query = `
        SELECT
          h.id,
          h.project_id AS "projectId",
          h.coto,
          h.name AS "houseName",
          h.model,
          h.status,
          h.progress,
          h.description,
          h.house_image AS "houseImage",
          h.m2const,
          h.completed_activities AS "completedActivities",
          h.total_activities AS "totalActivities",
          h.created_at AS "createdAt",
          h.updated_at AS "updatedAt",
          p.id AS "projectDataId",
          p.title AS "projectTitle",
          p.houses_completed AS "projectHousesCompleted",
          p.total_houses AS "projectTotalHouses",
          p.project_image AS "projectProjectImage",
          p.description AS "projectDescription",
          p.start_date AS "projectStartDate",
          p.status AS "projectStatus",
          p.created_at AS "projectCreatedAt"
        FROM app_houses h
        LEFT JOIN app_projects p ON h.project_id = p.id
        WHERE 1=1
      `;
    } else {
      query = `
        SELECT
          id,
          project_id AS "projectId",
          coto,
          name AS "houseName",
          model,
          status,
          progress,
          description,
          house_image AS "houseImage",
          m2const,
          completed_activities AS "completedActivities",
          total_activities AS "totalActivities",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM app_houses
        WHERE 1=1
      `;
    }

    if (projectId) {
      params.push(projectId);
      query += includeProjectData
        ? ` AND h.project_id = $${params.length}`
        : ` AND project_id = $${params.length}`;
    }
    if (coto) {
      params.push(coto);
      query += includeProjectData
        ? ` AND h.coto = $${params.length}`
        : ` AND coto = $${params.length}`;
    }
    if (status) {
      params.push(status);
      query += includeProjectData
        ? ` AND h.status = $${params.length}`
        : ` AND status = $${params.length}`;
    }

    query += includeProjectData
      ? " ORDER BY h.created_at DESC"
      : " ORDER BY created_at DESC";

    const { rows } = await pool.query(query, params);
    
    if (includeProjectData) {
      const transformedHouses = rows.map((house) => {
        const result = {
          id: house.id,
          projectId: house.projectId,
          coto: house.coto,
          houseName: house.houseName,
          model: house.model,
          status: house.status,
          progress: house.progress,
          description: house.description,
          houseImage: house.houseImage,
          m2const: house.m2const,
          // completedActivities: house.completedActivities,
          // totalActivities: house.totalActivities,
          // createdAt: house.createdAt,
          updatedAt: house.updatedAt,
          projectName: house.projectTitle,
        };

        if (house.projectDataId) {
          result.projectData = {
            id: house.projectDataId,
            title: house.projectTitle,
            housesCompleted: house.projectHousesCompleted,
            totalHouses: house.projectTotalHouses,
            projectImage: house.projectProjectImage,
            description: house.projectDescription,
            startDate: house.projectStartDate,
            status: house.projectStatus,
            createdAt: house.projectCreatedAt,
          };
        }

        return result;
      });
      return res.json({ houses: transformedHouses });
    }

    res.json({ houses: rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/houses/stats:
 *   get:
 *     summary: Get house statistics
 *     description: Returns total houses, completed houses, and active (not completed) houses.
 *     tags: [Houses]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: House stats retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 stats:
 *                   type: object
 *                   properties:
 *                     totalHouses:
 *                       type: integer
 *                     completedHouses:
 *                       type: integer
 *                     activeHouses:
 *                       type: integer
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get("/stats", authenticateJwt, async (req, res) => {
  try {
    // added stats routes: added quotation marks to alias names to avoid camelCase conversion issues
    const query = `
      SELECT
        COUNT(*) AS "totalHouses",
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS "completedHouses",
        SUM(CASE WHEN status <> 'completed' THEN 1 ELSE 0 END) AS "activeHouses"
      FROM app_houses
    `;
    // added stats routes: change to pool.query, from pool.execute to avoid camelCase conversion issues
    const { rows } = await pool.query(query);
    const stats = rows[0] || {
      totalHouses: 0,
      completedHouses: 0,
      activeHouses: 0,
    };

    res.json({ stats });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/houses/{id}:
 *   get:
 *     summary: Get house by ID
 *     description: Retrieve a specific house by its ID. Optionally include project details with join.
 *     tags: [Houses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: House ID
 *       - in: query
 *         name: includeProject
 *         schema:
 *           type: boolean
 *         description: Include project details in response (join with projects table)
 *     responses:
 *       200:
 *         description: House retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 house:
 *                   type: object
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: House not found
 *       500:
 *         description: Server error
 */
router.get("/:id", authenticateJwt, async (req, res) => {
  try {
    const { id } = req.params;
    const { includeProject } = req.query;
    const includeProjectData =
      includeProject === "true" || includeProject === true;

    let query;
    const params = [id];

    if (includeProjectData) {
      query = `
        SELECT
          h.id,
          h.project_id AS "projectId",
          h.coto,
          h.name AS "houseName",
          h.model,
          h.status,
          h.progress,
          h.description,
          h.house_image AS "houseImage",
          h.m2const,
          h.completed_activities AS "completedActivities",
          h.total_activities AS "totalActivities",
          h.created_at AS "createdAt",
          h.updated_at AS "updatedAt",
          p.id AS "projectDataId",
          p.title AS "projectTitle",
          p.houses_completed AS "projectHousesCompleted",
          p.total_houses AS "projectTotalHouses",
          p.project_image AS "projectProjectImage",
          p.description AS "projectDescription",
          p.start_date AS "projectStartDate",
          p.status AS "projectStatus",
          p.created_at AS "projectCreatedAt"
        FROM app_houses h
        LEFT JOIN app_projects p ON h.project_id = p.id
        WHERE h.id = $1
      `;
    } else {
      query = `
        SELECT
          id,
          project_id AS "projectId",
          coto,
          name AS "houseName",
          model,
          status,
          progress,
          description,
          house_image AS "houseImage",
          m2const,
          completed_activities AS "completedActivities",
          total_activities AS "totalActivities",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM app_houses
        WHERE id = $1
      `;
    }

    const { rows } = await pool.query(query, params);
    if (rows.length === 0) {
      return res.status(404).json({ error: "House not found" });
    }

    // Transform result if project is included
    if (includeProjectData) {
      const house = rows[0];
      const result = {
        id: house.id,
        projectId: house.projectId,
        coto: house.coto,
        houseName: house.houseName,
        model: house.model,
        status: house.status,
        progress: house.progress,
        description: house.description,
        houseImage: house.houseImage,
        m2const: house.m2const,
        completedActivities: house.completedActivities,
        totalActivities: house.totalActivities,
        createdAt: house.createdAt,
        updatedAt: house.updatedAt,
      };

      if (house.projectDataId) {
        result.project = {
          id: house.projectDataId,
          title: house.projectTitle,
          housesCompleted: house.projectHousesCompleted,
          totalHouses: house.projectTotalHouses,
          projectImage: house.projectProjectImage,
          description: house.projectDescription,
          startDate: house.projectStartDate,
          status: house.projectStatus,
          createdAt: house.projectCreatedAt,
        };
      }

      return res.json({ house: result });
    }

    res.json({ house: rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/houses:
 *   post:
 *     summary: Create new house
 *     description: Create a new house and auto-generate house_activities based on the master activities list (only active activities are used). If the house is created with status 'completed' and has a projectId, the project's housesCompleted count is automatically updated.
 *     tags: [Houses]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               projectId:
 *                 type: string
 *                 format: uuid
 *                 example: 123e4567-e89b-12d3-a456-426614174000
 *                 description: Project ID (foreign key to projects table)
 *               coto:
 *                 type: string
 *                 example: Coto 1
 *               name:
 *                 type: string
 *                 example: House 101
 *               houseName:
 *                 type: string
 *                 example: House 101
 *               model:
 *                 type: string
 *                 example: Model X
 *               status:
 *                 type: string
 *                 enum: [in_progress, completed, delayed]
 *                 default: in_progress
 *               description:
 *                 type: string
 *                 example: A beautiful house with modern design
 *               houseImage:
 *                 type: string
 *                 example: https://example.com/house.jpg
 *               m2const:
 *                 type: number
 *                 example: 120.5
 *                 description: Construction area in square meters
 *     responses:
 *       201:
 *         description: House created successfully with auto-generated activities
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 house:
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
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      
      const {
        projectId,
        coto,
        name,
        houseName,
        model,
        status = "in_progress",
        description,
        houseImage,
        m2const,
      } = req.body;

      // Use houseName if provided, otherwise use name
      const finalName = houseName || name;
      if (!finalName) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "name or houseName is required" });
      }

      if (!["in_progress", "completed", "delayed"].includes(status)) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Invalid status" });
      }

      // Validate projectId exists if provided
      if (projectId) {
        const { rows: projects } = await client.query(
          "SELECT id FROM app_projects WHERE id = $1",
          [projectId]
        );
        if (projects.length === 0) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: "Project not found" });
        }
      }

      // Create house
      const houseId = generateUUID();
      await client.query(
        `INSERT INTO app_houses
          (id, project_id, coto, name, model, status, progress, description, house_image, m2const, completed_activities, total_activities)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          houseId,
          projectId || null,
          coto || null,
          finalName || null,
          model || null,
          status,
          0.0, //progress
          description || null,
          houseImage || null,
          m2const || null,
          0, // comopleted_activities
          0, // total_activities
        ]
      );

      // Get all active activities from master list
      // Fixed bug: changed is_active to TRUE for proper boolean comparison
      const { rows: activities } = await client.query(
        "SELECT * FROM app_activities WHERE is_active = TRUE ORDER BY num ASC"
      );

      if (!activities || activities.length === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          error:
            "No active activities found in master list. Please create active activities first.",
        });
      }

      // Generate house_activities for this house
      const totalActivities = activities.length;
      const openDate = new Date();

      // Create house_activities for each activity in the master list
      // Using prepared statement for better performance and security
      const insertHouseActivityQuery = `
        INSERT INTO app_house_activities
          (id, activity_id, num, phase, sub_phase, activity, dependance, description, open_date, status, house_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`;


      for (const activity of activities) {
        const houseActivityId = generateUUID();
        await client.query(insertHouseActivityQuery, [
          houseActivityId,
          activity.id,
          activity.num,
          activity.phase,
          activity.sub_phase,
          activity.activity,
          activity.dependance,
          activity.description,
          openDate,
          "pending", // Default status when creating house activity
          houseId,
        ]);
      }
      // Update house with total activities count
      await client.query(
        "UPDATE app_houses SET total_activities = $1 WHERE id = $2",
        [totalActivities, houseId]
      );

      if (status === "completed" && projectId) {
        await client.query(
          "UPDATE app_projects SET houses_completed = houses_completed + 1 WHERE id = $1",
          [projectId]
        );
      }

      await client.query("COMMIT");

      // Fetch created house
      const { rows: houses } = await pool.query(
        `SELECT
           id,
           project_id AS "projectId",
           coto,
           name AS "houseName",
           model,
           status,
           progress,
           description,
           house_image AS "houseImage",
           m2const,
           completed_activities AS "completedActivities",
           total_activities AS "totalActivities",
           created_at AS "createdAt",
           updated_at AS "updatedAt"
         FROM app_houses
         WHERE id = $1`,
        [houseId]
      );
      return res.status(201).json({
        house: houses[0],
        message: `House created successfully with ${totalActivities} activities`,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      return res.status(500).json({ error: error.message });
    } finally {
      client.release();
    }
  }
);

/**
 * @swagger
 * /api/houses/{id}:
 *   put:
 *     summary: Update house
 *     description: Update house information (admin or reviewer only). If completedActivities equals totalActivities and both are greater than 0, the house status is automatically set to 'completed'. When a house status changes to/from 'completed', the project's housesCompleted count is automatically updated.
 *     tags: [Houses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: House ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               projectId:
 *                 type: string
 *                 format: uuid
 *                 description: Project ID (foreign key to projects table)
 *               coto:
 *                 type: string
 *               name:
 *                 type: string
 *               houseName:
 *                 type: string
 *               model:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [in_progress, completed, delayed]
 *               description:
 *                 type: string
 *               houseImage:
 *                 type: string
 *               m2const:
 *                 type: number
 *                 description: Construction area in square meters
 *               completedActivities:
 *                 type: integer
 *               totalActivities:
 *                 type: integer
 *     responses:
 *       200:
 *         description: House updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 house:
 *                   type: object
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin or Reviewer role required
 *       404:
 *         description: House not found
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
        projectId,
        coto,
        name,
        houseName,
        model,
        status,
        description,
        houseImage,
        m2const,
        completedActivities,
        totalActivities,
      } = req.body;

      const { rows: existing } = await pool.query(
        `SELECT
           id,
           project_id AS "projectId",
           status,
           completed_activities AS "completedActivities",
           total_activities AS "totalActivities"
         FROM app_houses
         WHERE id = $1`,
        [id]
      );
      if (existing.length === 0) {
        return res.status(404).json({ error: "House not found" });
      }

      if (projectId !== undefined && projectId !== null) {
        const { rows: projects } = await pool.query(
          "SELECT id FROM app_projects WHERE id = $1",
          [projectId]
        );
        if (projects.length === 0) {
          return res.status(400).json({ error: "Project not found" });
        }
      }

      const updates = [];
      const values = [];
      if (projectId !== undefined) {
        values.push(projectId || null);
        updates.push(`project_id = $${values.length}`);
      }
      if (coto !== undefined) {
        values.push(coto || null);
        updates.push(`coto = $${values.length}`);
      }
      if (name !== undefined || houseName !== undefined) {
        values.push(houseName !== undefined ? houseName : name);
        updates.push(`name = $${values.length}`);
      }
      if (model !== undefined) {
        values.push(model || null);
        updates.push(`model = $${values.length}`);
      }
      if (status !== undefined) {
        if (!["in_progress", "completed", "delayed"].includes(status)) {
          return res.status(400).json({ error: "Invalid status" });
        }
        values.push(status);
        updates.push(`status = $${values.length}`);
      }
      if (description !== undefined) {
        values.push(description || null);
        updates.push(`description = $${values.length}`);
      }
      if (houseImage !== undefined) {
        values.push(houseImage || null);
        updates.push(`house_image = $${values.length}`);
      }
      if (m2const !== undefined) {
        values.push(m2const || null);
        updates.push(`m2const = $${values.length}`);
      }
      if (completedActivities !== undefined) {
        values.push(completedActivities);
        updates.push(`completed_activities = $${values.length}`);
      }
      if (totalActivities !== undefined) {
        values.push(totalActivities);
        updates.push(`total_activities = $${values.length}`);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: "No fields to update" });
      }

      const currentCompletedActivities = existing[0].completedActivities;
      const currentTotalActivities = existing[0].totalActivities;
      const newCompletedActivities =
        completedActivities !== undefined
          ? completedActivities
          : currentCompletedActivities;
      const newTotalActivities =
        totalActivities !== undefined
          ? totalActivities
          : currentTotalActivities;
      const currentStatus = existing[0].status;
      const previousProjectId = existing[0].projectId;
      const newProjectId =
        projectId !== undefined ? projectId || null : previousProjectId;

      // Compute progress as completed / total * 100
      let computedProgress = 0; 
      if (newTotalActivities > 0) {
        computedProgress = (newCompletedActivities / newTotalActivities) * 100;
      }
      updates.push("progress = ?");
      values.push(computedProgress);

      let newHouseStatus = currentStatus;
      if (status === undefined) {
        if (
          newCompletedActivities === newTotalActivities &&
          newCompletedActivities !== 0 &&
          currentStatus !== "completed"
        ) {
          newHouseStatus = "completed";
          values.push("completed");
          updates.push(`status = $${values.length}`);
        } else if (
          newCompletedActivities < newTotalActivities &&
          currentStatus === "completed"
        ) {
          newHouseStatus = "in_progress";
          values.push("in_progress");
          updates.push(`status = $${values.length}`);
        }
      } else {
        newHouseStatus = status;
      }

      values.push(id);
      const updateQuery = `UPDATE app_houses SET ${updates.join(
        ", "
      )} WHERE id = $${values.length}`;
      await pool.query(updateQuery, values);

      if (previousProjectId !== newProjectId) {
        if (previousProjectId && currentStatus === "completed") {
          await pool.query(
            `UPDATE app_projects
             SET houses_completed = GREATEST(houses_completed - 1, 0)
             WHERE id = $1`,
            [previousProjectId]
          );
        }
        if (newProjectId && newHouseStatus === "completed") {
          await pool.query(
            `UPDATE app_projects
             SET houses_completed = houses_completed + 1
             WHERE id = $1`,
            [newProjectId]
          );
        }
      } else if (currentStatus !== newHouseStatus && newProjectId) {
        if (newHouseStatus === "completed" && currentStatus !== "completed") {
          await pool.query(
            `UPDATE app_projects
             SET houses_completed = houses_completed + 1
             WHERE id = $1`,
            [newProjectId]
          );
        } else if (
          newHouseStatus !== "completed" &&
          currentStatus === "completed"
        ) {
          await pool.query(
            `UPDATE app_projects
             SET houses_completed = GREATEST(houses_completed - 1, 0)
             WHERE id = $1`,
            [newProjectId]
          );
        }
      }

      const { rows: houses } = await pool.query(
        `SELECT
           id,
           project_id AS "projectId",
           coto,
           name AS "houseName",
           model,
           status,
           progress,
           description,
           house_image AS "houseImage",
           m2const,
           completed_activities AS "completedActivities",
           total_activities AS "totalActivities",
           created_at AS "createdAt",
           updated_at AS "updatedAt"
         FROM app_houses
         WHERE id = $1`,
        [id]
      );
      res.json({ house: houses[0] });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * @swagger
 * /api/houses/{id}:
 *   delete:
 *     summary: Delete house
 *     description: Delete a house (admin only - cascades to house_activities and images)
 *     tags: [Houses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: House ID
 *     responses:
 *       200:
 *         description: House deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: House deleted successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin role required
 *       404:
 *         description: House not found
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

      // Get house info before deleting to update project housesCompleted if needed
      const { rows: existing } = await pool.query(
        `SELECT status, project_id AS "projectId"
         FROM app_houses
         WHERE id = $1`,
        [id]
      );
      if (existing.length === 0) {
        return res.status(404).json({ error: "House not found" });
      }

      const houseStatus = existing[0].status;
      const projectId = existing[0].projectId;

      // Delete house
      const { rows: deleted } = await pool.query(
        "DELETE FROM app_houses WHERE id = $1 RETURNING id",
        [id]
      );
      if (deleted.length === 0) {
        return res.status(404).json({ error: "House not found" });
      }

      // Update project housesCompleted count if house was completed and had a projectId
      if (houseStatus === "completed" && projectId) {
        await pool.query(
          `UPDATE app_projects
           SET houses_completed = GREATEST(houses_completed - 1, 0)
           WHERE id = $1`,
          [projectId]
        );
      }

      res.json({ message: "House deleted successfully" });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

module.exports = router;
