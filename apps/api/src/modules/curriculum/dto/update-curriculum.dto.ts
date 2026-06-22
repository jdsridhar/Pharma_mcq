import { updateCurriculumSchema } from '@pharmacy/contracts';
import { createZodDto } from '../../../common/validation/create-zod-dto';

export class UpdateCurriculumDto extends createZodDto(updateCurriculumSchema) {}
