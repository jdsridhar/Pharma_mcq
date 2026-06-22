import { updateQuestionMetaSchema } from '@pharmacy/contracts';
import { createZodDto } from '../../../common/validation/create-zod-dto';

export class UpdateQuestionMetaDto extends createZodDto(updateQuestionMetaSchema) {}
