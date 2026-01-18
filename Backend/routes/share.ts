
import express from 'express';
import { db } from '../database/db';
import { v4 as uuidv4 } from 'uuid';

export const shareRouter = express.Router();

// Save itinerary
shareRouter.post('/', (req, res) => {
    try {
        const { itinerary, itineraryType, settings } = req.body;

        if (!itinerary) {
            return res.status(400).json({ error: 'Missing itinerary data' });
        }

        const id = uuidv4();
        // Store the complete state needed to reconstruct the view
        const data = JSON.stringify({
            itinerary,
            itineraryType,
            settings: settings || {}
        });

        const stmt = db.prepare('INSERT INTO itinerary (id, data) VALUES (?, ?)');
        stmt.run(id, data);

        res.json({ id });
    } catch (error) {
        console.error('Error sharing itinerary:', error);
        res.status(500).json({ error: 'Failed to share itinerary' });
    }
});

// Get shared itinerary
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
