import { createPlanPriceSchema } from '@pharmacy/contracts';
import { createZodDto } from '../../../common/validation/create-zod-dto';

export class CreatePlanPriceDto extends createZodDto(createPlanPriceSchema) {}
