import { reviewRevisionItemSchema } from '@pharmacy/contracts';
import { createZodDto } from '../../../common/validation/create-zod-dto';

export class ReviewRevisionItemDto extends createZodDto(reviewRevisionItemSchema) {}
