import { studyPlanSchema } from '@pharmacy/contracts';
import { createZodDto } from '../../../common/validation/create-zod-dto';

export class StudyPlanDto extends createZodDto(studyPlanSchema) {}
