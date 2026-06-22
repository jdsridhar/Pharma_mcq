import { updateCurriculumNodeSchema } from '@pharmacy/contracts';
import { createZodDto } from '../../../common/validation/create-zod-dto';

export class UpdateCurriculumNodeDto extends createZodDto(updateCurriculumNodeSchema) {}
