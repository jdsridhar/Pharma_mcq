import { listExamProfilesQuerySchema } from '@pharmacy/contracts';
import { createZodDto } from '../../../common/validation/create-zod-dto';

export class ListExamProfilesQueryDto extends createZodDto(listExamProfilesQuerySchema) {}
