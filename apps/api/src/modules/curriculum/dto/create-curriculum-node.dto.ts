import { createCurriculumNodeSchema } from '@pharmacy/contracts';
import { createZodDto } from '../../../common/validation/create-zod-dto';

export class CreateCurriculumNodeDto extends createZodDto(createCurriculumNodeSchema) {}
