import { createExamBlueprintItemSchema } from '@pharmacy/contracts';
import { createZodDto } from '../../../common/validation/create-zod-dto';

export class CreateExamBlueprintItemDto extends createZodDto(createExamBlueprintItemSchema) {}
