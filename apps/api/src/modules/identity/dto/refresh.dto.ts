import { refreshSchema } from '@pharmacy/contracts';
import { createZodDto } from '../../../common/validation/create-zod-dto';

export class RefreshDto extends createZodDto(refreshSchema) {}
