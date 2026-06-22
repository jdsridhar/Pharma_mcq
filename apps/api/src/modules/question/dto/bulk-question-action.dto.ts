import { bulkQuestionActionSchema } from '@pharmacy/contracts';
import { createZodDto } from '../../../common/validation/create-zod-dto';

export class BulkQuestionActionDto extends createZodDto(bulkQuestionActionSchema) {}
