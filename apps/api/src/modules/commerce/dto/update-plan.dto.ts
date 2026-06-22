import { updatePlanSchema } from '@pharmacy/contracts';
import { createZodDto } from '../../../common/validation/create-zod-dto';

export class UpdatePlanDto extends createZodDto(updatePlanSchema) {}
