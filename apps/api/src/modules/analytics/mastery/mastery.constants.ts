/** Job name + payload for asynchronous mastery recomputation. */
export const MASTERY_RECOMPUTE_JOB = 'mastery.recompute';

export interface MasteryRecomputeJobData {
  userId: string;
}
