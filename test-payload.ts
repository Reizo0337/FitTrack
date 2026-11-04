import { healthIngestSchema } from './packages/shared/src/health';
const payload = {
  days: [
    {
      date: '2026-11-04',
      steps: 199,
      activeKcal: 12.371,
      restingKcal: 1239.919,
      distanceKm: 0.153110000002198
    }
  ]
};
const res = healthIngestSchema.safeParse(payload);
console.log('Result:', res.success ? 'VALID' : res.error);
