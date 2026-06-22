import { createExamProfileSchema } from '@pharmacy/contracts';
import { createZodDto } from '../../../common/validation/create-zod-dto';

export class CreateExamProfileDto extends createZodDto(createExamProfileSchema) {}
