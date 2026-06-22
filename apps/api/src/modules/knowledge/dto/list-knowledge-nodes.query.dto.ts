import { listKnowledgeNodesQuerySchema } from '@pharmacy/contracts';
import { createZodDto } from '../../../common/validation/create-zod-dto';

export class ListKnowledgeNodesQueryDto extends createZodDto(listKnowledgeNodesQuerySchema) {}
