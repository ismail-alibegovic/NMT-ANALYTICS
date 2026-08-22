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
import aiRoutes from './ai';
import settingsRoutes from './settings';
import notificationsRoutes from './notifications';
import emailSettingsRoutes from './emailSettings';
import paylinksRoutes from './paylinks';
import publicRoutes from './public';
import signupRoutes from './signup';
// Phase A — TuristAgent adoption
import contractRoutes from './contracts';
import receiptRoutes from './receipts';
import calendarRoutes from './calendar';
import installmentRoutes from './installments';
import subAgentRoutes from './subagents';
import excursionRoutes from './excursions';
import hotelRoutes from './hotels';
import packageServicesRoutes from './packageServices';
import eturistaRoutes from './eturista';
import onboardingRoutes from './onboarding';
import waiverRoutes from './waivers';
import commissionRulesRoutes from './commissionRules';
import subAgentPortalRoutes from './subAgentPortal';
import availabilityRoutes from './availability';
import flightRoutes from "./flights";
import inquiryRoutes from './inquiries';
import supplierRoutes from './suppliers';
import itineraryRoutes from './itineraries';
import quotationRoutes from './quotations';
import passengerGroupsRoutes from './passengerGroups';
import accommodationRoutes from './accommodation';
import departurePassengersRoutes from './departurePassengers';

const router = Router();

router.use('/', publicRoutes);
router.use('/', signupRoutes);
router.use('/', subAgentPortalRoutes);

// Mount routes that include their own prefixes
router.use('/', healthRoutes);
router.use('/', meRoutes);
router.use('/', metricsRoutes);
router.use('/', analyticsRoutes);
router.use('/', reservationsRoutes);
router.use('/', inquiryRoutes);
router.use('/', supplierRoutes);
router.use('/', itineraryRoutes);
router.use('/', quotationRoutes);
router.use('/', transactionsRoutes);
router.use('/', customersRoutes);
router.use('/', packagesRoutes);
router.use('/', departuresRoutes);
router.use('/', availabilityRoutes);
router.use('/', reportsRoutes);
router.use('/', documentsRoutes);
router.use('/', importRoutes);
router.use('/', exportRoutes);
router.use('/', quotationRoutes);
router.use('/', paymentsRoutes);
router.use('/', notificationsRoutes);
router.use('/settings/email', emailSettingsRoutes);
router.use('/paylinks', paylinksRoutes);
router.use('/settings', settingsRoutes);

// Phase A — TuristAgent adoption (routes are defined with full /contracts prefix)

// Phase B — TuristAgent adoption
router.use('/', subAgentRoutes);
router.use('/', excursionRoutes);
router.use('/', hotelRoutes);
router.use('/', packageServicesRoutes);
router.use('/', contractRoutes);
router.use('/', receiptRoutes);
router.use('/', calendarRoutes);
router.use('/', installmentRoutes);
router.use('/', eturistaRoutes);
router.use('/onboarding', onboardingRoutes);
router.use('/', waiverRoutes);
router.use('/', commissionRulesRoutes);

// Mount routes that rely on parent prefix
router.use("/", flightRoutes);
router.use('/admin', adminRoutes);
router.use('/', aiRoutes);
router.use('/', passengerGroupsRoutes);
router.use('/', accommodationRoutes);
router.use('/', departurePassengersRoutes);

export default router;
