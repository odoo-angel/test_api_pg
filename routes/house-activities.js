const express = require("express");
const router = express.Router();
const { pool, authenticateJwt, requireRole, generateUUID } = require("./utils");

/**
 * @swagger
 * /api/house-activities:
 *   get:
 *     summary: Get house activities
 *     description: Retrieve house activities with optional filtering by houseId or isBlocked status
 *     tags: [House Activities]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: houseId
 *         schema:
 *           type: string
 *         description: Filter by house ID
 *       - in: query
 *         name: isBlocked
 *         schema:
 *           type: boolean
 *         description: Filter by blocked status
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, in_progress, review, completed, blocked, rejected]
 *         description: Filter by status
 *     responses:
 *       200:
 *         description: List of house activities retrieved successfully
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get("/", authenticateJwt, async (req, res) => {
  try {
    const { houseId, isBlocked, status } = req.query;
    // first merge point - added stats routes: added rejectedRemarks to select list
    // fourth merge point - house progress is now automatically calculated: changed open_date to last_updated_at
    let query = `
      SELECT
        ha.id,
        ha.activity_id AS "activityId",
        ha.num,
        ha.phase,
        ha.sub_phase AS "subphase",
        ha.activity,
        ha.remarks,
        ha.rejected_remarks AS "rejectedRemarks", 
        ha.status,
        ha.description,
        ha.last_updated_at AS "lastUpdated",
        ha.is_blocked AS "isBlocked",
        ha.house_id AS "houseId",
        p.title AS project,
        h.name AS "houseName",
        h.project_id AS "projectId"
      FROM app_house_activities ha
      LEFT JOIN app_houses h ON ha.house_id = h.id
      LEFT JOIN app_projects p ON h.project_id = p.id
      WHERE 1=1`;
    const params = [];

    if (houseId) {
      params.push(houseId);
      query += ` AND ha.house_id = $${params.length}`;
    }
    if (isBlocked !== undefined) {
      params.push(isBlocked === "true");
      query += ` AND ha.is_blocked = $${params.length}`;
    }
    if (status) {
      if (
        ![
          "pending",
          "in_progress",
          "completed",
          "blocked",
          "rejected",
          "review",
        ].includes(status)
      ) {
        return res.status(400).json({
          error:
            "Invalid status. Must be pending, in_progress, completed, blocked, or rejected",
        });
      }
      params.push(status);
      query += ` AND ha.status = $${params.length}`;
    }

    query += " ORDER BY num ASC";

    const { rows: houseActivities } = await pool.query(query, params);
    // first merge point - added stats routes: added rejectedRemarks to response object
    // fourth merge point - house progress is now automatically calculated: changed lastUpdate to lastUpdatedAt
    const transformedHouseActivities = houseActivities.map((ha) => ({
      id: ha.id,
      phase: ha.phase,
      subphase: ha.subphase,
      num: ha.num,
      activity: ha.activity,
      activityID: ha.activityId,
      status: ha.status,
      remarks: ha.remarks,
      rejectedRemarks: ha.rejectedRemarks,
      description: ha.description,
      lastUpdatedAt: ha.lastUpdatedAt,
      project: ha.project,
      houseName: ha.houseName,
      visible: !ha.isBlocked,
    }));

    res.json({ houseActivities: transformedHouseActivities });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// first merge point - added stats routes: new swagger doc and route
/**
 * @swagger
 * /api/house-activities/stats:
 *   get:
 *     summary: Get house activity statistics
 *     description: >
 *       Returns aggregate statistics for all house activities:
 *       - pendingActivities: count of activities with status `pending`
 *       - completedActivities: count of activities with status `completed`
 *       - activeActivities: count of activities that are not `completed`
 *     tags: [House Activities]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: House activity stats retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 stats:
 *                   type: object
 *                   properties:
 *                     pendingActivities:
 *                       type: integer
 *                       example: 12
 *                     completedActivities:
 *                       type: integer
 *                       example: 34
 *                     activeActivities:
 *                       type: integer
 *                       example: 46
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get("/stats", authenticateJwt, async (req, res) => {
  try {
    let query = `
      SELECT
        SUM(CASE WHEN ha.status = 'pending' THEN 1 ELSE 0 END) AS pendingActivities,
        SUM(CASE WHEN ha.status = 'completed' THEN 1 ELSE 0 END) AS completedActivities,
        SUM(CASE WHEN ha.status <> 'completed' THEN 1 ELSE 0 END) AS activeActivities
      FROM app_house_activities ha
      WHERE 1=1
    `;

    const [rows] = await pool.execute(query);
    const stats = rows[0] || {
      pendingActivities: 0,
      completedActivities: 0,
      activeActivities: 0,
    };

    res.json({ stats });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/house-activities/{id}:
 *   get:
 *     summary: Get house activity by ID
 *     description: Retrieve a specific house activity by its ID
 *     tags: [House Activities]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: House Activity ID
 *     responses:
 *       200:
 *         description: House activity retrieved successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: House activity not found
 *       500:
 *         description: Server error
 */
router.get("/:id", authenticateJwt, async (req, res) => {
  try {
    const { id } = req.params;
    // first merge point - added stats routes: added rejectedRemarks to select list
    // second merge point - added last_updated_at column to house_activties table: changed open_date to last_updated_at
    const { rows: houseActivities } = await pool.query(
      `SELECT
         ha.id,
         ha.activity_id AS "activityId",
         ha.num,
         ha.phase,
         ha.sub_phase AS "subphase",
         ha.activity, 
         ha.remarks,
         ha.rejected_remarks AS "rejectedRemarks",
         ha.status,
         ha.description,
         ha.open_date AS "lastUpdated",
         ha.is_blocked AS "isBlocked",
         ha.house_id AS "houseId",
         ha.last_upated_at AS "lastUpdatedAt",
         p.title AS project,
         h.name AS "houseName",
         h.project_id AS "projectId"
       FROM app_house_activities ha
       LEFT JOIN app_houses h ON ha.house_id = h.id
       LEFT JOIN app_projects p ON h.project_id = p.id
       WHERE ha.id = $1`,
      [id]
    );
    if (houseActivities.length === 0) {
      return res.status(404).json({ error: "House activity not found" });
    }
    const ha = houseActivities[0];
    // first merge point - added stats routes: added rejectedRemarks to response object
    // second merge point - added last_updated_at column to house_activties table: changed lastUpdated field
    const result = {
      id: ha.id,
      phase: ha.phase,
      subphase: ha.subphase,
      num: ha.num,
      activity: ha.activity,
      activityID: ha.activityId,
      status: ha.status,
      remarks: ha.remarks,
      rejectedRemarks: ha.rejectedRemarks,
      description: ha.description,
      lastUpdatedAt: ha.lastUpdatedAt,
      project: ha.project,
      houseName: ha.houseName,
      visible: !ha.isBlocked,
    };

    res.json({ houseActivity: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/house-activities/{id}:
 *   put:
 *     summary: Update house activity
 *     description: Update a house activity. Surveyors can update their own activities (dates, remarks). Reviewers/Admins can approve and block activities. Status is auto-updated based on other fields, or can be manually set by reviewers/admins. When status changes to/from 'completed', the house's completedActivities count is automatically updated. If all activities are completed, the house status is automatically set to 'completed', and the project's housesCompleted count is updated accordingly.
 *     tags: [House Activities]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: House Activity ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               startDate:
 *                 type: string
 *                 format: date-time
 *               completionDate:
 *                 type: string
 *                 format: date-time
 *               isBlocked:
 *                 type: boolean
 *               appUserId:
 *                 type: string
 *               remarks:
 *                 type: string
 *               rejectedRemarks:
 *                 type: string
 *                 description: Remarks when rejecting an activity (Reviewer/Admin only)
 *               approvedById:
 *                 type: string
 *                 description: Reviewer/Admin only - User ID of approver
 *               status:
 *                 type: string
 *                 enum: [pending, in_progress, review, completed, blocked, rejected]
 *                 description: Status of the activity (can be set manually or auto-updated based on other fields)
 *     responses:
 *       200:
 *         description: House activity updated successfully
 *       400:
 *         description: Invalid input or insufficient permissions
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: House activity not found
 *       500:
 *         description: Server error
 */
router.put("/:id", authenticateJwt, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      startDate,
      completionDate,
      isBlocked,
      appUserId,
      remarks,
      rejectedRemarks,
      approvedById,
      status,
    } = req.body;

    const { rows: existing } = await pool.query(
      `SELECT
         id,
         house_id AS "houseId",
         activity_id AS "activityId",
         status,
         start_date AS "startDate",
         completion_date AS "completionDate",
         is_blocked AS "isBlocked",
         rejected_remarks AS "rejectedRemarks",
         approved_by_id AS "approvedById",
         remarks,
         description,
         app_user_id AS "appUserId"
       FROM app_house_activities
       WHERE id = $1`,
      [id]
    );
    if (existing.length === 0) {
      return res.status(404).json({ error: "House activity not found" });
    }

    const isReviewer = ["reviewer", "admin"].includes(req.jwtUser.role);
    const isSurveyor = req.jwtUser.role === "surveyor";

    const updates = [];
    const values = [];

    if (
      !existing[0].startDate &&
      (req.body.status == "pending" || req.body.status == "review")
    ) {
      updates.push("start_date = NOW()");
    }

    if (!existing[0].completionDate && req.body.status == "completed") {
      updates.push("completion_date = NOW()");
    }

    if (
      isSurveyor &&
      (appUserId === req.jwtUser.id || appUserId === undefined)
    ) {
      if (startDate !== undefined) {
        values.push(startDate ? new Date(startDate) : null);
        updates.push(`start_date = $${values.length}`);
      }
      if (completionDate !== undefined) {
        values.push(completionDate ? new Date(completionDate) : null);
        updates.push(`completion_date = $${values.length}`);
      }
      if (remarks !== undefined) {
        values.push(remarks);
        updates.push(`remarks = $${values.length}`);
      }
      if (appUserId !== undefined) {
        values.push(appUserId);
        updates.push(`app_user_id = $${values.length}`);
      }
    }

    if (isReviewer) {
      if (approvedById !== undefined) {
        values.push(approvedById);
        updates.push(`approved_by_id = $${values.length}`);
        if (approvedById) {
          updates.push("approved_at = NOW()");
        } else {
          updates.push("approved_at = NULL");
        }
      }
      if (isBlocked !== undefined) {
        values.push(isBlocked);
        updates.push(`is_blocked = $${values.length}`);
      }
      if (remarks !== undefined) {
        values.push(remarks);
        updates.push(`remarks = $${values.length}`);
      }
      if (rejectedRemarks !== undefined) {
        values.push(rejectedRemarks);
        updates.push(`rejected_remarks = $${values.length}`);
      }
      if (status !== undefined) {
        if (
          ![
            "pending",
            "in_progress",
            "completed",
            "blocked",
            "rejected",
            "review",
          ].includes(status)
        ) {
          return res.status(400).json({
            error:
              "Invalid status. Must be pending, in_progress,review, completed, blocked, or rejected",
          });
        }
        values.push(status);
        updates.push(`status = $${values.length}`);
      }
    }

    const previousStatus = existing[0].status;
    let newStatus = previousStatus;

    if (status !== undefined && isReviewer) {
      newStatus = status;
    } else {
      const blockedValue =
        isBlocked !== undefined ? isBlocked : existing[0].isBlocked;
      if (blockedValue === true) {
        newStatus = "blocked";
      } else {
        const rejectedValue =
          rejectedRemarks !== undefined
            ? rejectedRemarks
            : existing[0].rejectedRemarks;
        if (rejectedValue && rejectedValue.trim() !== "") {
          newStatus = "rejected";
        } else {
          const completionValue =
            completionDate !== undefined
              ? completionDate
              : existing[0].completionDate;
          const approvedValue =
            approvedById !== undefined
              ? approvedById
              : existing[0].approvedById;
          if (completionValue && approvedValue) {
            newStatus = "completed";
          } else if (completionValue && !approvedValue) {
            newStatus = "review";
          } else {
            const startValue =
              startDate !== undefined ? startDate : existing[0].startDate;
            newStatus = startValue ? "in_progress" : "pending";
          }
        }
      }

      if (newStatus !== previousStatus) {
        const hasStatusUpdate = updates.some((update) =>
          update.includes("status")
        );
        if (!hasStatusUpdate) {
          values.push(newStatus);
          updates.push(`status = $${values.length}`);
        }
      }
    }

    const statusChangedToCompleted =
      previousStatus !== "completed" && newStatus === "completed";
    const statusChangedFromCompleted =
      previousStatus === "completed" && newStatus !== "completed";

    if (updates.length === 0) {
      return res
        .status(400)
        .json({ error: "No fields to update or insufficient permissions" });
    }

    values.push(id);
    await pool.query(
      `UPDATE app_house_activities SET ${updates.join(
        ", "
      )} WHERE id = $${values.length}`,
      values
    );

    if (statusChangedToCompleted || statusChangedFromCompleted) {
      const houseId = existing[0].houseId;

      const { rows: completedCount } = await pool.query(
        `SELECT COUNT(*)::int AS count FROM app_house_activities 
         WHERE house_id = $1 AND status = 'completed'`,
        [houseId]
      );

      const { rows: houseInfo } = await pool.query(
        "SELECT total_activities AS \"totalActivities\", status, project_id AS \"projectId\" FROM app_houses WHERE id = $1",
        [houseId]
      );

      if (houseInfo.length > 0) {
        const completedActivities = completedCount[0].count;
        const totalActivities = houseInfo[0].totalActivities;
        const previousHouseStatus = houseInfo[0].status;

        // fourth merge point - house progress is now automatically calculated: progress calculation
        // Compute progress = completed / total * 100
        let progress = 0;
        if (totalActivities > 0) {
          progress = (completedActivities / totalActivities) * 100;
        }

        // Update house completedActivities and progress
        // fourth merge point - house progress is now automatically calculated: added progress update
        await pool.query(
          "UPDATE app_houses SET completed_activities = $1, progress = $2 WHERE id = $3",
          [completedActivities, progress, houseId]
        );

        let newHouseStatus = previousHouseStatus;
        if (
          completedActivities === totalActivities &&
          completedActivities !== 0
        ) {
          newHouseStatus = "completed";
        } else if (
          completedActivities < totalActivities &&
          previousHouseStatus === "completed"
        ) {
          newHouseStatus = "in_progress";
        }

        if (newHouseStatus !== previousHouseStatus) {
          await pool.query("UPDATE app_houses SET status = $1 WHERE id = $2", [
            newHouseStatus,
            houseId,
          ]);

          const projectId = houseInfo[0].projectId;

          if (projectId) {
            if (
              newHouseStatus === "completed" &&
              previousHouseStatus !== "completed"
            ) {
              await pool.query(
                "UPDATE app_projects SET houses_completed = houses_completed + 1 WHERE id = $1",
                [projectId]
              );
            } else if (
              newHouseStatus !== "completed" &&
              previousHouseStatus === "completed"
            ) {
              await pool.query(
                "UPDATE app_projects SET houses_completed = GREATEST(houses_completed - 1, 0) WHERE id = $1",
                [projectId]
              );
            }
          }
        }
      }
    }

    const { rows: updatedActivity } = await pool.query(
      `SELECT
         id,
         house_id AS "houseId",
         activity_id AS "activityId",
         num,
         phase,
         sub_phase AS "subphase",
         activity,
         dependance,
         description,
         open_date AS "openDate",
         start_date AS "startDate",
         completion_date AS "completionDate",
         status,
         app_user_id AS "appUserId",
         approved_by_id AS "approvedById",
         approved_at AS "approvedAt",
         remarks,
         rejected_remarks AS "rejectedRemarks",
         is_blocked AS "isBlocked"
       FROM app_house_activities
       WHERE id = $1`,
      [id]
    );

    res.json({ houseActivity: updatedActivity[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/house-activities/{id}:
 *   delete:
 *     summary: Delete house activity
 *     description: Delete a house activity (admin only)
 *     tags: [House Activities]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: House Activity ID
 *     responses:
 *       200:
 *         description: House activity deleted successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin role required
 *       404:
 *         description: House activity not found
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
      const { rowCount } = await pool.query(
        "DELETE FROM app_house_activities WHERE id = $1",
        [id]
      );
      if (rowCount === 0) {
        return res.status(404).json({ error: "House activity not found" });
      }
      res.json({ message: "House activity deleted successfully" });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

module.exports = router;
