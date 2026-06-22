import { setMockTestQuestionsSchema } from '@pharmacy/contracts';
import { createZodDto } from '../../../common/validation/create-zod-dto';

export class SetMockTestQuestionsDto extends createZodDto(setMockTestQuestionsSchema) {}
