const express = require('express');
const router = express.Router({ mergeParams: true });
const resourceController = require('../controllers/resourceController');
const auth = require('../middleware/auth');
const { uploadResource } = require('../middleware/upload');

// Apply auth middleware to all routes
router.use(auth);

// Create a resource
router.post('/', uploadResource, resourceController.createResource);

// Get all resources
router.get('/', resourceController.getResources);

// Update a resource
router.put('/:resourceId', resourceController.updateResource);

// Delete a resource
router.delete('/:resourceId', resourceController.deleteResource);

module.exports = router;
