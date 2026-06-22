import { createKnowledgeNodeSchema } from '@pharmacy/contracts';
import { createZodDto } from '../../../common/validation/create-zod-dto';

export class CreateKnowledgeNodeDto extends createZodDto(createKnowledgeNodeSchema) {}
