import { setCurriculumMappingsSchema } from '@pharmacy/contracts';
import { createZodDto } from '../../../common/validation/create-zod-dto';

export class SetCurriculumMappingsDto extends createZodDto(setCurriculumMappingsSchema) {}
