import { setTagsSchema } from '@pharmacy/contracts';
import { createZodDto } from '../../../common/validation/create-zod-dto';

export class SetTagsDto extends createZodDto(setTagsSchema) {}
