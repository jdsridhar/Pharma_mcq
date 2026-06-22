import { createKnowledgeEdgeSchema } from '@pharmacy/contracts';
import { createZodDto } from '../../../common/validation/create-zod-dto';

export class CreateKnowledgeEdgeDto extends createZodDto(createKnowledgeEdgeSchema) {}
