import { listTestSessionsQuerySchema } from '@pharmacy/contracts';
import { createZodDto } from '../../../common/validation/create-zod-dto';

export class ListTestSessionsQueryDto extends createZodDto(listTestSessionsQuerySchema) {}
