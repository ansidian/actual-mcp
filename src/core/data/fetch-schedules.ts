import { getSchedules, getRuleById } from '../../actual-api.js';
import type { Schedule } from '../types/domain.js';

export async function fetchAllSchedules(): Promise<Schedule[]> {
  const schedules = (await getSchedules()) as Schedule[];

  for (const schedule of schedules) {
    if (schedule.rule) {
      const rule = await getRuleById(schedule.rule);
      schedule.conditions = (rule?.conditions as Schedule['conditions']) || [];
    }
  }

  return schedules;
}
