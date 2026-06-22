import { updateExamBlueprintItemSchema } from '@pharmacy/contracts';
import { createZodDto } from '../../../common/validation/create-zod-dto';

export class UpdateExamBlueprintItemDto extends createZodDto(updateExamBlueprintItemSchema) {}
