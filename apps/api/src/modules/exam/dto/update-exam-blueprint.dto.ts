import { updateExamBlueprintSchema } from '@pharmacy/contracts';
import { createZodDto } from '../../../common/validation/create-zod-dto';

export class UpdateExamBlueprintDto extends createZodDto(updateExamBlueprintSchema) {}
