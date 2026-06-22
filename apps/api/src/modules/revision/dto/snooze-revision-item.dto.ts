import { snoozeRevisionItemSchema } from '@pharmacy/contracts';
import { createZodDto } from '../../../common/validation/create-zod-dto';

export class SnoozeRevisionItemDto extends createZodDto(snoozeRevisionItemSchema) {}
