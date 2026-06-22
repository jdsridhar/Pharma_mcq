import { addRevisionItemSchema } from '@pharmacy/contracts';
import { createZodDto } from '../../../common/validation/create-zod-dto';

export class AddRevisionItemDto extends createZodDto(addRevisionItemSchema) {}
