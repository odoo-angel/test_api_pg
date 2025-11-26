const express = require('express');
const router = express.Router();
const { pool, authenticateJwt, generateUUID } = require('./utils');

/**
 * @swagger
 * /api/images:
 *   get:
 *     summary: Get images
 *     description: Retrieve images with optional filtering by houseActivityId
 *     tags: [Images]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: houseActivityId
 *         schema:
 *           type: string
 *         description: Filter by house activity ID
 *     responses:
 *       200:
 *         description: List of images retrieved successfully
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get('/', authenticateJwt, async (req, res) => {
  try {
    const { houseActivityId } = req.query;
    let query = `
      SELECT
        id,
        house_activity_id AS "houseActivityId",
        app_user_id AS "appUserId",
        url,
        caption,
        uploaded_at AS "uploadedAt"
      FROM app_images
      WHERE 1=1`;
    const params = [];

    if (houseActivityId) {
      params.push(houseActivityId);
      query += ` AND house_activity_id = $${params.length}`;
    }

    query += ' ORDER BY uploaded_at DESC';

    const { rows } = await pool.query(query, params);
    res.json({ images: rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/images/{id}:
 *   get:
 *     summary: Get image by ID
 *     description: Retrieve a specific image by its ID
 *     tags: [Images]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Image ID
 *     responses:
 *       200:
 *         description: Image retrieved successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Image not found
 *       500:
 *         description: Server error
 */
router.get('/:id', authenticateJwt, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `SELECT
         id,
         house_activity_id AS "houseActivityId",
         app_user_id AS "appUserId",
         url,
         caption,
         uploaded_at AS "uploadedAt"
       FROM app_images
       WHERE id = $1`,
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Image not found' });
    }
    res.json({ image: rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/images:
 *   post:
 *     summary: Create new image
 *     description: Create a new image record with upload URL
 *     tags: [Images]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - houseActivityId
 *               - url
 *             properties:
 *               houseActivityId:
 *                 type: string
 *                 example: abc-123-def
 *               url:
 *                 type: string
 *                 format: uri
 *                 example: https://example.com/image.jpg
 *               caption:
 *                 type: string
 *                 example: Front view of the house
 *     responses:
 *       201:
 *         description: Image created successfully
 *       400:
 *         description: Invalid input or missing required fields
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: House activity not found
 *       500:
 *         description: Server error
 */
router.post('/', authenticateJwt, async (req, res) => {
  try {
    const { houseActivityId, url, caption } = req.body;
    
    if (!houseActivityId || !url) {
      return res.status(400).json({ 
        error: 'houseActivityId and url are required' 
      });
    }

    // Verify house_activity exists
    const { rows: houseActivities } = await pool.query(
      'SELECT id FROM app_house_activities WHERE id = $1',
      [houseActivityId]
    );
    if (houseActivities.length === 0) {
      return res.status(404).json({ error: 'House activity not found' });
    }

    const id = generateUUID();
    await pool.query(
      `INSERT INTO app_images (id, house_activity_id, app_user_id, url, caption) 
       VALUES ($1, $2, $3, $4, $5)`,
      [id, houseActivityId, req.jwtUser.id, url, caption]
    );

    const { rows } = await pool.query(
      `SELECT
         id,
         house_activity_id AS "houseActivityId",
         app_user_id AS "appUserId",
         url,
         caption,
         uploaded_at AS "uploadedAt"
       FROM app_images
       WHERE id = $1`,
      [id]
    );
    res.status(201).json({ image: rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/images/{id}:
 *   put:
 *     summary: Update image
 *     description: Update image URL or caption (owner or admin/reviewer only)
 *     tags: [Images]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Image ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               url:
 *                 type: string
 *                 format: uri
 *               caption:
 *                 type: string
 *     responses:
 *       200:
 *         description: Image updated successfully
 *       400:
 *         description: Invalid input or no fields to update
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Cannot update other users' images
 *       404:
 *         description: Image not found
 *       500:
 *         description: Server error
 */
router.put('/:id', authenticateJwt, async (req, res) => {
  try {
    const { id } = req.params;
    const { url, caption } = req.body;

    // Check if image exists and user owns it or is admin/reviewer
    const { rows: existing } = await pool.query(
      `SELECT
         id,
         house_activity_id AS "houseActivityId",
         app_user_id AS "appUserId",
         url,
         caption,
         uploaded_at AS "uploadedAt"
       FROM app_images
       WHERE id = $1`,
      [id]
    );
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Image not found' });
    }

    const isOwner = existing[0].appUserId === req.jwtUser.id;
    const isAdminOrReviewer = ['admin', 'reviewer'].includes(req.jwtUser.role);

    if (!isOwner && !isAdminOrReviewer) {
      return res.status(403).json({ error: 'You can only update your own images' });
    }

    // Build update query
    const updates = [];
    const values = [];

    if (url) {
      values.push(url);
      updates.push(`url = $${values.length}`);
    }
    if (caption !== undefined) {
      values.push(caption);
      updates.push(`caption = $${values.length}`);
    }
    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

    values.push(id);
    await pool.query(
      `UPDATE app_images SET ${updates.join(', ')} WHERE id = $${values.length}`,
      values
    );

    const { rows } = await pool.query(
      `SELECT
         id,
         house_activity_id AS "houseActivityId",
         app_user_id AS "appUserId",
         url,
         caption,
         uploaded_at AS "uploadedAt"
       FROM app_images
       WHERE id = $1`,
      [id]
    );
    res.json({ image: rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/images/{id}:
 *   delete:
 *     summary: Delete image
 *     description: Delete an image (owner or admin/reviewer only)
 *     tags: [Images]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Image ID
 *     responses:
 *       200:
 *         description: Image deleted successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Cannot delete other users' images
 *       404:
 *         description: Image not found
 *       500:
 *         description: Server error
 */
router.delete('/:id', authenticateJwt, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if image exists and user has permission
    const { rows: existing } = await pool.query(
      `SELECT
         id,
         app_user_id AS "appUserId"
       FROM app_images
       WHERE id = $1`,
      [id]
    );
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Image not found' });
    }

    const isOwner = existing[0].appUserId === req.jwtUser.id;
    const isAdminOrReviewer = ['admin', 'reviewer'].includes(req.jwtUser.role);

    if (!isOwner && !isAdminOrReviewer) {
      return res.status(403).json({ error: 'You can only delete your own images' });
    }

    const { rowCount } = await pool.query('DELETE FROM app_images WHERE id = $1', [id]);
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Image not found' });
    }
    res.json({ message: 'Image deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

