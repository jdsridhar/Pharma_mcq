import { listPracticeSessionsQuerySchema } from '@pharmacy/contracts';
import { createZodDto } from '../../../common/validation/create-zod-dto';

export class ListPracticeSessionsQueryDto extends createZodDto(listPracticeSessionsQuerySchema) {}
