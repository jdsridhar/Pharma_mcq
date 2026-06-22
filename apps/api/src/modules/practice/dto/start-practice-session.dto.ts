import { startPracticeSessionSchema } from '@pharmacy/contracts';
import { createZodDto } from '../../../common/validation/create-zod-dto';

export class StartPracticeSessionDto extends createZodDto(startPracticeSessionSchema) {}
