import { listUsersQuerySchema } from '@pharmacy/contracts';
import { createZodDto } from '../../../common/validation/create-zod-dto';

export class ListUsersQueryDto extends createZodDto(listUsersQuerySchema) {}
