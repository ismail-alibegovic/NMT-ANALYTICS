import { Router } from 'express';
import healthRoutes from './health';
import meRoutes from './me';
import metricsRoutes from './metrics';
import analyticsRoutes from './analytics';
import reservationsRoutes from './reservations';
import transactionsRoutes from './transactions';
import customersRoutes from './customers';
import packagesRoutes from './packages';
import departuresRoutes from './departures';
import reportsRoutes from './reports';
import documentsRoutes from './documents';
import importRoutes from './import';
import exportRoutes from './export';
import paymentsRoutes from './payments';
import adminRoutes from './admin';
import debugRoutes from './debug';
import doctorRoutes from './doctor';
import aiRoutes from './ai';
import settingsRoutes from './settings';
import notificationsRoutes from './notifications';
import emailSettingsRoutes from './emailSettings';

const router = Router();

// Mount routes that include their own prefixes
router.use('/', healthRoutes);
router.use('/', meRoutes);
router.use('/', metricsRoutes);
router.use('/', analyticsRoutes);
router.use('/', reservationsRoutes);
router.use('/', transactionsRoutes);
router.use('/', customersRoutes);
router.use('/', packagesRoutes);
router.use('/', departuresRoutes);
router.use('/', reportsRoutes);
router.use('/', documentsRoutes);
router.use('/', importRoutes);
router.use('/', exportRoutes);
router.use('/', paymentsRoutes);
router.use('/', notificationsRoutes);
router.use('/settings/email', emailSettingsRoutes);
router.use('/settings', settingsRoutes);

// Mount routes that rely on parent prefix
router.use('/admin', adminRoutes);
router.use('/debug', debugRoutes);
router.use('/', aiRoutes);
router.use('/', doctorRoutes);

export default router;
