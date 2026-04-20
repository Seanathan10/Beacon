
import express from 'express';
import { db } from '../database/db';
import { v4 as uuidv4 } from 'uuid';
import { check } from './auth.ts';

export const shareRouter = express.Router();

const MAX_SHARE_PAYLOAD_BYTES = 512 * 1024; // 512 KB

shareRouter.post('/', (req, res) => {
    try {
        const { itinerary, itineraryType, settings } = req.body;

        if (!itinerary) {
            return res.status(400).json({ error: 'Missing itinerary data' });
        }

        const id = uuidv4();
        const data = JSON.stringify({
            itinerary,
            itineraryType,
            settings: settings || {}
        });

        if (Buffer.byteLength(data, 'utf8') > MAX_SHARE_PAYLOAD_BYTES) {
            return res.status(413).json({ error: 'Itinerary payload too large' });
        }

        const stmt = db.prepare('INSERT INTO itinerary (id, creatorID, data) VALUES (?, ?, ?)');
        const userId = typeof req.user?.id === 'string' ? parseInt(req.user.id, 10) : (req.user?.id || null);
        stmt.run(id, userId, data);

        res.status(201).json({ id });
    } catch (error) {
        console.error('Error sharing itinerary:', error);
        res.status(500).json({ error: 'Failed to share itinerary' });
    }
});

// Get shared itinerary (public, but rate-limited)
shareRouter.get('/:id', (req, res) => {
    try {
        const { id } = req.params;
        const stmt = db.prepare('SELECT data, createdAt FROM itinerary WHERE id = ?');
        const result = stmt.get(id) as { data: string, createdAt: string } | undefined;

        if (!result) {
            return res.status(404).json({ error: 'Itinerary not found' });
        }

        // Convert SQLite datetime format to ISO 8601 format
        const createdAt = result.createdAt 
            ? new Date(result.createdAt.replace(' ', 'T') + 'Z').toISOString()
            : new Date().toISOString();

        res.json({
            ...JSON.parse(result.data),
            createdAt
        });
    } catch (error) {
        console.error('Error fetching shared itinerary:', error);
        res.status(500).json({ error: 'Failed to fetch itinerary' });
    }
});

// Delete shared itinerary (only by creator)
shareRouter.delete('/:id', check, (req, res) => {
    try {
        const id = String(req.params.id);
        const userId = req.user?.id;

        const stmt = db.prepare('SELECT creatorID FROM itinerary WHERE id = ?');
        const result = stmt.get(id) as { creatorID: number | null } | undefined;

        if (!result) {
            return res.status(404).json({ error: 'Itinerary not found' });
        }

        if (result.creatorID !== Number(userId)) {
            return res.status(403).json({ error: 'Unauthorized to delete this itinerary' });
        }

        const deleteStmt = db.prepare('DELETE FROM itinerary WHERE id = ?');
        deleteStmt.run(id);

        res.status(200).json({ message: 'Itinerary deleted successfully' });
    } catch (error) {
        console.error('Error deleting shared itinerary:', error);
        res.status(500).json({ error: 'Failed to delete itinerary' });
    }
});

