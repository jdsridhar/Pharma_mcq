import { updateExamProfileSchema } from '@pharmacy/contracts';
import { createZodDto } from '../../../common/validation/create-zod-dto';

export class UpdateExamProfileDto extends createZodDto(updateExamProfileSchema) {}
