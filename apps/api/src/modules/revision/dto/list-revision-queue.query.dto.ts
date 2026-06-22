import { listRevisionQueueQuerySchema } from '@pharmacy/contracts';
import { createZodDto } from '../../../common/validation/create-zod-dto';

export class ListRevisionQueueQueryDto extends createZodDto(listRevisionQueueQuerySchema) {}
