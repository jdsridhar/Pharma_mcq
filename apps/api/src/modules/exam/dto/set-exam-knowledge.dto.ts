import { setExamKnowledgeSchema } from '@pharmacy/contracts';
import { createZodDto } from '../../../common/validation/create-zod-dto';

export class SetExamKnowledgeDto extends createZodDto(setExamKnowledgeSchema) {}
