import { submitPracticeAnswerSchema } from '@pharmacy/contracts';
import { createZodDto } from '../../../common/validation/create-zod-dto';

export class SubmitPracticeAnswerDto extends createZodDto(submitPracticeAnswerSchema) {}
