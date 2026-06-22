import { createCurriculumSchema } from '@pharmacy/contracts';
import { createZodDto } from '../../../common/validation/create-zod-dto';

export class CreateCurriculumDto extends createZodDto(createCurriculumSchema) {}
