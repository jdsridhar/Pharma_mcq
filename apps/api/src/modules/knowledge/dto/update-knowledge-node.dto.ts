import { updateKnowledgeNodeSchema } from '@pharmacy/contracts';
import { createZodDto } from '../../../common/validation/create-zod-dto';

export class UpdateKnowledgeNodeDto extends createZodDto(updateKnowledgeNodeSchema) {}
