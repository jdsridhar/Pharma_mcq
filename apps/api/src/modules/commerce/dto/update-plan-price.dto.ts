import { updatePlanPriceSchema } from '@pharmacy/contracts';
import { createZodDto } from '../../../common/validation/create-zod-dto';

export class UpdatePlanPriceDto extends createZodDto(updatePlanPriceSchema) {}
