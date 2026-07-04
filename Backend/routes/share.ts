
import express from 'express';
import * as itineraryRepo from '../repositories/itineraryRepo';
import * as bookmarkRepo from '../repositories/bookmarkRepo';
import { v4 as uuidv4 } from 'uuid';
import { check } from './auth.ts';
import { logError } from '../utils/logger';
import { isOwner } from '../utils/ownership';
import { sanitizeDeep } from '../utils/sanitize';
import { deriveTripCarbon } from '../utils/tripCarbon';

export const shareRouter = express.Router();

const MAX_SHARE_PAYLOAD_BYTES = 512 * 1024; // 512 KB

shareRouter.post('/', (req, res) => {
    try {
        const { itinerary, itineraryType, settings, title } = req.body;

        if (!itinerary) {
            return res.status(400).json({ error: 'Missing itinerary data' });
        }

        const id = uuidv4();
        const data = JSON.stringify({
            itinerary: sanitizeDeep(itinerary),
            itineraryType: typeof itineraryType === 'string' ? itineraryType.replace(/<[^>]*>/g, '') : itineraryType,
            settings: sanitizeDeep(settings || {})
        });

        if (Buffer.byteLength(data, 'utf8') > MAX_SHARE_PAYLOAD_BYTES) {
            return res.status(413).json({ error: 'Itinerary payload too large' });
        }

        // Sharing publishes an immutable, publicly viewable snapshot (isPublic = 1).
        const cleanTitle = typeof title === 'string'
            ? title.replace(/<[^>]*>/g, '').trim().slice(0, 120) || null
            : null;
        const { carbonKg, savedKg } = deriveTripCarbon(settings);
        const userId = typeof req.user?.id === 'string' ? parseInt(req.user.id, 10) : (req.user?.id || null);
        itineraryRepo.insertPublished(id, userId, cleanTitle, data, carbonKg, savedKg);

        res.status(201).json({ id });
    } catch (error) {
        logError(req, 'Error sharing itinerary', error);
        res.status(500).json({ error: 'Failed to share itinerary' });
    }
});

// Get shared itinerary (public, but rate-limited)
shareRouter.get('/:id', (req, res) => {
    try {
        const { id } = req.params;
        // Only published snapshots are publicly viewable; private drafts (isPublic = 0)
        // are reachable solely through the owner-authenticated /api/me/trips routes.
        const result = itineraryRepo.findPublicById(String(id));

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
        logError(req, 'Error fetching shared itinerary', error);
        res.status(500).json({ error: 'Failed to fetch itinerary' });
    }
});

// Delete shared itinerary (only by creator)
shareRouter.delete('/:id', check, (req, res) => {
    try {
        const id = String(req.params.id);
        const userId = req.user?.id;

        // Hard guard: never reach the ownership comparison without an authenticated
        // user. (Otherwise `undefined !== Number(creatorID)` would skip the 403.)
        if (userId === undefined || userId === null) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const result = itineraryRepo.findCreator(id);

        if (!result) {
            return res.status(404).json({ error: 'Itinerary not found' });
        }

        if (!isOwner(result.creatorID, userId)) {
            return res.status(403).json({ error: 'Unauthorized to delete this itinerary' });
        }

        itineraryRepo.deleteById(id);

        res.status(200).json({ message: 'Itinerary deleted successfully' });
    } catch (error) {
        logError(req, 'Error deleting shared itinerary', error);
        res.status(500).json({ error: 'Failed to delete itinerary' });
    }
});

// Get public bookmark collection (no auth required)
shareRouter.get('/collection/:folderID', (req, res) => {
    try {
        const { folderID } = req.params;

        // Check if folder exists and is public
        const folder = bookmarkRepo.findFolderById(String(folderID));

        if (!folder) {
            return res.status(404).json({ message: 'Collection not found' });
        }

        if (!folder.isPublic) {
            return res.status(403).json({ message: 'Collection is private' });
        }

        // Get pins in this folder
        const pins = bookmarkRepo.findFolderPins(String(folderID));

        res.json({
            folder: {
                id: folder.id,
                name: folder.name,
                createdAt: folder.createdAt,
                pinCount: pins.length
            },
            pins
        });
    } catch (error) {
        logError(req, 'Error fetching collection', error);
        res.status(500).json({ error: 'Failed to fetch collection' });
    }
});

