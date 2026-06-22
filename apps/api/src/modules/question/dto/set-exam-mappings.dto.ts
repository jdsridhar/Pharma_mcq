import { setExamMappingsSchema } from '@pharmacy/contracts';
import { createZodDto } from '../../../common/validation/create-zod-dto';

export class SetExamMappingsDto extends createZodDto(setExamMappingsSchema) {}
