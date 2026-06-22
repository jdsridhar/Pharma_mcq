import { generateFromWrongSchema } from '@pharmacy/contracts';
import { createZodDto } from '../../../common/validation/create-zod-dto';

export class GenerateFromWrongDto extends createZodDto(generateFromWrongSchema) {}
