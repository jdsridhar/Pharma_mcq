import { listCurriculumsQuerySchema } from '@pharmacy/contracts';
import { createZodDto } from '../../../common/validation/create-zod-dto';

export class ListCurriculumsQueryDto extends createZodDto(listCurriculumsQuerySchema) {}
