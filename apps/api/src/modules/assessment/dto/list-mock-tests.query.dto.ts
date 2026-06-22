import { listMockTestsQuerySchema } from '@pharmacy/contracts';
import { createZodDto } from '../../../common/validation/create-zod-dto';

export class ListMockTestsQueryDto extends createZodDto(listMockTestsQuerySchema) {}
