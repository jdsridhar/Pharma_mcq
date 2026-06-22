import { setPlanFeaturesSchema } from '@pharmacy/contracts';
import { createZodDto } from '../../../common/validation/create-zod-dto';

export class SetPlanFeaturesDto extends createZodDto(setPlanFeaturesSchema) {}
