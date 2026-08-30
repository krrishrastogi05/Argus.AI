const express = require('express');

const advisories = require('../controllers/advisoryController');
const auth = require('../controllers/authController');
const reports = require('../controllers/reportController');
const incidents = require('../controllers/incidentController');
const units = require('../controllers/unitController');
const { ROLES } = require('../models/enums');
const { requireAuth, requireRole } = require('../middleware/auth');
const { aiLimiter, authLimiter } = require('../middleware/rateLimiters');
const { validateBody } = require('../middleware/validate');

const router = express.Router();
const citizenOnly = requireRole(ROLES.CITIZEN);
const adminOnly = requireRole(ROLES.ADMIN);

// --- Public ---------------------------------------------------------------
router.post('/auth/register', authLimiter, validateBody(auth.registerSchema), auth.register);
router.post('/auth/login', authLimiter, validateBody(auth.loginSchema), auth.login);

// --- Any signed-in user ----------------------------------------------------
router.use(requireAuth);
router.get('/auth/me', auth.me);
router.get('/advisories', advisories.listAdvisories);

// --- Citizen (social feed + helpline) --------------------------------------
router.post('/reports', citizenOnly, aiLimiter, validateBody(reports.createReportSchema), reports.createReport);
router.get('/reports/mine', citizenOnly, reports.listMyReports);

// --- Admin (command centre) ------------------------------------------------
router.get('/incidents', adminOnly, incidents.list);
router.get('/incidents/:id/nearest-units', adminOnly, incidents.nearestUnits);
router.get('/units', adminOnly, units.listUnits);
router.post('/units', adminOnly, validateBody(units.createUnitSchema), units.createUnit);
router.post('/incidents/:id/dispatch', adminOnly, validateBody(incidents.dispatchSchema), incidents.dispatch);
router.post('/incidents/:id/resolve', adminOnly, incidents.resolve);
router.delete('/incidents/:id', adminOnly, incidents.remove);
router.post('/advisories/draft', adminOnly, aiLimiter, validateBody(advisories.draftSchema), advisories.draftAdvisory);
router.post('/advisories', adminOnly, validateBody(advisories.publishSchema), advisories.publishAdvisory);
router.post('/admin/reset', adminOnly, incidents.reset);

module.exports = router;
