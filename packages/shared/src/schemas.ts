import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8).max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');

export const profileUpdateSchema = z
  .object({
    displayName: z.string().max(80),
    birthDate: localDate,
    sex: z.enum(['MALE', 'FEMALE']),
    heightCm: z.number().min(100).max(250),
    startWeightKg: z.number().min(30).max(400),
    goalWeightKg: z.number().min(30).max(400),
    activityLevel: z.enum(['SEDENTARY', 'LIGHT', 'MODERATE', 'ACTIVE', 'VERY_ACTIVE']),
    timezone: z.string().max(64),
    targetKcal: z.number().int().min(1000).max(6000),
    targetProteinG: z.number().min(20).max(400),
    targetFatG: z.number().min(20).max(250),
    targetFiberG: z.number().min(5).max(100),
    targetWaterMl: z.number().int().min(500).max(8000),
    allergies: z.array(z.string().max(60)).max(30),
    dislikedFoods: z.array(z.string().max(60)).max(60),
    aiConsent: z.boolean(),
  })
  .partial();
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;
