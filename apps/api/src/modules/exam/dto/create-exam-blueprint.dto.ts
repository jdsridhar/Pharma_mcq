import { createExamBlueprintSchema } from '@pharmacy/contracts';
import { createZodDto } from '../../../common/validation/create-zod-dto';

export class CreateExamBlueprintDto extends createZodDto(createExamBlueprintSchema) {}
