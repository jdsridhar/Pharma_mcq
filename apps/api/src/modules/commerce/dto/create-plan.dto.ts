import { createPlanSchema } from '@pharmacy/contracts';
import { createZodDto } from '../../../common/validation/create-zod-dto';

export class CreatePlanDto extends createZodDto(createPlanSchema) {}
