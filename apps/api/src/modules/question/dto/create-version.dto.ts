import { createVersionSchema } from '@pharmacy/contracts';
import { createZodDto } from '../../../common/validation/create-zod-dto';

export class CreateVersionDto extends createZodDto(createVersionSchema) {}
