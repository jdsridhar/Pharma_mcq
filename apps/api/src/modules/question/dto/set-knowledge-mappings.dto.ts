import { setKnowledgeMappingsSchema } from '@pharmacy/contracts';
import { createZodDto } from '../../../common/validation/create-zod-dto';

export class SetKnowledgeMappingsDto extends createZodDto(setKnowledgeMappingsSchema) {}
