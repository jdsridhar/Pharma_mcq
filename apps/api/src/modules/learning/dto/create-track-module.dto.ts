import { createTrackModuleSchema } from '@pharmacy/contracts';
import { createZodDto } from '../../../common/validation/create-zod-dto';

export class CreateTrackModuleDto extends createZodDto(createTrackModuleSchema) {}
