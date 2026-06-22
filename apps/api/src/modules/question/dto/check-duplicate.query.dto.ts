import { checkDuplicateQuerySchema } from '@pharmacy/contracts';
import { createZodDto } from '../../../common/validation/create-zod-dto';

export class CheckDuplicateQueryDto extends createZodDto(checkDuplicateQuerySchema) {}
